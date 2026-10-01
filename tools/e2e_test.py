#!/usr/bin/env python3
# 琉璃AI账号对接 · 全链路自测（在服务器上运行）
import json, re, time, random, string, urllib.request, urllib.error

MAIL = 'https://api.mail.tm'
SVC  = 'https://ai.liulichat.cn'      # 琉璃AI 账号服务（公网）
PROXY = 'http://127.0.0.1:8792'       # 百宝箱服务（本机）

def req(method, url, obj=None, headers=None, timeout=25):
    h = {'User-Agent': 'e2e-test'}
    if obj is not None:
        h['Content-Type'] = 'application/json'
    if headers:
        h.update(headers)
    body = json.dumps(obj).encode() if obj is not None else None
    r = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        resp = urllib.request.urlopen(r, timeout=timeout)
        return resp.status, json.loads(resp.read().decode('utf-8', 'replace') or '{}')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode('utf-8', 'replace') or '{}')
        except Exception:
            return e.code, {}

def main():
    okc, failc = [], []
    def check(name, cond, extra=''):
        (okc if cond else failc).append(name)
        print(('✅' if cond else '❌'), name, str(extra)[:110])

    # 1) 建临时邮箱
    st, doms = req('GET', MAIL + '/domains')
    domain = doms['hydra:member'][0]['domain']
    addr = ''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(12)) + '@' + domain
    pw = 'TbTest' + ''.join(random.choice(string.digits) for _ in range(6))
    st, _ = req('POST', MAIL + '/accounts', {'address': addr, 'password': pw})
    check('创建临时邮箱', st in (200, 201), addr)
    st, tok = req('POST', MAIL + '/token', {'address': addr, 'password': pw})
    mtok = tok.get('token')
    check('临时邮箱登录', bool(mtok))

    # 2) 经百宝箱代理发注册验证码
    st, r = req('POST', PROXY + '/api/auth/email-codes', {'email': addr, 'purpose': 'register'})
    rid = r.get('requestId')
    check('发验证码(经代理)', st == 200 and bool(rid), json.dumps(r, ensure_ascii=False))

    # 3) 收邮件取码
    code = None
    for i in range(30):
        st, msgs = req('GET', MAIL + '/messages', headers={'Authorization': 'Bearer ' + str(mtok)})
        items = (msgs or {}).get('hydra:member') or []
        if items:
            st, msg = req('GET', MAIL + '/messages/' + items[0]['id'], headers={'Authorization': 'Bearer ' + str(mtok)})
            htm = msg.get('html') or ['']
            text = (msg.get('text') or '') + ' ' + (htm[0] if isinstance(htm, list) and htm else '')
            m = re.search(r'(\d{6})', text)
            if m:
                code = m.group(1)
            break
        time.sleep(3)
    check('收到验证码邮件', bool(code), 'code=%s' % code)

    # 4) 注册（经代理）
    if code and rid:
        st, r = req('POST', PROXY + '/api/auth/register', {'email': addr, 'password': pw,
                                                           'verificationRequestId': rid, 'verificationCode': code})
        check('注册(经代理)', st in (200, 201), json.dumps(r, ensure_ascii=False))

    # 5) 登录（经代理）
    st, r = req('POST', PROXY + '/api/auth/login', {'email': addr, 'password': pw})
    at, rt = r.get('accessToken'), r.get('refreshToken')
    check('登录(经代理)', st == 200 and bool(at), '')
    auth = {'Authorization': 'Bearer ' + (at or '')}

    # 6) 统一账号鉴权
    st, r = req('GET', PROXY + '/api/me', headers=auth)
    check('统一账号 /api/me', st == 200 and (r.get('user') or {}).get('from') == 'liuli', json.dumps(r, ensure_ascii=False)[:130])

    # 7) 云同步（l: key）
    st, r = req('POST', PROXY + '/api/sync', {'favs': ['qr', 'videodl'], 'settings': {'theme': 'ocean'}}, headers=auth)
    check('云同步写入', st == 200, '')
    st, r = req('GET', PROXY + '/api/sync', headers=auth)
    check('云同步读取', st == 200 and r.get('favs') == ['qr', 'videodl'] and (r.get('settings') or {}).get('theme') == 'ocean', json.dumps(r, ensure_ascii=False)[:130])

    # 8) 刷新 token
    st, r = req('POST', PROXY + '/api/auth/refresh', {'refreshToken': rt})
    check('刷新 token', st == 200 and bool(r.get('accessToken')), '')

    # 9) 清理测试账号（直接对账号服务）
    st, r = req('DELETE', SVC + '/v1/me', {'currentPassword': pw}, headers=auth)
    check('清理测试账号', st in (200, 401), 'http=%s' % st)

    print()
    print('RESULT: %d ok / %d fail' % (len(okc), len(failc)))
    if failc:
        print('FAILED:', ', '.join(failc))

main()
