#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
百宝箱 · 云同步服务器 v0.1
功能：短信验证码登录（内置演示模式）· Token 鉴权 · 收藏/设置云同步 · 简单限流 · CORS
依赖：仅 Python3 标准库（零 pip 依赖）

运行：python3 api.py          # 默认端口 8791
生产：
  1) 环境变量 DEV=0 关闭调试回显，并在 send_sms() 接入真实短信（阿里云/腾讯云）
  2) 建议 nginx/caddy 反代 + HTTPS；数据存 toolbox.db（SQLite），定期备份
"""
import base64, hashlib, hmac, json, os, re, sqlite3, secrets, shutil, subprocess, time, urllib.error, urllib.request
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, quote

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(BASE, 'toolbox.db')
STATIC_ROOT = os.path.normpath(os.path.join(BASE, '..'))   # 静态托管：App 根目录（server 的上级）
PORT = int(os.environ.get('PORT', '8791'))
HOST = os.environ.get('HOST', '0.0.0.0')   # 生产建议 127.0.0.1 + nginx 反代
DEV = os.environ.get('DEV', '1') == '1'      # 演示模式：验证码随响应返回（生产务必 0）
CODE_TTL = 300                                # 验证码有效期（秒）

# ---- 访问埋点 / 管理后台 ----
# ADMIN_KEY 为空时管理接口一律拒绝（安全兜底：宁可不可用，不可裸奔）
ADMIN_KEY = os.environ.get('ADMIN_KEY', '')
TRACK_LIMIT = 240                             # 单 IP 每分钟上报上限
# TRACK_RETENTION_DAYS = 0 表示不自动清理
TRACK_RETENTION_DAYS = int(os.environ.get('TRACK_RETENTION_DAYS', '0'))
print('[track] ADMIN_KEY=%s | 留存=%s天' % ('已配置' if ADMIN_KEY else '未配置（管理接口已关闭）',
                                          TRACK_RETENTION_DAYS or '永久'), flush=True)
TOKEN_TTL = 86400 * 30                        # 登录态 30 天
RATE_PHONE = 60                               # 同号发码间隔（秒）
RATE_IP_HOUR = 20                             # 同 IP 每小时发码上限
PHONE_RE = re.compile(r'^1[3-9]\d{9}$')
EMAIL_RE = re.compile(r'^[\w.+\-]+@[\w\-]+(\.[\w\-]+)+$')

def hash_password(pw):
    salt = secrets.token_hex(8)
    h = hashlib.pbkdf2_hmac('sha256', pw.encode(), salt.encode(), 120000)
    return 'pbkdf2$%s$%s' % (salt, h.hex())

def verify_password(pw, stored):
    try:
        parts = (stored or '').split('$')
        if len(parts) != 3 or parts[0] != 'pbkdf2':
            return False
        h = hashlib.pbkdf2_hmac('sha256', pw.encode(), parts[1].encode(), 120000)
        return h.hex() == parts[2]
    except Exception:
        return False

# ---- 简易 IP 限速（滑动窗口，内存态）----
_rate_buckets = {}

def rate_ok(ip, bucket, limit, window=60):
    t = time.time()
    dq = _rate_buckets.get((ip, bucket))
    if dq is None:
        dq = deque()
        _rate_buckets[(ip, bucket)] = dq
    while dq and dq[0] < t - window:
        dq.popleft()
    if len(dq) >= limit:
        return False
    dq.append(t)
    if len(_rate_buckets) > 8000:   # 防止内存膨胀
        stale = [k for k, v in _rate_buckets.items() if not v]
        for k in stale[:2000]:
            _rate_buckets.pop(k, None)
    return True

# ============================================================
# 访问埋点：真实 IP 提取 / 管理员鉴权
# ============================================================
def real_ip(headers, fallback):
    """反代后的真实来源 IP。nginx 已传 X-Forwarded-For，优先取最左侧。"""
    xff = headers.get('X-Forwarded-For') or ''
    if xff:
        first = xff.split(',')[0].strip()
        if first:
            return first[:45]
    xr = (headers.get('X-Real-IP') or '').strip()
    if xr:
        return xr[:45]
    return fallback or ''

def admin_ok(key):
    """管理后台口令校验（恒定时间比较，防空 ABA 侧信道）"""
    if not ADMIN_KEY or not key:
        return False
    return hmac.compare_digest(str(key), ADMIN_KEY)

# ============================================================
# 琉璃AI 统一账号对接（外接 /opt/liuli-account 账号服务）
#   - /api/auth/<action> 代理转发到账号服务
#   - 账号服务签发的 access token（HS256）可在本服务直接验证
# ============================================================
LIULI_API = os.environ.get('LIULI_API', 'http://127.0.0.1:8791')
LIULI_ENV = os.environ.get('LIULI_ENV', '/opt/liuli-account/.env')

def _load_liuli_secret():
    v = os.environ.get('LIULI_JWT_SECRET', '')
    if v:
        return v
    try:
        with open(LIULI_ENV, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                line = line.strip()
                if line.startswith('JWT_SECRET='):
                    return line.split('=', 1)[1].strip().strip('"').strip("'")
    except Exception as e:
        print('[liuli] 读取 %s 失败：%s' % (LIULI_ENV, e), flush=True)
    return ''

LIULI_SECRET = _load_liuli_secret()
print('[liuli] 账号服务=%s | 本地验签=%s' % (LIULI_API, '可用' if LIULI_SECRET else '不可用(将走远程校验)'), flush=True)

def _b64url_dec(s):
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))

def verify_liuli_jwt(token):
    """验证账号服务签发的 access token（HS256），返回 payload 或 None"""
    if not LIULI_SECRET:
        return None
    try:
        h, p, s = token.split('.')
        expect = hmac.new(LIULI_SECRET.encode(), (h + '.' + p).encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(_b64url_dec(s), expect):
            return None
        payload = json.loads(_b64url_dec(p))
        if payload.get('type') == 'refresh':
            return None
        exp = payload.get('exp')
        if exp and exp < time.time():
            return None
        if not payload.get('sub'):
            return None
        return payload
    except Exception:
        return None

_liuli_me_cache = {}

def liuli_fetch_user(token):
    """无共享密钥时的兜底：向账号服务确认 token 并取用户（60 秒缓存）"""
    c = _liuli_me_cache.get(token)
    if c and time.time() - c[0] < 60:
        return c[1]
    try:
        req = urllib.request.Request(LIULI_API + '/v1/me', headers={'Authorization': 'Bearer ' + token})
        resp = urllib.request.urlopen(req, timeout=5)
        j = json.loads(resp.read().decode('utf-8', 'replace'))
        resp.close()
        u = j.get('user') if isinstance(j, dict) else None
        if u:
            _liuli_me_cache[token] = (time.time(), u)
            return u
    except Exception:
        return None
    return None

def now(): return int(time.time())

def db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def init():
    conn = db()
    conn.executescript("""
      CREATE TABLE IF NOT EXISTS users(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT UNIQUE, name TEXT, created_at INTEGER);
      CREATE TABLE IF NOT EXISTS codes(
        phone TEXT PRIMARY KEY, code TEXT, expires INTEGER, sent_at INTEGER);
      CREATE TABLE IF NOT EXISTS tokens(
        token TEXT PRIMARY KEY, user_id INTEGER, expires INTEGER);
      CREATE TABLE IF NOT EXISTS sync_data(
        user_key TEXT PRIMARY KEY, favs TEXT, settings TEXT, updated_at INTEGER);
      CREATE TABLE IF NOT EXISTS ip_log(ip TEXT, ts INTEGER);
      CREATE TABLE IF NOT EXISTS tool_usage(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER, ip TEXT, user_key TEXT, user_from TEXT,
        tool_id TEXT, tool_name TEXT, action TEXT, dwell_ms INTEGER,
        ua TEXT, page TEXT);
      CREATE INDEX IF NOT EXISTS idx_usage_ts ON tool_usage(ts DESC);
      CREATE INDEX IF NOT EXISTS idx_usage_tool ON tool_usage(tool_id);
      CREATE INDEX IF NOT EXISTS idx_usage_ip ON tool_usage(ip);
    """)
    # 迁移：v0.6 增加 邮箱注册登录（老库自动升级）
    cols = [r[1] for r in conn.execute('PRAGMA table_info(users)').fetchall()]
    if 'email' not in cols:
        conn.execute('ALTER TABLE users ADD COLUMN email TEXT')
    if 'password_hash' not in cols:
        conn.execute('ALTER TABLE users ADD COLUMN password_hash TEXT')
    conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)')
    # 迁移：sync_data 主键改为文本 key（兼容琉璃AI 统一账号的 UUID）
    cols2 = [r[1] for r in conn.execute('PRAGMA table_info(sync_data)').fetchall()]
    if 'user_id' in cols2 and 'user_key' not in cols2:
        conn.execute('ALTER TABLE sync_data RENAME TO sync_data_old')
        conn.execute('CREATE TABLE sync_data(user_key TEXT PRIMARY KEY, favs TEXT, settings TEXT, updated_at INTEGER)')
        conn.execute("INSERT INTO sync_data(user_key, favs, settings, updated_at) SELECT 'u:' || user_id, favs, settings, updated_at FROM sync_data_old")
        conn.execute('DROP TABLE sync_data_old')
    conn.commit(); conn.close()

def send_sms(phone, code):
    """接入真实短信时改这里（阿里云 dysmsapi / 腾讯云 SMS SDK 均可）。"""
    print(f'[SMS] {phone} -> {code}', flush=True)

# ============================================================
# 视频解析模块：粘贴分享链接 → 解析出无水印视频直链 → 代理下载
# 支持：抖音（ttwid 自动注册）/ B站 / 快手（尽力） / yt-dlp 兜底（其他站点）
# ============================================================
UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'

_ttwid_cache = {'v': '', 'ts': 0}

def get_ttwid():
    """自动注册字节 ttwid（无需登录），缓存 20 小时"""
    if _ttwid_cache['v'] and time.time() - _ttwid_cache['ts'] < 20 * 3600:
        return _ttwid_cache['v']
    try:
        body = json.dumps({
            'region': 'cn', 'aid': 1768, 'needFid': False, 'service': 'www.ixigua.com',
            'migrate_info': {'ticket': '', 'source': 'node'},
            'cbUrlProtocol': 'https', 'union': True
        }).encode()
        req = urllib.request.Request('https://ttwid.bytedance.com/ttwid/union/register/', data=body,
                                     headers={'Content-Type': 'application/json', 'User-Agent': UA_MOBILE})
        resp = urllib.request.urlopen(req, timeout=12)
        for sc in (resp.headers.get_all('Set-Cookie') or []):
            m = re.search(r'ttwid=([^;]+)', sc)
            if m:
                _ttwid_cache['v'] = 'ttwid=' + m.group(1)
                _ttwid_cache['ts'] = time.time()
                break
    except Exception as e:
        print('[ttwid] fail:', e, flush=True)
    return _ttwid_cache['v']

def http_get(url, headers=None, timeout=15, max_bytes=3 * 1024 * 1024):
    h = {'User-Agent': UA_MOBILE}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    resp = urllib.request.urlopen(req, timeout=timeout)
    data = resp.read(max_bytes)
    final = resp.geturl()
    resp.close()
    return final, data

def _find_key(obj, key):
    if isinstance(obj, dict):
        if key in obj:
            return obj[key]
        for v in obj.values():
            r = _find_key(v, key)
            if r is not None:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = _find_key(v, key)
            if r is not None:
                return r
    return None

def _bad_host(url):
    """简单 SSRF 防护：禁止内网地址"""
    try:
        host = urlparse(url).hostname or ''
    except Exception:
        return True
    if host in ('localhost', '::1') or host.endswith('.local'):
        return True
    return bool(re.match(r'^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|0\.)', host))

def extract_url(text):
    text = (text or '').strip()
    m = re.search(r'https?://[^\s，。！？、）)\]】<>"]+', text)
    if m:
        return m.group(0).rstrip('.,;!)')
    return text if text.startswith('http') else ''

def parse_douyin(link):
    final, _ = http_get(link)
    m = re.search(r'(?:video|note|slides|share/video)/(\d{10,})', final) or re.search(r'(\d{15,})', final)
    if not m:
        m = re.search(r'(\d{15,})', link)
    if not m:
        return {'ok': False, 'error': '没能识别抖音视频 ID（请粘贴完整分享链接）'}
    vid = m.group(1)
    ttw = get_ttwid()
    hdr = {'Cookie': ttw} if ttw else {}
    _, page = http_get('https://www.iesdouyin.com/share/video/%s/' % vid, headers=hdr, max_bytes=4 * 1024 * 1024)
    html = page.decode('utf-8', 'replace')
    i = html.find('_ROUTER_DATA')
    if i < 0:
        return {'ok': False, 'error': '抖音页面数据缺失（稍后重试）'}
    s = html[i:]
    m2 = re.search(r'_ROUTER_DATA\s*=\s*', s)
    try:
        obj, _ = json.JSONDecoder().raw_decode(s[m2.end():])
    except Exception:
        return {'ok': False, 'error': '抖音数据解析失败'}
    vir = _find_key(obj, 'videoInfoRes') or {}
    items = vir.get('item_list') or []
    if not items:
        return {'ok': False, 'error': '没有取到视频信息（可能是图集或不支持的链接）'}
    it = items[0]
    v = it.get('video') or {}
    urls = ((v.get('play_addr') or {}).get('url_list') or [])
    if not urls:
        return {'ok': False, 'error': '没有取到视频直链'}
    u = urls[0].replace('/playwm/', '/play/')
    cover = (((v.get('cover') or {}).get('url_list')) or [''])[0]
    return {'ok': True, 'platform': 'douyin',
            'title': (it.get('desc') or '抖音视频')[:80],
            'author': ((it.get('author') or {}).get('nickname') or ''),
            'cover': cover, 'video': u, 'referer': 'https://www.douyin.com/',
            'watermark_free': '/play/' in u, 'duration': v.get('duration') or 0}

UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36'

_bili_cookie_cache = {'v': '', 'ts': 0}

def bili_cookies():
    """预热访问一次 B站主页拿游客 cookie（buvid3 等），提升接口稳定性"""
    if _bili_cookie_cache['v'] and time.time() - _bili_cookie_cache['ts'] < 3600:
        return _bili_cookie_cache['v']
    try:
        req = urllib.request.Request('https://www.bilibili.com/', headers={'User-Agent': UA_DESKTOP})
        resp = urllib.request.urlopen(req, timeout=10)
        resp.read(4096)
        sc = resp.headers.get_all('Set-Cookie') or []
        resp.close()
        pairs = []
        for c in sc:
            kv = c.split(';', 1)[0].strip()
            if '=' in kv:
                pairs.append(kv)
        _bili_cookie_cache['v'] = '; '.join(pairs[:8])
        _bili_cookie_cache['ts'] = time.time()
    except Exception as e:
        print('[bili-cookie] fail:', e, flush=True)
    return _bili_cookie_cache['v']

def _bili_get(url, tries=3):
    """B站 API 请求。
    注意：B站 WAF 对 python-urllib 的客户端指纹评分低（实测同一台服务器
    curl 能过、urllib 吃 412），因此优先走 curl 通道；无 curl 时回退 urllib。"""
    import urllib.error
    last_err = None
    for i in range(tries):
        try:
            if shutil.which('curl'):
                cmd = ['curl', '-s', '-m', '15', '-A', UA_DESKTOP,
                       '-H', 'Referer: https://www.bilibili.com/',
                       '-H', 'Accept: application/json, text/plain, */*',
                       '-H', 'Accept-Language: zh-CN,zh;q=0.9']
                ck = bili_cookies()
                if ck:
                    cmd += ['-H', 'Cookie: ' + ck]
                cmd += ['-w', '\n%{http_code}', url]
                out = subprocess.run(cmd, capture_output=True, timeout=25).stdout
                idx = out.rfind(b'\n')
                if idx > 0:
                    body, code = out[:idx], out[idx + 1:].strip()
                    if code == b'200':
                        return body
                    last_err = 'HTTP %s' % code.decode('utf-8', 'replace')
                else:
                    last_err = 'curl 无输出'
            else:
                hdrs = {'Referer': 'https://www.bilibili.com/', 'User-Agent': UA_DESKTOP,
                        'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'zh-CN,zh;q=0.9'}
                ck = bili_cookies()
                if ck:
                    hdrs['Cookie'] = ck
                resp = urllib.request.urlopen(urllib.request.Request(url, headers=hdrs), timeout=15)
                data = resp.read(3 * 1024 * 1024)
                resp.close()
                return data
        except urllib.error.HTTPError as e:
            last_err = 'HTTP %s' % e.code
        except Exception as e:
            last_err = str(e)[:80]
        time.sleep(1.2 * (i + 1))
    raise RuntimeError('B站接口请求失败：%s' % last_err)

def parse_bilibili(link):
    # 链接里能直接抠出 BV/av 号就不抓网页（B站 WAF 对 python-urllib 抓页面有风控）
    bvid = None
    avid = None
    m = re.search(r'(BV[0-9A-Za-z]{10})', link)
    if m:
        bvid = m.group(1)
    else:
        m2 = re.search(r'av(\d+)', link)
        if m2:
            avid = m2.group(1)
        else:
            # b23.tv 短链：走 curl 跟随跳转拿最终地址
            final = ''
            try:
                if shutil.which('curl'):
                    out = subprocess.run(['curl', '-s', '-L', '-o', '/dev/null', '-w', '%{url_effective}',
                                          '-m', '15', '-A', UA_DESKTOP, link],
                                         capture_output=True, timeout=25).stdout
                    final = out.decode('utf-8', 'replace').strip()
                else:
                    final, _ = http_get(link)
            except Exception:
                final = ''
            m3 = re.search(r'(BV[0-9A-Za-z]{10})', final)
            if m3:
                bvid = m3.group(1)
            else:
                m4 = re.search(r'av(\d+)', final)
                if not m4:
                    return {'ok': False, 'error': '没识别出 BV 号（请粘贴视频页链接）'}
                avid = m4.group(1)
    q = ('bvid=%s' % bvid) if bvid else ('aid=%s' % avid)
    data = _bili_get('https://api.bilibili.com/x/web-interface/view?' + q)
    j = json.loads(data.decode('utf-8', 'replace'))
    if j.get('code') != 0:
        return {'ok': False, 'error': 'B站接口：' + str(j.get('message'))[:80]}
    d = j['data']
    bvid = d.get('bvid') or bvid
    cid = d.get('cid')
    pdata = _bili_get('https://api.bilibili.com/x/player/playurl?bvid=%s&cid=%s&qn=64&fnval=1&platform=html5&high_quality=1' % (bvid, cid))
    pj = json.loads(pdata.decode('utf-8', 'replace'))
    durl = (pj.get('data') or {}).get('durl') or []
    if not durl:
        return {'ok': False, 'error': '没有取到视频流（可能是番剧/付费内容）'}
    return {'ok': True, 'platform': 'bilibili',
            'title': (d.get('title') or 'B站视频')[:80],
            'author': ((d.get('owner') or {}).get('name') or ''),
            'cover': d.get('pic') or '', 'video': durl[0].get('url'),
            'referer': 'https://www.bilibili.com/', 'watermark_free': True,
            'duration': (d.get('duration') or 0) * 1000}

def parse_kuaishou(link):
    final, _ = http_get(link)
    _, page = http_get(final, max_bytes=4 * 1024 * 1024)
    html = page.decode('utf-8', 'replace')
    i = html.find('__APOLLO_STATE__')
    if i < 0:
        return {'ok': False, 'error': '快手页面数据缺失（服务器网络可能受限）'}
    s = html[i:]
    m = re.search(r'__APOLLO_STATE__\s*=\s*', s)
    txt = s[m.end():]
    end = txt.find('</script>')
    if end > 0:
        txt = txt[:end]
    txt = re.sub(r'undefined', 'null', txt).rstrip().rstrip(';')
    try:
        obj, _ = json.JSONDecoder().raw_decode(txt)
    except Exception:
        return {'ok': False, 'error': '快手数据解析失败'}
    holder = {}
    def walk(o):
        if isinstance(o, dict):
            if 'photoUrl' in o or 'mainMvUrls' in o:
                holder.setdefault('cand', o)
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(obj)
    cand = holder.get('cand')
    if not cand:
        return {'ok': False, 'error': '没有取到快手视频信息'}
    u = cand.get('photoUrl')
    if not u and cand.get('mainMvUrls'):
        u = (cand['mainMvUrls'] or [{}])[0].get('url')
    if not u:
        return {'ok': False, 'error': '没有取到视频直链'}
    return {'ok': True, 'platform': 'kuaishou',
            'title': (cand.get('caption') or '快手视频')[:80],
            'author': '', 'cover': cand.get('coverUrl') or '', 'video': u,
            'referer': 'https://www.kuaishou.com/', 'watermark_free': True, 'duration': 0}

def parse_xiaohongshu(link):
    """小红书：尽力解析（服务端无登录态时可能被拦截，需要真实 xsec_token 链接）"""
    try:
        final, _ = http_get(link, max_bytes=2 * 1024 * 1024)
    except Exception as e:
        return {'ok': False, 'error': '小红书链接访问失败：' + str(e)[:80]}
    try:
        _, page = http_get(final, headers={'Referer': 'https://www.xiaohongshu.com/'}, max_bytes=4 * 1024 * 1024)
    except Exception as e:
        return {'ok': False, 'error': '小红书页面获取失败（可能被反爬拦截）'}
    html = page.decode('utf-8', 'replace').replace('\\u002F', '/').replace('\\/', '/')
    m = re.search(r'originVideoKey["\\:\s]+([A-Za-z0-9_/\-]{8,})', html)
    title = ''
    mt = re.search(r'"title"\s*:\s*"([^"]{2,80})"', html)
    if mt:
        title = mt.group(1)
    if m:
        u = 'https://sns-video-bd.xhscdn.com/' + m.group(1)
        return {'ok': True, 'platform': 'xiaohongshu', 'title': title or '小红书视频',
                'author': '', 'cover': '', 'video': u, 'referer': 'https://www.xiaohongshu.com/',
                'watermark_free': True, 'duration': 0}
    m2 = re.search(r'(?:masterUrl|backupUrls)["\s:\[]*"(https?://[^"\\]+)', html)
    if m2:
        return {'ok': True, 'platform': 'xiaohongshu', 'title': title or '小红书视频',
                'author': '', 'cover': '', 'video': m2.group(1), 'referer': 'https://www.xiaohongshu.com/',
                'watermark_free': True, 'duration': 0}
    return {'ok': False, 'error': '小红书页面被拦截或该帖为图文（把最新分享链接再试一次，或反馈给开发者适配）'}

def parse_ytdlp(link):
    exe = shutil.which('yt-dlp')
    cmd = ([exe] if exe else ['python3', '-m', 'yt_dlp']) + ['-J', '--no-warnings', '-f', 'b[ext=mp4]/b', link]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=90)
    except subprocess.TimeoutExpired:
        return {'ok': False, 'error': '解析超时（站点响应慢）'}
    except FileNotFoundError:
        return {'ok': False, 'error': '该站点暂不支持（可在服务器安装 yt-dlp 扩展支持）'}
    if proc.returncode != 0:
        err = (proc.stderr or b'').decode('utf-8', 'replace').strip().split('\n')[-1][:150]
        return {'ok': False, 'error': '解析失败：' + err}
    try:
        d = json.loads(proc.stdout.decode('utf-8', 'replace'))
    except Exception:
        return {'ok': False, 'error': '解析结果异常'}
    u = d.get('url') or ''
    if not u:
        for f in reversed(d.get('formats') or []):
            if f.get('url'):
                u = f['url']
                break
    if not u:
        return {'ok': False, 'error': '没有取到视频直链'}
    return {'ok': True, 'platform': (d.get('extractor_key') or 'video').lower(),
            'title': (d.get('title') or '')[:80], 'author': (d.get('uploader') or ''),
            'cover': d.get('thumbnail') or '', 'video': u, 'referer': '',
            'watermark_free': True, 'duration': (d.get('duration') or 0) * 1000}

def parse_video(text):
    link = extract_url(text)
    if not link:
        return {'ok': False, 'error': '没找到链接（把分享文案或链接整段粘贴进来即可）'}
    if _bad_host(link):
        return {'ok': False, 'error': '无效链接'}
    low = link.lower()
    if 'douyin' in low or 'iesdouyin' in low:
        return parse_douyin(link)
    if 'bilibili' in low or 'b23.tv' in low:
        return parse_bilibili(link)
    if 'kuaishou' in low or 'chenzhongtech' in low:
        return parse_kuaishou(link)
    if 'xiaohongshu' in low or 'xhslink' in low:
        return parse_xiaohongshu(link)
    return parse_ytdlp(link)

class H(BaseHTTPRequestHandler):
    server_version = 'ToolboxAPI'
    sys_version = ''   # 不暴露 Python 版本（降低指纹信息）

    def log_message(self, fmt, *args):
        print('[req]', fmt % args, flush=True)

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        self.send_header('Access-Control-Max-Age', '86400')

    def _json(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self._cors()
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        try:
            ln = int(self.headers.get('Content-Length') or 0)
            if ln > 65536: return None
            return json.loads(self.rfile.read(ln) or b'{}')
        except Exception:
            return None

    def _auth(self):
        """返回不透明的用户键：'u:<工具箱账号id>' 或 'l:<琉璃AI账号id>'；未登录返回 None"""
        h = self.headers.get('Authorization') or ''
        tok = h[7:].strip() if h.startswith('Bearer ') else ''
        if not tok:
            return None
        # 1) 工具箱自带 token（兼容旧账号）
        conn = db()
        row = conn.execute('SELECT user_id, expires FROM tokens WHERE token=?', (tok,)).fetchone()
        conn.close()
        if row and row['expires'] >= now():
            return 'u:%s' % row['user_id']
        # 2) 琉璃AI 统一账号 access token（本地验签，快）
        payload = verify_liuli_jwt(tok)
        if payload:
            return 'l:' + str(payload['sub'])
        # 3) 兜底：问账号服务（无共享密钥时）
        u = liuli_fetch_user(tok)
        if u:
            return 'l:' + str(u.get('id'))
        return None

    def _serve_static(self, path):
        """把上层目录（App 静态文件）直接托管 —— 同一个服务既是 API 又是站点。"""
        rel = (path or '/').lstrip('/') or 'index.html'
        full = os.path.normpath(os.path.join(STATIC_ROOT, rel))
        if not full.startswith(STATIC_ROOT):
            return False
        if os.path.isdir(full):
            full = os.path.join(full, 'index.html')
        if not os.path.isfile(full):
            return False
        types = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
                 '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
                 '.webmanifest': 'application/manifest+json; charset=utf-8',
                 '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
                 '.svg': 'image/svg+xml', '.apk': 'application/vnd.android.package-archive',
                 '.woff2': 'font/woff2'}
        ext = os.path.splitext(full)[1].lower()
        try:
            with open(full, 'rb') as f:
                data = f.read()
        except OSError:
            return False
        self.send_response(200)
        self.send_header('Content-Type', types.get(ext, 'application/octet-stream'))
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-cache')
        self._cors()
        self.end_headers()
        self.wfile.write(data)
        return True

    def _liuli_proxy(self, action):
        """把 /api/auth/<action> 原样转发给琉璃AI 账号服务"""
        if action not in ('email-codes', 'register', 'login', 'refresh', 'logout', 'password-reset'):
            return self._json({'ok': False, 'error': 'not found'}, 404)
        try:
            ln = int(self.headers.get('Content-Length') or 0)
            if ln > 65536:
                return self._json({'ok': False, 'error': '请求体过大'}, 413)
            body = self.rfile.read(ln) if ln > 0 else b'{}'
        except Exception:
            body = b'{}'
        headers = {'Content-Type': 'application/json', 'User-Agent': 'toolbox-proxy'}
        auth = self.headers.get('Authorization')
        if auth:
            headers['Authorization'] = auth
        try:
            req = urllib.request.Request(LIULI_API + '/v1/auth/' + action, data=body, headers=headers, method='POST')
            resp = urllib.request.urlopen(req, timeout=20)
            data = resp.read(131072)
            code = resp.status
        except urllib.error.HTTPError as e:
            data = e.read(131072)
            code = e.code
        except Exception as e:
            return self._json({'ok': False, 'error': '账号服务不可用：' + str(e)[:80]}, 502)
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self._cors()
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _disp(self, filename):
        keep = re.sub(r'[^\w.\-\u4e00-\u9fa5]', '', filename)[:60] or 'file'
        ascii_name = re.sub(r'[^A-Za-z0-9.\-_]', '_', keep)[:60] or 'file'
        return 'attachment; filename="%s"; filename*=UTF-8\'\'%s' % (ascii_name, quote(keep))

    def _extract_audio(self):
        """解析出的视频直链 → 服务器 ffmpeg 提取音频（m4a 原声 / mp3）"""
        if not shutil.which('ffmpeg'):
            return self._json({'ok': False, 'error': '服务器未安装 ffmpeg（apk add ffmpeg / apt install ffmpeg）'}, 501)
        qs2 = parse_qs(urlparse(self.path).query)
        target = (qs2.get('url') or [''])[0].strip()
        referer = (qs2.get('referer') or [''])[0].strip()
        fmt = ((qs2.get('format') or ['m4a'])[0].strip().lower())
        name = (qs2.get('name') or ['audio'])[0].strip()
        if not target.startswith(('http://', 'https://')):
            return self._json({'ok': False, 'error': '无效地址'}, 400)
        if _bad_host(target):
            return self._json({'ok': False, 'error': '禁止访问内网地址'}, 403)
        import tempfile
        tmpdir = tempfile.mkdtemp(prefix='tbaudio_')
        try:
            src = os.path.join(tmpdir, 'in.mp4')
            headers = {'User-Agent': UA_MOBILE}
            if referer:
                headers['Referer'] = referer
            resp = urllib.request.urlopen(urllib.request.Request(target, headers=headers), timeout=30)
            total = 0
            with open(src, 'wb') as f:
                while True:
                    chunk = resp.read(1 << 16)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > 500 * 1024 * 1024:
                        resp.close()
                        return self._json({'ok': False, 'error': '视频过大（>500MB），建议下载视频后本地处理'}, 413)
                    f.write(chunk)
            resp.close()
            out = os.path.join(tmpdir, 'out.m4a' if fmt != 'mp3' else 'out.mp3')
            if fmt == 'mp3':
                cmd = ['ffmpeg', '-y', '-i', src, '-vn', '-c:a', 'libmp3lame', '-q:a', '3', out]
            else:
                cmd = ['ffmpeg', '-y', '-i', src, '-vn', '-c:a', 'copy', out]
            proc = subprocess.run(cmd, capture_output=True, timeout=300)
            if proc.returncode != 0 and fmt != 'mp3':
                out = os.path.join(tmpdir, 'out.mp3')
                proc = subprocess.run(['ffmpeg', '-y', '-i', src, '-vn', '-c:a', 'libmp3lame', '-q:a', '3', out],
                                      capture_output=True, timeout=300)
                fmt = 'mp3'
            if proc.returncode != 0 or not os.path.exists(out):
                return self._json({'ok': False, 'error': '音频提取失败（可能是纯画面/无音轨）'}, 502)
            with open(out, 'rb') as f:
                data = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'audio/mp4' if fmt != 'mp3' else 'audio/mpeg')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Content-Disposition', self._disp(name + ('.m4a' if fmt != 'mp3' else '.mp3')))
            self._cors()
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            try:
                return self._json({'ok': False, 'error': '提取失败：' + str(e)[:100]}, 502)
            except Exception:
                pass
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    def _track(self):
        """记录访客行为：来源 IP / 登录账号 / 使用的工具 / 停留时长。
        设计为「尽力而为」——埋点失败绝不影响用户正常使用。"""
        ip = real_ip(self.headers, self.client_address[0])
        if not rate_ok(ip, 'track', TRACK_LIMIT):
            return self._json({'ok': False, 'error': 'rate_limited'}, 429)

        b = self._body() or {}
        tool_id   = str(b.get('tool', ''))[:40].strip()
        tool_name = str(b.get('name', ''))[:60].strip()
        action    = str(b.get('action', ''))[:16].strip()
        if action not in ('open', 'dwell'):
            action = 'open'
        try:
            dwell = int(b.get('dwell', 0) or 0)
        except Exception:
            dwell = 0
        dwell = max(0, min(dwell, 3600000))

        # 关联登录账号（未登录也记录，user_from 标记为 anon/local）
        user_key, user_from = '', 'anon'
        try:
            uid = self._auth()
        except Exception:
            uid = None
        if uid and uid.startswith('l:'):
            tok = (self.headers.get('Authorization') or '')[7:].strip()
            pl = verify_liuli_jwt(tok)
            if not pl:
                try:
                    pl = liuli_fetch_user(tok) or {}
                except Exception:
                    pl = {}
            user_key = str((pl or {}).get('email') or '')[:80]
            user_from = 'liuli'
        elif uid:
            try:
                conn = db()
                u = conn.execute('SELECT phone, email FROM users WHERE id=?', (uid[2:],)).fetchone()
                conn.close()
                if u:
                    user_key = str(u['email'] or u['phone'] or '')[:80]
            except Exception:
                pass
            user_from = 'toolbox'
        if not user_key:
            s = str(b.get('user', ''))[:80].strip()
            if s:
                user_key, user_from = s, 'local'

        ua   = (self.headers.get('User-Agent') or '')[:200]
        page = str(b.get('page', ''))[:200].strip()
        try:
            conn = db()
            conn.execute('INSERT INTO tool_usage(ts, ip, user_key, user_from, tool_id, tool_name,'
                         ' action, dwell_ms, ua, page) VALUES(?,?,?,?,?,?,?,?,?,?)',
                         (now(), ip, user_key, user_from, tool_id, tool_name, action, dwell, ua, page))
            if TRACK_RETENTION_DAYS > 0:
                conn.execute('DELETE FROM tool_usage WHERE ts<?', (now() - TRACK_RETENTION_DAYS * 86400,))
            conn.commit()
            conn.close()
        except Exception as e:
            print('[track] 写入失败：%s' % e, flush=True)
            return self._json({'ok': False, 'error': 'track failed'}, 500)
        return self._json({'ok': True})

    def _ocr(self):
        """图片 → 文字（服务器 tesseract，中文+英文）"""
        if not shutil.which('tesseract'):
            return self._json({'ok': False, 'error': '服务器未安装 tesseract（apk add tesseract-ocr tesseract-ocr-data-chi_sim tesseract-ocr-data-eng）'}, 501)
        try:
            ln = int(self.headers.get('Content-Length') or 0)
        except Exception:
            ln = 0
        if ln <= 0 or ln > 20 * 1024 * 1024:
            return self._json({'ok': False, 'error': '图片缺失或过大（上限 20MB）'}, 413)
        data = self.rfile.read(ln)
        import tempfile
        tmpdir = tempfile.mkdtemp(prefix='tbocr_')
        try:
            img = os.path.join(tmpdir, 'in.png')
            with open(img, 'wb') as f:
                f.write(data)
            proc = subprocess.run(['tesseract', img, 'stdout', '-l', 'chi_sim+eng', '--psm', '3'],
                                  capture_output=True, timeout=60)
            if proc.returncode != 0:
                return self._json({'ok': False, 'error': 'OCR 失败：' + (proc.stderr or b'').decode('utf-8', 'replace')[:100]}, 502)
            text = proc.stdout.decode('utf-8', 'replace')
            # tesseract 的中文识别会在字间插空格，并且偶有重复空行 —— 清理一下
            text = re.sub(r'(?<=[\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])', '', text)
            text = re.sub(r'\n{3,}', '\n\n', text)
            return self._json({'ok': True, 'text': text, 'chars': len(text.strip())})
        except subprocess.TimeoutExpired:
            return self._json({'ok': False, 'error': 'OCR 超时（图片过大或太复杂）'}, 504)
        except Exception as e:
            return self._json({'ok': False, 'error': 'OCR 异常：' + str(e)[:100]}, 502)
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    def _proxy_video(self):
        """把上游视频流通过本服务器中转（解决跨域与防盗链），浏览器可直接保存。"""
        qs2 = parse_qs(urlparse(self.path).query)
        target = (qs2.get('url') or [''])[0].strip()
        name = (qs2.get('name') or ['video.mp4'])[0].strip() or 'video.mp4'
        referer = (qs2.get('referer') or [''])[0].strip()
        if not target.startswith(('http://', 'https://')):
            return self._json({'ok': False, 'error': '无效地址'}, 400)
        if _bad_host(target):
            return self._json({'ok': False, 'error': '禁止访问内网地址'}, 403)
        headers = {'User-Agent': UA_MOBILE}
        if referer:
            headers['Referer'] = referer
        try:
            req = urllib.request.Request(target, headers=headers)
            resp = urllib.request.urlopen(req, timeout=30)
        except Exception as e:
            return self._json({'ok': False, 'error': '获取视频失败：' + str(e)[:100]}, 502)
        try:
            self.send_response(200)
            self.send_header('Content-Type', resp.headers.get('Content-Type') or 'video/mp4')
            cl = resp.headers.get('Content-Length')
            if cl:
                self.send_header('Content-Length', cl)
            keep = re.sub(r'[^\w.\-\u4e00-\u9fa5]', '', name)[:60] or 'video.mp4'
            ascii_name = re.sub(r'[^A-Za-z0-9.\-_]', '_', keep)[:60] or 'video.mp4'
            self.send_header('Content-Disposition',
                             'attachment; filename="%s"; filename*=UTF-8\'\'%s' % (ascii_name, quote(keep)))
            self._cors()
            self.end_headers()
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            try:
                resp.close()
            except Exception:
                pass

    def do_HEAD(self):
        """静态文件 HEAD（下载页用它探测 APK 是否已就绪）"""
        p = self.path.split('?')[0]
        rel = (p or '/').lstrip('/') or 'index.html'
        full = os.path.normpath(os.path.join(STATIC_ROOT, rel))
        if os.path.isdir(full):
            full = os.path.join(full, 'index.html')
        if not full.startswith(STATIC_ROOT) or not os.path.isfile(full):
            self.send_response(404); self._cors(); self.end_headers()
            return
        ext = os.path.splitext(full)[1].lower()
        types = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
                 '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
                 '.webmanifest': 'application/manifest+json; charset=utf-8',
                 '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
                 '.svg': 'image/svg+xml', '.apk': 'application/vnd.android.package-archive',
                 '.woff2': 'font/woff2'}
        self.send_response(200)
        self.send_header('Content-Type', types.get(ext, 'application/octet-stream'))
        self.send_header('Content-Length', str(os.path.getsize(full)))
        self.send_header('Cache-Control', 'no-cache')
        self._cors()
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_GET(self):
        p = self.path.split('?')[0]
        ip = self.client_address[0]
        _lim = None
        if p == '/api/video/parse':
            _lim = ('media', 30)
        elif p in ('/api/video/dl', '/api/video/audio'):
            _lim = ('dl', 20)
        if _lim and not rate_ok(ip, _lim[0], _lim[1]):
            return self._json({'ok': False, 'error': '请求过于频繁，请稍后再试'}, 429)
        if p == '/api/health':
            return self._json({'ok': True, 'ts': now(), 'dev': DEV})
        if p == '/api/me':
            uid = self._auth()
            if not uid:
                return self._json({'ok': False, 'error': 'unauthorized'}, 401)
            if uid.startswith('l:'):
                # 琉璃AI 统一账号
                h2 = self.headers.get('Authorization') or ''
                tok = h2[7:].strip()
                payload = verify_liuli_jwt(tok)
                if not payload:
                    u2 = liuli_fetch_user(tok)
                    payload = {'sub': (u2 or {}).get('id'), 'email': (u2 or {}).get('email', ''), 'role': (u2 or {}).get('role', '')}
                email = payload.get('email') or ''
                uname = email.split('@')[0] if email else '琉璃AI 用户'
                return self._json({'ok': True, 'user': {'id': payload.get('sub'), 'phone': '', 'name': uname,
                                                        'email': email, 'role': payload.get('role') or 'user',
                                                        'from': 'liuli'}})
            conn = db()
            u = conn.execute('SELECT id, phone, name, email FROM users WHERE id=?', (uid[2:],)).fetchone()
            conn.close()
            if not u:
                return self._json({'ok': False, 'error': 'unauthorized'}, 401)
            return self._json({'ok': True, 'user': {'id': u['id'], 'phone': u['phone'] or '', 'name': u['name'],
                                                    'email': u['email'] or '', 'from': 'toolbox'}})
        if p == '/api/sync':
            uid = self._auth()
            if not uid: return self._json({'ok': False, 'error': 'unauthorized'}, 401)
            conn = db()
            row = conn.execute('SELECT favs, settings, updated_at FROM sync_data WHERE user_key=?', (uid,)).fetchone()
            conn.close()
            return self._json({'ok': True,
                'favs': json.loads(row['favs']) if row else [],
                'settings': json.loads(row['settings']) if row else {},
                'updated_at': row['updated_at'] if row else 0})
        if p == '/api/video/parse':
            qs2 = parse_qs(urlparse(self.path).query)
            link = (qs2.get('url') or [''])[0].strip()
            if not link:
                return self._json({'ok': False, 'error': '缺少 url 参数'}, 400)
            try:
                r = parse_video(link)
            except Exception as e:
                r = {'ok': False, 'error': '解析异常：' + str(e)[:120]}
            return self._json(r)
        if p == '/api/video/dl':
            return self._proxy_video()
        if p == '/api/video/audio':
            return self._extract_audio()

        # ================= 管理后台：工具使用记录 =================
        if p in ('/api/admin/usage', '/api/admin/stats'):
            q2 = parse_qs(urlparse(self.path).query)
            if not admin_ok((q2.get('key') or [''])[0]):
                return self._json({'ok': False, 'error': 'unauthorized'}, 401)

            if p == '/api/admin/usage':
                try:    limit = min(int((q2.get('limit') or ['50'])[0]), 200)
                except Exception: limit = 50
                try:    offset = max(int((q2.get('offset') or ['0'])[0]), 0)
                except Exception: offset = 0
                tool = (q2.get('tool') or [''])[0].strip()
                act  = (q2.get('action') or [''])[0].strip()
                kw   = (q2.get('q') or [''])[0].strip()
                where, args = [], []
                if tool:
                    where.append('tool_id=?'); args.append(tool)
                if act in ('open', 'dwell'):
                    where.append('action=?'); args.append(act)
                if kw:
                    where.append('(ip LIKE ? OR user_key LIKE ? OR tool_name LIKE ?)')
                    args += ['%' + kw + '%', '%' + kw + '%', '%' + kw + '%']
                w = (' WHERE ' + ' AND '.join(where)) if where else ''
                conn = db()
                total = conn.execute('SELECT COUNT(*) c FROM tool_usage' + w, args).fetchone()['c']
                rows = conn.execute('SELECT id, ts, ip, user_key, user_from, tool_id, tool_name,'
                                    ' action, dwell_ms, page FROM tool_usage' + w +
                                    ' ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?',
                                    args + [limit, offset]).fetchall()
                conn.close()
                return self._json({'ok': True, 'total': total, 'limit': limit, 'offset': offset,
                                   'items': [dict(r) for r in rows]})

            # ---- 汇总统计 ----
            try:    days = min(int((q2.get('days') or ['7'])[0]), 90)
            except Exception: days = 7
            day0 = int(time.mktime(time.strptime(time.strftime('%Y-%m-%d'), '%Y-%m-%d')))
            since = day0 - (days - 1) * 86400
            conn = db()
            total      = conn.execute('SELECT COUNT(*) c FROM tool_usage').fetchone()['c']
            total_ip   = conn.execute('SELECT COUNT(DISTINCT ip) c FROM tool_usage').fetchone()['c']
            today      = conn.execute('SELECT COUNT(*) c FROM tool_usage WHERE ts>=?', (day0,)).fetchone()['c']
            today_ip   = conn.execute('SELECT COUNT(DISTINCT ip) c FROM tool_usage WHERE ts>=?', (day0,)).fetchone()['c']
            tool_rank  = conn.execute('SELECT tool_id, tool_name, COUNT(*) c, COUNT(DISTINCT ip) u'
                                      ' FROM tool_usage WHERE action="open" AND tool_id<>""'
                                      ' GROUP BY tool_id ORDER BY c DESC LIMIT 20').fetchall()
            ip_rank    = conn.execute('SELECT ip, COUNT(*) c, MAX(ts) lt, MAX(user_key) uk'
                                      ' FROM tool_usage GROUP BY ip ORDER BY lt DESC LIMIT 30').fetchall()
            daily      = conn.execute('SELECT (ts - ?) / 86400 d, COUNT(*) c, COUNT(DISTINCT ip) u'
                                      ' FROM tool_usage WHERE ts>=? GROUP BY d ORDER BY d',
                                      (since, since)).fetchall()
            avg_dwell  = conn.execute('SELECT AVG(dwell_ms) a FROM tool_usage'
                                      ' WHERE action="dwell" AND dwell_ms>0 AND dwell_ms<3600000').fetchone()['a']
            logged     = conn.execute("SELECT COUNT(*) c FROM tool_usage"
                                      " WHERE user_key<>'' AND user_key IS NOT NULL").fetchone()['c']
            conn.close()
            day_map = {}
            for i in range(days):
                day_map[day0 - (days - 1 - i) * 86400] = {'pv': 0, 'uv': 0}
            for r in daily:
                k = since + r['d'] * 86400
                if k in day_map:
                    day_map[k] = {'pv': r['c'], 'uv': r['u']}
            return self._json({'ok': True,
                'total': total, 'total_ip': total_ip, 'today': today, 'today_ip': today_ip,
                'logged': logged, 'avg_dwell': int(avg_dwell or 0),
                'tool_rank': [dict(r) for r in tool_rank],
                'ip_rank': [dict(r) for r in ip_rank],
                'daily': [{'ts': k, 'pv': v['pv'], 'uv': v['uv']} for k, v in sorted(day_map.items())]})

        if self._serve_static(p):
            return
        return self._json({'ok': False, 'error': 'not found'}, 404)

    def do_POST(self):
        p = self.path.split('?')[0]
        ip = self.client_address[0]
        _lim = None
        if p.startswith('/api/auth/'):
            _lim = ('authproxy', 40)
        elif p in ('/api/login', '/api/login_email', '/api/register', '/api/send_code', '/api/bind_phone', '/api/bind_email'):
            _lim = ('authlegacy', 20)
        elif p == '/api/ocr':
            _lim = ('ocr', 20)
        if _lim and not rate_ok(ip, _lim[0], _lim[1]):
            return self._json({'ok': False, 'error': '请求过于频繁，请稍后再试'}, 429)
        if p == '/api/track':
            return self._track()
        if p == '/api/ocr':
            return self._ocr()
        if p.startswith('/api/auth/'):
            return self._liuli_proxy(p[len('/api/auth/'):])
        if p == '/api/register':
            b = self._body()
            if not b:
                return self._json({'ok': False, 'error': 'bad request'}, 400)
            email = str(b.get('email', '')).strip().lower()
            pw = str(b.get('password', ''))
            phone = str(b.get('phone', '')).strip()
            code = str(b.get('code', '')).strip()
            if not EMAIL_RE.match(email):
                return self._json({'ok': False, 'error': '邮箱格式不正确'}, 400)
            if len(pw) < 6:
                return self._json({'ok': False, 'error': '密码至少 6 位'}, 400)
            conn = db()
            if conn.execute('SELECT id FROM users WHERE email=?', (email,)).fetchone():
                conn.close()
                return self._json({'ok': False, 'error': '该邮箱已注册，直接登录吧'}, 409)
            if phone:
                if not PHONE_RE.match(phone):
                    conn.close()
                    return self._json({'ok': False, 'error': '手机号格式不正确'}, 400)
                row = conn.execute('SELECT code, expires FROM codes WHERE phone=?', (phone,)).fetchone()
                if not row or row['expires'] < now() or row['code'] != code:
                    conn.close()
                    return self._json({'ok': False, 'error': '短信验证码错误或已过期'}, 401)
                if conn.execute('SELECT id FROM users WHERE phone=?', (phone,)).fetchone():
                    conn.close()
                    return self._json({'ok': False, 'error': '该手机号已有账号，请用手机号登录后在「我的」里绑定邮箱'}, 409)
                conn.execute('DELETE FROM codes WHERE phone=?', (phone,))
            uname = '用户' + (email.split('@')[0][:12] or '新人')
            cur = conn.execute('INSERT INTO users(phone, name, created_at, email, password_hash) VALUES(?,?,?,?,?)',
                               (phone or None, uname, now(), email, hash_password(pw)))
            uid = cur.lastrowid
            token = secrets.token_hex(24)
            conn.execute('INSERT INTO tokens(token,user_id,expires) VALUES(?,?,?)', (token, uid, now() + TOKEN_TTL))
            conn.commit()
            conn.close()
            return self._json({'ok': True, 'token': token,
                               'user': {'id': uid, 'phone': phone or '', 'name': uname, 'email': email}})
        if p == '/api/login_email':
            b = self._body()
            if not b:
                return self._json({'ok': False, 'error': 'bad request'}, 400)
            email = str(b.get('email', '')).strip().lower()
            pw = str(b.get('password', ''))
            conn = db()
            u = conn.execute('SELECT id, phone, name, email, password_hash FROM users WHERE email=?', (email,)).fetchone()
            if not u or not u['password_hash'] or not verify_password(pw, u['password_hash']):
                conn.close()
                return self._json({'ok': False, 'error': '邮箱或密码错误'}, 401)
            token = secrets.token_hex(24)
            conn.execute('INSERT INTO tokens(token,user_id,expires) VALUES(?,?,?)', (token, u['id'], now() + TOKEN_TTL))
            conn.commit()
            conn.close()
            return self._json({'ok': True, 'token': token,
                               'user': {'id': u['id'], 'phone': u['phone'] or '', 'name': u['name'], 'email': u['email'] or ''}})
        if p == '/api/bind_phone':
            uid = self._auth()
            if not uid:
                return self._json({'ok': False, 'error': 'unauthorized'}, 401)
            if uid.startswith('l:'):
                return self._json({'ok': False, 'error': '琉璃AI 统一账号暂不在此处绑定手机'}, 400)
            b = self._body() or {}
            phone = str(b.get('phone', '')).strip()
            code = str(b.get('code', '')).strip()
            if not PHONE_RE.match(phone):
                return self._json({'ok': False, 'error': '手机号格式不正确'}, 400)
            conn = db()
            row = conn.execute('SELECT code, expires FROM codes WHERE phone=?', (phone,)).fetchone()
            if not row or row['expires'] < now() or row['code'] != code:
                conn.close()
                return self._json({'ok': False, 'error': '验证码错误或已过期'}, 401)
            if conn.execute('SELECT id FROM users WHERE phone=? AND id<>?', (phone, uid)).fetchone():
                conn.close()
                return self._json({'ok': False, 'error': '该手机号已被其他账号绑定'}, 409)
            conn.execute('DELETE FROM codes WHERE phone=?', (phone,))
            conn.execute('UPDATE users SET phone=? WHERE id=?', (phone, uid))
            conn.commit()
            conn.close()
            return self._json({'ok': True, 'phone': phone})
        if p == '/api/bind_email':
            uid = self._auth()
            if not uid:
                return self._json({'ok': False, 'error': 'unauthorized'}, 401)
            if uid.startswith('l:'):
                return self._json({'ok': False, 'error': '琉璃AI 统一账号请到账号中心修改邮箱'}, 400)
            b = self._body() or {}
            email = str(b.get('email', '')).strip().lower()
            pw = str(b.get('password', ''))
            if not EMAIL_RE.match(email):
                return self._json({'ok': False, 'error': '邮箱格式不正确'}, 400)
            if len(pw) < 6:
                return self._json({'ok': False, 'error': '密码至少 6 位'}, 400)
            conn = db()
            if conn.execute('SELECT id FROM users WHERE email=? AND id<>?', (email, uid)).fetchone():
                conn.close()
                return self._json({'ok': False, 'error': '该邮箱已被其他账号使用'}, 409)
            conn.execute('UPDATE users SET email=?, password_hash=? WHERE id=?', (email, hash_password(pw), uid))
            conn.commit()
            conn.close()
            return self._json({'ok': True, 'email': email})
        if p == '/api/send_code':
            b = self._body()
            if not b: return self._json({'ok': False, 'error': 'bad request'}, 400)
            phone = str(b.get('phone', '')).strip()
            if not PHONE_RE.match(phone):
                return self._json({'ok': False, 'error': '手机号格式不正确'}, 400)
            ip = self.client_address[0]
            conn = db()
            row = conn.execute('SELECT sent_at FROM codes WHERE phone=?', (phone,)).fetchone()
            if row and now() - row['sent_at'] < RATE_PHONE:
                conn.close()
                return self._json({'ok': False, 'error': '发送太频繁，请稍后再试'}, 429)
            conn.execute('DELETE FROM ip_log WHERE ts < ?', (now() - 3600,))
            cnt = conn.execute('SELECT COUNT(*) c FROM ip_log WHERE ip=?', (ip,)).fetchone()['c']
            if cnt >= RATE_IP_HOUR:
                conn.close()
                return self._json({'ok': False, 'error': '操作过于频繁'}, 429)
            conn.execute('INSERT INTO ip_log VALUES (?,?)', (ip, now()))
            code = ''.join(secrets.choice('0123456789') for _ in range(6))
            conn.execute('INSERT INTO codes(phone,code,expires,sent_at) VALUES(?,?,?,?) '
                         'ON CONFLICT(phone) DO UPDATE SET code=?, expires=?, sent_at=?',
                         (phone, code, now() + CODE_TTL, now(), code, now() + CODE_TTL, now()))
            conn.commit(); conn.close()
            send_sms(phone, code)
            resp = {'ok': True, 'msg': '验证码已发送', 'ttl': CODE_TTL}
            if DEV: resp['dev_code'] = code
            return self._json(resp)
        if p == '/api/login':
            b = self._body()
            if not b: return self._json({'ok': False, 'error': 'bad request'}, 400)
            phone = str(b.get('phone', '')).strip()
            code = str(b.get('code', '')).strip()
            conn = db()
            row = conn.execute('SELECT code, expires FROM codes WHERE phone=?', (phone,)).fetchone()
            if not row or row['expires'] < now() or row['code'] != code:
                conn.close()
                return self._json({'ok': False, 'error': '验证码错误或已过期'}, 401)
            conn.execute('DELETE FROM codes WHERE phone=?', (phone,))
            u = conn.execute('SELECT id, name, email FROM users WHERE phone=?', (phone,)).fetchone()
            if u:
                uid, name, email = u['id'], u['name'], (u['email'] or '')
            else:
                name = '用户' + phone[-4:]
                email = ''
                cur = conn.execute('INSERT INTO users(phone,name,created_at) VALUES(?,?,?)', (phone, name, now()))
                uid = cur.lastrowid
            token = secrets.token_hex(24)
            conn.execute('INSERT INTO tokens(token,user_id,expires) VALUES(?,?,?)', (token, uid, now() + TOKEN_TTL))
            conn.commit(); conn.close()
            return self._json({'ok': True, 'token': token, 'user': {'id': uid, 'phone': phone, 'name': name, 'email': email}})
        if p == '/api/logout':
            h = self.headers.get('Authorization') or ''
            tok = h[7:].strip() if h.startswith('Bearer ') else ''
            conn = db(); conn.execute('DELETE FROM tokens WHERE token=?', (tok,)); conn.commit(); conn.close()
            return self._json({'ok': True})
        if p == '/api/sync':
            uid = self._auth()
            if not uid: return self._json({'ok': False, 'error': 'unauthorized'}, 401)
            b = self._body() or {}
            favs = b.get('favs', [])
            settings = b.get('settings', {})
            if not isinstance(favs, list): favs = []
            if not isinstance(settings, dict): settings = {}
            favs = [str(x)[:40] for x in favs[:200]]
            settings = {str(k)[:40]: v for k, v in list(settings.items())[:50]}
            conn = db()
            conn.execute('INSERT INTO sync_data(user_key,favs,settings,updated_at) VALUES(?,?,?,?) '
                         'ON CONFLICT(user_key) DO UPDATE SET favs=?, settings=?, updated_at=?',
                         (uid, json.dumps(favs, ensure_ascii=False), json.dumps(settings, ensure_ascii=False), now(),
                          json.dumps(favs, ensure_ascii=False), json.dumps(settings, ensure_ascii=False), now()))
            conn.commit(); conn.close()
            return self._json({'ok': True, 'updated_at': now()})
        return self._json({'ok': False, 'error': 'not found'}, 404)

if __name__ == '__main__':
    init()
    srv = ThreadingHTTPServer((HOST, PORT), H)
    print(f'Toolbox API :{PORT}  DEV={DEV}  db={DB}', flush=True)
    srv.serve_forever()
