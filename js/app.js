/* 百宝箱 · 核心逻辑（登录 / 主题 / 导航 / 收藏 / 搜索） */
(function(){
'use strict';
var $ = function(s){ return document.querySelector(s); };

var THEME_BG = { night:'#0a0e16', light:'#f4f6fb', ocean:'#06121c', violet:'#100a1c', sunset:'#160e09', forest:'#0a1410', sakura:'#fff5f7' };
var THEMES = [
  { id:'night',  name:'暗夜', c:['#5b8cff','#8b5cf6'] },
  { id:'light',  name:'极白', c:['#3b6cf6','#7c3aed'] },
  { id:'ocean',  name:'深海', c:['#22d3ee','#3b82f6'] },
  { id:'violet', name:'暮紫', c:['#a855f7','#ec4899'] },
  { id:'sunset', name:'日落', c:['#fb923c','#f43f5e'] },
  { id:'forest', name:'森林', c:['#34d399','#10b981'] },
  { id:'sakura', name:'樱粉', c:['#f472b6','#ec4899'] }
];

var LS = {
  get: function(k, d){ try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set: function(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};

var state = {
  user: LS.get('tb_user', null),
  theme: LS.get('tb_theme', 'night'),
  fav: LS.get('tb_fav', []),
  filter: 'all',
  q: '',
  tab: 'home',
  tool: null,
  serverOk: false
};

/* ===== 动效编排层（GSAP）
   三条铁律：
   1. GSAP 缺失 / 用户开启「减少动态效果」时全部降级为瞬时显示，绝不挡内容
   2. CSS 里 .js-ready 才隐藏初始态，且这个 class 只在 GSAP 真正可用时添加
   3. 任何动画失败都不阻塞后续逻辑                                        */
var Motion = {
  get ok(){
    return !!(window.gsap) && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  },
  show: function(ns){
    ns.forEach(function(n){ try{ n.style.visibility = 'visible'; n.style.opacity = 1; }catch(e){} });
  },
  list: function(sel){
    return Array.prototype.slice.call(document.querySelectorAll(sel));
  },
  /* 网格 / 列表序列入场 */
  staggerIn: function(ns){
    if(!ns || !ns.length) return;
    if(!this.ok){ this.show(ns); return; }
    try{
      window.gsap.set(ns, { visibility:'visible', opacity:0, y:16, scale:.97 });
      window.gsap.to(ns, {
        opacity:1, y:0, scale:1, duration:.52, ease:'power3.out',
        stagger:{ each:.022, from:'start' }, overwrite:'auto',
        clearProps:'scale'
      });
    }catch(e){ this.show(ns); }
  },
  /* 工具详情页进入 */
  toolIn: function(el){
    if(!this.ok || !el) return;
    try{
      var body = el.querySelector('.tv-body');
      window.gsap.set(el, { visibility:'visible' });
      window.gsap.fromTo(el, { x:'5%', opacity:0 },
        { x:0, opacity:1, duration:.34, ease:'power3.out' });
      if(body) window.gsap.fromTo(body, { y:12, opacity:0 },
        { y:0, opacity:1, duration:.44, ease:'power3.out', delay:.05, clearProps:'transform' });
    }catch(e){}
  },
  /* 工具详情页退出：动画结束后再真正隐藏 */
  toolOut: function(el, done){
    if(!el){ if(done) done(); return; }
    if(!this.ok){ el.classList.add('hidden'); if(done) done(); return; }
    try{
      window.gsap.to(el, { x:'4%', opacity:0, duration:.2, ease:'power2.in',
        onComplete:function(){
          el.classList.add('hidden');
          window.gsap.set(el, { x:0, opacity:1 });
          if(done) done();
        }});
    }catch(e){ el.classList.add('hidden'); if(done) done(); }
  },
  /* 标签页切换 */
  pageIn: function(el){
    if(!this.ok || !el) return;
    try{ window.gsap.fromTo(el, { y:10, opacity:0 }, { y:0, opacity:1, duration:.32, ease:'power2.out', clearProps:'transform' }); }
    catch(e){}
  },
  /* 按压回馈：星标 / 头像这类单点元素 */
  pop: function(el, peak){
    if(!this.ok || !el) return;
    try{
      window.gsap.fromTo(el, { scale:1 },
        { scale: peak || 1.32, duration:.16, ease:'back.out(3)', yoyo:true, repeat:1, overwrite:'auto' });
    }catch(e){}
  },
  toastIn: function(el){
    if(!this.ok || !el) return;
    try{ window.gsap.fromTo(el, { y:-14, opacity:0, scale:.94 },
      { y:0, opacity:1, scale:1, duration:.36, ease:'back.out(2)', clearProps:'transform' }); }
    catch(e){}
  },
  /* 登录页 → 主界面 */
  reveal: function(el){
    if(!this.ok || !el) return;
    try{ window.gsap.fromTo(el, { opacity:0, y:14 }, { opacity:1, y:0, duration:.5, ease:'power3.out', clearProps:'transform' }); }
    catch(e){}
  }
};

function toast(msg, ms){
  var t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  Motion.toastIn(t);
  clearTimeout(toast._t);
  toast._t = setTimeout(function(){ t.classList.add('hidden'); }, ms || 1800);
}
window.toast = toast;

/* ===== 主题 ===== */
function applyTheme(id){
  if (!THEME_BG[id]) id = 'night';
  state.theme = id;
  document.documentElement.setAttribute('data-theme', id);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_BG[id]);
  LS.set('tb_theme', id);
  renderThemes();
  scheduleSync();
}
function renderThemes(){
  var box = $('#themes');
  box.innerHTML = '';
  THEMES.forEach(function(th){
    var b = document.createElement('button');
    b.className = 'swatch' + (state.theme === th.id ? ' on' : '');
    b.innerHTML = '<span class="dot" style="background:linear-gradient(135deg,' + th.c[0] + ',' + th.c[1] + ')"></span>' + th.name;
    b.onclick = function(){ applyTheme(th.id); toast('已切换主题：' + th.name); };
    box.appendChild(b);
  });
}

/* ===== 登录（琉璃AI 统一账号） ===== */
var lastRequestId = '';
function liuliErrMsg(r){
  if (!r) return '操作失败';
  if (r.__net) return '连不上服务器，请检查网络';
  var m = {
    invalid_email: '邮箱格式不正确',
    rate_limited: '操作太频繁，请稍后再试',
    email_delivery_unavailable: '邮件服务暂不可用，请联系管理员',
    user_exists: '该邮箱已注册，直接登录吧',
    password_too_short: '密码至少 8 位',
    invalid_credentials: '邮箱或密码错误',
    missing_fields: '请把信息填写完整',
    invalid_purpose: '请求参数错误',
    user_not_found: '该邮箱还没有注册',
    code_invalid: '验证码错误',
    code_expired: '验证码已过期',
    code_used: '验证码已使用，请重新获取',
    too_many_attempts: '尝试次数过多，请重新获取验证码',
    invalid_refresh_token: '登录已过期'
  };
  var code = String(r.error || r.code || '');
  return m[code] || (r.message || r.error || ('操作失败' + (r.__status ? '（' + r.__status + '）' : '')));
}
function liuliLogin(email, pw){
  return window.TBApi.auth('login', { email: email, password: pw }).then(function(r){
    if (r && r.accessToken && r.user){
      window.TBApi.setLiuli({ accessToken: r.accessToken, refreshToken: r.refreshToken || '', user: r.user, ts: Date.now() });
      window.TBApi.setToken('');
      var mail = r.user.email || email;
      state.user = { email: mail, name: mail.split('@')[0], role: r.user.role || 'user', from: 'liuli', ts: Date.now() };
      LS.set('tb_user', state.user);
      showMain();
      toast('登录成功 · 琉璃AI 账号 ☁️');
      pullSync();
      return true;
    }
    toast(liuliErrMsg(r));
    return false;
  });
}
function loginLocalDemo(){
  state.user = { name: '本地体验', from: 'local', ts: Date.now() };
  LS.set('tb_user', state.user);
  showMain();
  toast('已进入本地模式（数据不云同步）');
}
function initAuth(){
  var tab = $('#loginTab');
  if (tab){
    tab.addEventListener('click', function(e){
      var b = e.target.closest('button'); if (!b) return;
      var v = b.dataset.v;
      tab.querySelectorAll('button').forEach(function(x){ x.classList.toggle('active', x === b); });
      $('#paneLogin').classList.toggle('hidden', v !== 'login');
      $('#paneRegister').classList.toggle('hidden', v !== 'register');
    });
  }
  var li = $('#liLogin');
  if (li){
    li.onclick = function(){
      var email = $('#liEmail').value.trim(), pw = $('#liPass').value;
      if (!/^\S+@\S+\.\S+$/.test(email)){ toast('请输入正确的邮箱'); return; }
      if (!pw){ toast('请输入密码'); return; }
      var btn = this; btn.disabled = true; btn.textContent = '登录中…';
      liuliLogin(email, pw).then(function(){
        btn.disabled = false; btn.textContent = '登 录';
      });
    };
  }
  var rgTimer = null;
  function startCountdown(btn, sec){
    if (rgTimer){ clearInterval(rgTimer); rgTimer = null; }
    var left = sec;
    btn.disabled = true;
    btn.textContent = left + 's 后重试';
    rgTimer = setInterval(function(){
      left--;
      if (left <= 0){
        clearInterval(rgTimer); rgTimer = null;
        btn.disabled = false; btn.textContent = '获取验证码';
      } else {
        btn.textContent = left + 's 后重试';
      }
    }, 1000);
  }
  var rs = $('#rgSend');
  if (rs){
    rs.onclick = function(){
      var btn = this;
      var email = $('#rgEmail').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)){ toast('请先输入正确的邮箱'); return; }
      btn.disabled = true; btn.textContent = '发送中…';
      window.TBApi.auth('email-codes', { email: email, purpose: 'register' }).then(function(r){
        if (r && r.requestId){
          lastRequestId = r.requestId;
          toast('验证码已发送到邮箱，请查收（含垃圾箱）', 3000);
          startCountdown(btn, 60);
        } else if (r && String(r.error) === 'rate_limited'){
          toast('发送太频繁，请稍后再试');
          startCountdown(btn, 60);
        } else {
          btn.disabled = false; btn.textContent = '获取验证码';
          toast(liuliErrMsg(r));
        }
      });
    };
  }
  var rg = $('#rgGo');
  if (rg){
    rg.onclick = function(){
      var email = $('#rgEmail').value.trim(), code = $('#rgCode').value.trim();
      var pw = $('#rgPass').value, pw2 = $('#rgPass2').value;
      if (!lastRequestId){ toast('请先点击「获取验证码」'); return; }
      if (!/^\d{4,6}$/.test(code)){ toast('请输入邮件里的验证码'); return; }
      if (pw.length < 8){ toast('密码至少 8 位'); return; }
      if (pw !== pw2){ toast('两次输入的密码不一致'); return; }
      var btn = this; btn.disabled = true; btn.textContent = '注册中…';
      window.TBApi.auth('register', { email: email, password: pw, verificationRequestId: lastRequestId, verificationCode: code }).then(function(r){
        if (r && r.id){
          toast('注册成功，正在登录…');
          liuliLogin(email, pw).then(function(){
            btn.disabled = false; btn.textContent = '注 册';
          });
        } else {
          btn.disabled = false; btn.textContent = '注 册';
          toast(liuliErrMsg(r));
        }
      });
    };
  }
  var lo = $('#logout');
  if (lo){
    lo.onclick = function(){
      var l = window.TBApi.getLiuli();
      if (l && l.refreshToken){ try { window.TBApi.auth('logout', { refreshToken: l.refreshToken }); } catch(e){} }
      window.TBApi.setLiuli(null); window.TBApi.setToken('');
      state.user = null; LS.set('tb_user', null);
      showLogin();
      toast('已退出登录');
    };
  }
  var g = document.getElementById('guestMode');
  if (g) g.onclick = function(){ loginLocalDemo(); };
  var apiBtn = document.getElementById('apiSave');
  if (apiBtn){
    apiBtn.onclick = function(){
      var v = document.getElementById('apiBase').value.trim().replace(/\/+$/, '');
      if (!/^https?:\/\//.test(v)){ toast('地址需以 http(s):// 开头'); return; }
      window.TBApi.setBase(v);
      probeServer(true);
    };
  }
}

/* ===== 云同步 ===== */
var syncTimer = null;
function isServerUser(){ return !!(state.user && (state.user.from === 'server' || state.user.from === 'liuli')); }
function updateSyncStatus(txt){
  var el = document.getElementById('syncStatus');
  if (el) el.textContent = txt;
}
function scheduleSync(delay){
  if (!isServerUser() || !state.serverOk || !window.TBApi) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(function(){
    window.TBApi.putSync(state.fav, { theme: state.theme }).then(function(r){
      if (r && r.ok) updateSyncStatus('🟢 服务器在线');
    });
  }, delay || 1200);
}
function pullSync(){
  if (!isServerUser() || !state.serverOk || !window.TBApi) return;
  window.TBApi.getSync().then(function(r){
    if (!r || !r.ok) return;
    var merged = state.fav.slice();
    (r.favs || []).forEach(function(id){
      if (merged.indexOf(id) < 0 && TB_TOOLS.some(function(t){ return t.id === id; })) merged.push(id);
    });
    state.fav = merged;
    LS.set('tb_fav', state.fav);
    if (r.settings && r.settings.theme && THEME_BG[r.settings.theme]) applyTheme(r.settings.theme);
    renderFav(); updateStar();
    updateSyncStatus('🟢 服务器在线');
    scheduleSync(600);
  });
}
function probeServer(verbose){
  if (!window.TBApi) return;
  window.TBApi.health().then(function(r){
    state.serverOk = !!(r && r.ok);
    updateSyncStatus(state.serverOk ? '🟢 服务器在线' : '🔴 无法连接服务器');
    if (verbose) toast(state.serverOk ? '✓ 服务器连接成功' : '✗ 连接失败，已用本地模式');
    if (state.serverOk && isServerUser()) pullSync();
  });
}
function showLogin(){
  $('#main').classList.add('hidden');
  $('#login').classList.remove('hidden');
  var e = document.getElementById('liEmail');
  if (e && state.user && state.user.email) e.value = state.user.email;
}
function showMain(){
  $('#login').classList.add('hidden');
  $('#main').classList.remove('hidden');
  refreshMe();
}
function refreshMe(){
  if (!state.user) return;
  $('#meName').textContent = state.user.name || '用户';
  var sub = state.user.email || '';
  if (!sub && state.user.phone) sub = state.user.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
  $('#mePhone').textContent = sub || '本地模式';
  var av = ['🙂','😎','🤖','🐱','🦊','🐼','🚀'];
  var key = state.user.email || state.user.phone || 'user';
  var idx = key.charCodeAt(key.length - 1) % av.length;
  $('#avatarTop').textContent = av[idx];
  $('#avatarMe').textContent = av[idx];
  var ab = document.getElementById('apiBase');
  if (ab && window.TBApi) ab.value = window.TBApi.getBase();
  updateSyncStatus(state.serverOk ? ('🟢 服务器在线' + (state.user.from === 'liuli' ? ' · 琉璃AI 账号' : '')) : '🔴 无法连接服务器');
}

/* ===== 工具列表 ===== */
function currentTools(){
  var q = state.q.toLowerCase();
  return TB_TOOLS.filter(function(t){
    if (state.filter !== 'all' && t.cat !== state.filter) return false;
    if (q && (t.name + t.desc).toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
}
function renderChips(){
  var c = $('#chips');
  c.innerHTML = '';
  TB_CATS.forEach(function(cat){
    var b = document.createElement('button');
    b.className = 'chip' + (state.filter === cat.id ? ' active' : '');
    b.textContent = cat.name;
    b.onclick = function(){
      state.filter = cat.id;
      renderChips(); renderGrid();
    };
    c.appendChild(b);
  });
}
function toolCard(t){
  var d = document.createElement('div');
  d.className = 'card';
  d.innerHTML = '<div class="card-ico" style="background:' + t.grad + '">' + t.icon +
    '</div><div class="card-name">' + t.name + '</div><div class="card-desc">' + t.desc + '</div>';
  d.onclick = function(){ openTool(t.id); };
  return d;
}
var SEC_META = {
  img:  { name:'图片工具', ico:'🖼️' },
  text: { name:'文本工具', ico:'📝' },
  calc: { name:'计算工具', ico:'🧮' },
  net:  { name:'网络工具', ico:'🌐' }
};
function toolGridOf(list){
  var g = document.createElement('div');
  g.className = 'grid';
  list.forEach(function(t){ g.appendChild(toolCard(t)); });
  return g;
}
function toolSection(title, ico, list){
  var s = document.createElement('div');
  s.className = 'tool-sec';
  var head = document.createElement('div');
  head.className = 'sec-head';
  head.innerHTML = '<span class="sec-ico">' + ico + '</span>' + title + '<span class="sec-count">' + list.length + '</span>';
  s.appendChild(head);
  s.appendChild(toolGridOf(list));
  return s;
}
function renderGrid(){
  var g = $('#grid');
  g.innerHTML = '';
  if (state.q){
    var list = currentTools();
    if (!list.length){
      g.innerHTML = '<div class="empty">没有找到相关工具<br><span class="muted">换个关键词试试</span></div>';
    } else {
      g.appendChild(toolSection('搜索「' + state.q + '」', '🔍', list));
    }
  } else if (state.filter === 'all'){
    TB_CATS.forEach(function(cat){
      if (cat.id === 'all') return;
      var list = TB_TOOLS.filter(function(t){ return t.cat === cat.id; });
      if (list.length){
        var meta = SEC_META[cat.id] || { name: cat.name, ico: '🧰' };
        g.appendChild(toolSection(meta.name, meta.ico, list));
      }
    });
  } else {
    var list2 = TB_TOOLS.filter(function(t){ return t.cat === state.filter; });
    if (list2.length){
      var meta2 = SEC_META[state.filter] || { name: '', ico: '🧰' };
      g.appendChild(toolSection(meta2.name, meta2.ico, list2));
    }
  }
  var soonTitle = $('#soonTitle'), upgrid = $('#upgrid');
  var showSoon = !state.q && state.filter === 'all';
  soonTitle.classList.toggle('hidden', !showSoon);
  upgrid.classList.toggle('hidden', !showSoon);
  if (showSoon){
    upgrid.innerHTML = '';
    TB_SOON.forEach(function(s){
      var d = document.createElement('div');
      d.className = 'card soon';
      d.innerHTML = '<span class="badge-soon">即将上线</span><div class="card-ico" style="background:' + s.grad + '">' + s.icon +
        '</div><div class="card-name">' + s.name + '</div>';
      upgrid.appendChild(d);
    });
  }
  Motion.staggerIn(Motion.list('#grid .sec-head, #grid .card, #upgrid .card'));
}

/* ===== 收藏 ===== */
function isFav(id){ return state.fav.indexOf(id) >= 0; }
function updateStar(){
  var on = !!(state.tool && isFav(state.tool.id));
  var b = $('#tvFav');
  b.textContent = on ? '★' : '☆';
  b.classList.toggle('on', on);
}
function toggleFav(){
  if (!state.tool) return;
  var id = state.tool.id, i = state.fav.indexOf(id);
  if (i >= 0){ state.fav.splice(i, 1); toast('已取消收藏'); }
  else { state.fav.push(id); toast('已收藏 ⭐'); }
  LS.set('tb_fav', state.fav);
  updateStar();
  if (state.tab === 'fav') renderFav();
  scheduleSync();
}
function renderFav(){
  var g = $('#favgrid');
  g.innerHTML = '';
  var list = TB_TOOLS.filter(function(t){ return isFav(t.id); });
  $('#favEmpty').classList.toggle('hidden', list.length > 0);
  list.forEach(function(t){ g.appendChild(toolCard(t)); });
  Motion.staggerIn(Motion.list('#favgrid .card'));
}

/* ===== 使用埋点：来源 IP / 账号 / 工具 / 停留时长 =====
   原则：尽力而为，任何失败都静默，绝不影响正常使用。
   IP 由服务端从 X-Forwarded-For 提取，前端不感知也不上报。      */
var TB_SID = (function(){
  try {
    var s = sessionStorage.getItem('tb_sid');
    if (!s){ s = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('tb_sid', s); }
    return s;
  } catch(e){ return 'nosid'; }
})();
var _toolOpen = null;   /* { id, name, at, total } */

function trackEvt(toolId, toolName, action, dwell){
  try {
    var base = (window.TBApi && TBApi.getBase) ? TBApi.getBase() : '';
    if (!base) return;
    var payload = { tool: toolId || '', name: toolName || '', action: action,
                    dwell: dwell || 0, sid: TB_SID, page: (location.pathname || '/') };
    var u = state.user;
    if (u && u.email) payload.user = u.email;
    var url = base + '/api/track';
    var headers = { 'Content-Type': 'application/json' };
    try {
      var tok = (window.TBApi && TBApi.getToken) ? (TBApi.getToken() || '') : '';
      if (tok) headers['Authorization'] = 'Bearer ' + tok;
    } catch(e){}
    /* keepalive 能在页面卸载时仍把请求发出去，并保留自定义头（登录态） */
    try {
      fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(payload),
                   keepalive: true, credentials: 'same-origin' }).then(function(){}, function(){});
    } catch(e){
      try { navigator.sendBeacon(url, new Blob([JSON.stringify(payload)], { type: 'text/plain' })); } catch(e2){}
    }
  } catch(e){}
}
/* 把「已停留」的时间结算进累计值，但不立即上报 */
function _dwellAccumulate(){
  if (!_toolOpen) return;
  _toolOpen.total += Date.now() - _toolOpen.at;
  _toolOpen.at = Date.now();
}
/* 真正上报停留时长（切工具 / 关闭工具 / 离开页面时调用，每个工具每次会话只上报一次） */
function _dwellEmit(){
  if (!_toolOpen) return;
  _dwellAccumulate();
  trackEvt(_toolOpen.id, _toolOpen.name, 'dwell', Math.min(_toolOpen.total, 3600000));
  _toolOpen = null;
}

/* ===== 工具详情 ===== */
function openTool(id){
  var t = null;
  for (var i=0;i<TB_TOOLS.length;i++) if (TB_TOOLS[i].id === id){ t = TB_TOOLS[i]; break; }
  if (!t) return;
  _dwellEmit();                                   /* 结算上一个工具的停留时长 */
  _toolOpen = { id: t.id, name: t.name, at: Date.now(), total: 0 };
  trackEvt(t.id, t.name, 'open', 0);
  state.tool = t;
  $('#tvTitle').textContent = t.name;
  updateStar();
  if (window.__tbCleanup) window.__tbCleanup.forEach(function(f){ try{ f(); }catch(e){} });
  window.__tbCleanup = [];
  var body = $('#tvBody');
  body.innerHTML = '';
  body.scrollTop = 0;
  try { t.render(body); }
  catch(e){ body.innerHTML = '<div class="empty">工具加载出错：' + e.message + '</div>'; }
  var tv = $('#toolview');
  tv.classList.remove('hidden');
  Motion.toolIn(tv);
}
function closeTool(){
  _dwellEmit();
  Motion.toolOut($('#toolview'));
  if (window.__tbCleanup) window.__tbCleanup.forEach(function(f){ try{ f(); }catch(e){} });
  window.__tbCleanup = [];
  state.tool = null;
}
/* 页面切到后台：暂停计时；页面卸载：结算上报 */
document.addEventListener('visibilitychange', function(){
  if (document.hidden) _dwellAccumulate();
  else if (_toolOpen) _toolOpen.at = Date.now();
});
window.addEventListener('pagehide', function(){ _dwellEmit(); });

/* ===== 标签页 ===== */
function switchTab(t){
  state.tab = t;
  ['home','fav','me'].forEach(function(k){ $('#tab-' + k).classList.toggle('hidden', k !== t); });
  Array.prototype.forEach.call(document.querySelectorAll('#tabbar .tab'), function(b){
    b.classList.toggle('active', b.dataset.tab === t);
  });
  if (t === 'fav') renderFav();
  if (t === 'me') refreshMe();
  $('#content').scrollTop = 0;
  Motion.pageIn($('#tab-' + t));
}

/* ===== 登录态后台校验 ===== */
function verifySessionBg(){
  if (!window.TBApi || !isServerUser()) return;
  window.TBApi.me().then(function(r){
    if (r && r.ok){
      if (r.user && r.user.email && state.user.email !== r.user.email){
        state.user.email = r.user.email;
        state.user.name = (r.user.email || '').split('@')[0] || state.user.name;
        LS.set('tb_user', state.user);
        refreshMe();
      }
      return;
    }
    if (r && (r.__status === 401 || r.__status === 403)){
      window.TBApi.setLiuli(null); window.TBApi.setToken('');
      state.user = null; LS.set('tb_user', null);
      showLogin();
      toast('登录已过期，请重新登录');
    }
  });
}

/* ===== 启动 ===== */
function boot(){
  /* 仅当 GSAP 真正可用时才加这个类——CSS 靠它把初始态隐藏，
     若此处判断失误，所有工具卡会永久不可见，所以这里是全链路最危险的一行 */
  if (Motion.ok) document.documentElement.classList.add('js-ready');
  applyTheme(state.theme);
  initAuth();
  $('#tabbar').addEventListener('click', function(e){
    var b = e.target.closest('.tab'); if (!b) return;
    switchTab(b.dataset.tab);
  });
  $('#tvBack').onclick = closeTool;
  $('#tvFav').onclick = toggleFav;
  $('#search').addEventListener('input', function(){ state.q = this.value.trim(); renderGrid(); });
  $('#avatarTop').onclick = function(){ Motion.pop(this); switchTab('me'); };
  renderChips();
  renderGrid();
  var ps = document.querySelector('#tab-home .page-sub');
  if (ps) ps.textContent = TB_TOOLS.length + ' 个工具 · 本地秒响应 · 支持云同步';
  if (state.user){
    showMain();
    verifySessionBg();
  } else {
    showLogin();
  }
  probeServer(false);

  window.__tbHandleBack = function(){
    try {
      if (state.tool){ closeTool(); return true; }
      if (state.tab !== 'home'){ switchTab('home'); return true; }
    } catch(e){}
    return false;
  };

  window.__tb = {
    state: function(){
      return JSON.parse(JSON.stringify({
        user: state.user, theme: state.theme, fav: state.fav,
        tab: state.tab, tool: state.tool ? state.tool.id : null,
        serverOk: state.serverOk
      }));
    },
    openTool: openTool,
    closeTool: closeTool,
    switchTab: switchTab,
    setTheme: applyTheme,
    loginDemo: function(phone){
      state.user = { phone: phone || '13800138000', name: '用户8000', ts: Date.now(), from: 'local' };
      LS.set('tb_user', state.user);
      showMain();
    },
    liuliLogin: liuliLogin,
    loginLocalDemo: loginLocalDemo,
    probeServer: probeServer,
    pullSync: pullSync,
    pushSync: function(){ return window.TBApi.putSync(state.fav, { theme: state.theme }); },
    testInpaint: function(){ return tInpaintTest(); },
    errors: function(){ return window.__errors || []; }
  };
}

window.__errors = [];
window.addEventListener('error', function(e){ window.__errors.push(String(e.message)); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
