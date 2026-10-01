/* 百宝箱 · API 客户端
   - 云同步（收藏/主题）
   - 琉璃AI 统一账号（邮箱注册 / 登录 / 刷新）
   - 视频解析、OCR、音频提取（经自建服务器） */
(function(){
  function defaultBase(){
    try {
      if (location.protocol === 'http:' || location.protocol === 'https:') return location.origin;
    } catch(e){}
    return 'http://127.0.0.1:8791';   /* minis:// 预览 → 沙箱本地服务 */
  }
  function getBase(){ try { return localStorage.getItem('tb_api_base') || defaultBase(); } catch(e){ return defaultBase(); } }
  function setBase(v){ try { localStorage.setItem('tb_api_base', v); } catch(e){} }

  /* —— 琉璃AI 统一账号：token 存取 —— */
  function getLiuli(){ try { return JSON.parse(localStorage.getItem('tb_liuli') || 'null'); } catch(e){ return null; } }
  function setLiuli(v){ try { v ? localStorage.setItem('tb_liuli', JSON.stringify(v)) : localStorage.removeItem('tb_liuli'); } catch(e){} }
  function getToken(){
    var l = getLiuli();
    if (l && l.accessToken) return l.accessToken;
    try { return localStorage.getItem('tb_token') || ''; } catch(e){ return ''; }
  }
  function setToken(t){ try { t ? localStorage.setItem('tb_token', t) : localStorage.removeItem('tb_token'); } catch(e){} }

  function doFetch(method, path, body, timeout){
    var ctrl = new AbortController();
    var timer = setTimeout(function(){ ctrl.abort(); }, timeout || 8000);
    var opt = { method: method, signal: ctrl.signal, headers: {} };
    if (body !== undefined){ opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    var tok = getToken();
    if (tok) opt.headers['Authorization'] = 'Bearer ' + tok;
    return fetch(getBase() + path, opt).then(function(r){
      clearTimeout(timer);
      return r.json().catch(function(){ return {}; }).then(function(j){
        j.__status = r.status;
        return j;
      });
    }, function(err){ clearTimeout(timer); return { ok:false, __net:true, error: String(err) }; });
  }

  function refreshLiuli(){
    var l = getLiuli();
    if (!l || !l.refreshToken) return Promise.resolve(false);
    return fetch(getBase() + '/api/auth/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: l.refreshToken })
    }).then(function(r){ return r.json().catch(function(){ return {}; }); }).then(function(j){
      if (j && j.accessToken){ l.accessToken = j.accessToken; setLiuli(l); return true; }
      return false;
    }, function(){ return false; });
  }

  function req(method, path, body, timeout){
    return doFetch(method, path, body, timeout).then(function(j){
      if (j && j.__status === 401 && path.indexOf('/api/auth/') !== 0 && getLiuli()){
        return refreshLiuli().then(function(ok){
          if (ok) return doFetch(method, path, body, timeout);
          setLiuli(null);
          return j;
        });
      }
      return j;
    });
  }

  window.TBApi = {
    getBase: getBase, setBase: setBase,
    getToken: getToken, setToken: setToken,
    getLiuli: getLiuli, setLiuli: setLiuli,
    /* 琉璃AI 账号操作（经百宝箱服务器代理到账号服务） */
    auth: function(action, payload){
      return fetch(getBase() + '/api/auth/' + action, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
      }).then(function(r){
        return r.json().catch(function(){ return {}; }).then(function(j){ j.__status = r.status; return j; });
      }, function(err){ return { __net: true, error: String(err) }; });
    },
    /* 云同步 / 账号 */
    health:   function(){ return req('GET', '/api/health', undefined, 3000); },
    me:       function(){ return req('GET', '/api/me'); },
    getSync:  function(){ return req('GET', '/api/sync'); },
    putSync:  function(favs, settings){ return req('POST', '/api/sync', { favs: favs, settings: settings }); },
    /* 兼容旧接口（工具箱独立账号，保留备用） */
    sendCode: function(phone){ return req('POST', '/api/send_code', { phone: phone }); },
    login:    function(phone, code){ return req('POST', '/api/login', { phone: phone, code: code }); },
    logout:   function(){ return req('POST', '/api/logout', {}); },
    /* 视频 / OCR */
    videoParse: function(url){ return req('GET', '/api/video/parse?url=' + encodeURIComponent(url), undefined, 60000); },
    videoDl: function(u, name, referer){
      var q = 'url=' + encodeURIComponent(u) + '&name=' + encodeURIComponent(String(name || 'video').slice(0, 40) + '.mp4');
      if (referer) q += '&referer=' + encodeURIComponent(referer);
      return getBase() + '/api/video/dl?' + q;
    },
    videoAudio: function(u, name, referer, format){
      var q = 'url=' + encodeURIComponent(u) + '&format=' + encodeURIComponent(format || 'm4a') +
              '&name=' + encodeURIComponent(String(name || 'audio').slice(0, 40));
      if (referer) q += '&referer=' + encodeURIComponent(referer);
      return getBase() + '/api/video/audio?' + q;
    },
    ocr: function(file){
      return fetch(getBase() + '/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'image/png' },
        body: file
      }).then(function(r){ return r.json(); }, function(){ return { ok: false, __net: true }; });
    }
  };
})();
