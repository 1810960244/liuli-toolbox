/* 百宝箱 · 第四批工具：图片进阶 + 网络公开接口（9 个） */

/* 工具 24：二维码识别（扫码） */
function tQrScan(root){
  root.innerHTML = '' +
    '<label class="file-drop" id="qsDrop">📷 选择含二维码/条形码的图片<input type="file" accept="image/*" id="qsFile"></label>' +
    '<div id="qsPanel" class="hidden">' +
      '<div class="canvas-wrap"><img id="qsPrev" style="width:100%;display:block"></div>' +
      '<div class="label">识别结果</div>' +
      '<div class="result-box" id="qsOut" style="user-select:text">识别中…</div>' +
      '<div class="row" style="margin-top:10px">' +
        '<button class="btn sm" style="flex:1" id="qsCopy">复制内容</button>' +
        '<button class="btn sm" id="qsAgain">换一张</button>' +
      '</div>' +
      '<p class="hint" style="margin-top:10px">支持二维码与常见一维码 · 完全本地识别（zxing · Apache-2.0）</p>' +
    '</div>';
  var reader = null;
  function getReader(){
    if (!reader && window.ZXing) reader = new ZXing.BrowserMultiFormatReader();
    return reader;
  }
  qs('#qsFile', root).addEventListener('change', function(e){
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var img = new Image();
    img.onload = function(){
      qs('#qsDrop', root).classList.add('hidden');
      qs('#qsPanel', root).classList.remove('hidden');
      qs('#qsPrev', root).src = img.src;
      qs('#qsOut', root).textContent = '识别中…';
      var rd = getReader();
      if (!rd){ qs('#qsOut', root).textContent = '识别组件加载失败'; return; }
      rd.decodeFromImageElement(img).then(function(result){
        qs('#qsOut', root).textContent = result.getText();
        toast('识别成功 ✓');
      }, function(){
        qs('#qsOut', root).textContent = '没有识别到二维码/条形码（换更清晰的图片试试）';
      });
    };
    img.src = URL.createObjectURL(f);
  });
  qs('#qsCopy', root).onclick = function(){ copyText(qs('#qsOut', root).textContent); };
  qs('#qsAgain', root).onclick = function(){
    qs('#qsPanel', root).classList.add('hidden');
    qs('#qsDrop', root).classList.remove('hidden');
    qs('#qsFile', root).value = '';
  };
}

/* 工具 25：图片拼接 */
function tCollage(root){
  root.innerHTML = '' +
    '<label class="file-drop" id="cgDrop">🖼️ 选择 2~9 张图片<input type="file" accept="image/*" multiple id="cgFile"></label>' +
    '<div id="cgPanel" class="hidden">' +
      '<div class="label">排列方式</div>' +
      '<div class="seg" id="cgDir"><button data-v="v" class="active">纵向</button><button data-v="h">横向</button><button data-v="grid">网格</button></div>' +
      '<div class="label">间距 <span id="cgGapv" class="muted">8px</span></div>' +
      '<input type="range" id="cgGap" min="0" max="40" value="8">' +
      '<div class="canvas-wrap" style="margin-top:12px"><canvas id="cgCv"></canvas></div>' +
      '<div class="row" style="margin-top:12px">' +
        '<button class="btn accent" style="flex:1" id="cgDl">保存图片</button>' +
        '<button class="btn sm" id="cgAgain">重选</button>' +
      '</div>' +
    '</div>';
  var imgs = [], dir = 'v';
  function draw(){
    var valid = imgs.filter(function(im){ return im.width && im.height; });
    if (!valid.length) return;
    var gap = parseInt(qs('#cgGap', root).value, 10);
    qs('#cgGapv', root).textContent = gap + 'px';
    var cv = qs('#cgCv', root), ctx = cv.getContext('2d');
    var MAX = 3200;
    if (dir === 'v'){
      var W = Math.min(1400, valid[0].width || 1000);
      var hs = valid.map(function(im){ return Math.round(im.height * (W / im.width)); });
      var H = hs.reduce(function(a, b){ return a + b; }, 0) + gap * (valid.length - 1);
      if (H > MAX){ var k = MAX / H; W = Math.round(W * k); H = MAX; hs = hs.map(function(h){ return Math.round(h * k); }); }
      cv.width = W; cv.height = H;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      var y = 0;
      valid.forEach(function(im, i){ ctx.drawImage(im, 0, y, W, hs[i]); y += hs[i] + gap; });
    } else if (dir === 'h'){
      var H2 = Math.min(1400, valid[0].height || 1000);
      var ws = valid.map(function(im){ return Math.round(im.width * (H2 / im.height)); });
      var W2 = ws.reduce(function(a, b){ return a + b; }, 0) + gap * (valid.length - 1);
      if (W2 > MAX){ var k2 = MAX / W2; H2 = Math.round(H2 * k2); W2 = MAX; ws = ws.map(function(w){ return Math.round(w * k2); }); }
      cv.width = W2; cv.height = H2;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W2, H2);
      var x2 = 0;
      valid.forEach(function(im, i){ ctx.drawImage(im, x2, 0, ws[i], H2); x2 += ws[i] + gap; });
    } else {
      var cols = Math.ceil(Math.sqrt(valid.length));
      var rows = Math.ceil(valid.length / cols);
      var cell = 700;
      cv.width = cols * cell + gap * (cols - 1);
      cv.height = rows * cell + gap * (rows - 1);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
      valid.forEach(function(im, i){
        var r = Math.floor(i / cols), c = i % cols;
        var s = Math.min(cell / im.width, cell / im.height);
        var w = im.width * s, h = im.height * s;
        ctx.drawImage(im, c * (cell + gap) + (cell - w) / 2, r * (cell + gap) + (cell - h) / 2, w, h);
      });
    }
  }
  qs('#cgFile', root).addEventListener('change', function(e){
    var fs = Array.prototype.slice.call(e.target.files || []);
    if (!fs.length) return;
    imgs = [];
    var pending = Math.min(fs.length, 9);
    fs.slice(0, 9).forEach(function(f){
      var im = new Image();
      im.onload = function(){ if (--pending <= 0) draw(); };
      im.onerror = function(){ if (--pending <= 0) draw(); };
      imgs.push(im);
      im.src = URL.createObjectURL(f);
    });
    qs('#cgDrop', root).classList.add('hidden');
    qs('#cgPanel', root).classList.remove('hidden');
  });
  qs('#cgDir', root).addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    dir = b.dataset.v;
    root.querySelectorAll('#cgDir button').forEach(function(x){ x.classList.toggle('active', x === b); });
    draw();
  });
  qs('#cgGap', root).addEventListener('input', draw);
  qs('#cgDl', root).onclick = function(){ if (qs('#cgCv', root).width) downloadCanvas(qs('#cgCv', root), 'collage.png'); };
  qs('#cgAgain', root).onclick = function(){
    qs('#cgPanel', root).classList.add('hidden');
    qs('#cgDrop', root).classList.remove('hidden');
    qs('#cgFile', root).value = '';
  };
}

/* 工具 26：图片取色器 */
function tEyedropper(root){
  root.innerHTML = '' +
    '<label class="file-drop" id="edDrop">🖼️ 选择图片，点哪取哪的颜色<input type="file" accept="image/*" id="edFile"></label>' +
    '<div id="edPanel" class="hidden">' +
      '<div class="canvas-wrap"><canvas id="edCv" style="touch-action:none"></canvas></div>' +
      '<div class="row" style="margin-top:12px;align-items:center">' +
        '<div id="edSwatch" style="width:56px;height:56px;border-radius:14px;border:1px solid var(--border);background:#888;flex:none"></div>' +
        '<div style="flex:1;min-width:0">' +
          '<div class="result-box mono" id="edHex" style="cursor:pointer">点击图片取色</div>' +
          '<div class="result-box mono" id="edRgb" style="margin-top:6px;cursor:pointer">-</div>' +
        '</div>' +
      '</div>' +
      '<div class="row" style="margin-top:10px">' +
        '<button class="btn sm" style="flex:1" id="edCopy">复制 HEX</button>' +
        '<button class="btn sm" id="edAgain">换图</button>' +
      '</div>' +
    '</div>';
  var oc = document.createElement('canvas');
  var octx = oc.getContext('2d', { willReadFrequently: true });
  var cur = null;
  function hexOf(r, g, b){ return '#' + [r, g, b].map(function(v){ return (v < 16 ? '0' : '') + v.toString(16); }).join('').toUpperCase(); }
  qs('#edFile', root).addEventListener('change', function(e){
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var im = new Image();
    im.onload = function(){
      var w = im.naturalWidth, h = im.naturalHeight, MAX = 2000;
      var s = Math.min(1, MAX / Math.max(w, h));
      w = Math.round(w * s); h = Math.round(h * s);
      oc.width = w; oc.height = h;
      octx.drawImage(im, 0, 0, w, h);
      var cv = qs('#edCv', root);
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(oc, 0, 0);
      qs('#edDrop', root).classList.add('hidden');
      qs('#edPanel', root).classList.remove('hidden');
      toast('点击图片任意位置取色');
    };
    im.src = URL.createObjectURL(f);
  });
  qs('#edCv', root).addEventListener('pointerdown', function(e){
    e.preventDefault();
    var cv = this;
    var r = cv.getBoundingClientRect();
    var x = Math.round((e.clientX - r.left) * (cv.width / r.width));
    var y = Math.round((e.clientY - r.top) * (cv.height / r.height));
    if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return;
    var d = octx.getImageData(x, y, 1, 1).data;
    cur = { hex: hexOf(d[0], d[1], d[2]), rgb: d[0] + ', ' + d[1] + ', ' + d[2] };
    qs('#edSwatch', root).style.background = cur.hex;
    qs('#edHex', root).textContent = cur.hex;
    qs('#edRgb', root).textContent = 'RGB ' + cur.rgb;
    var ctx = cv.getContext('2d');
    ctx.drawImage(oc, 0, 0);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 15.5, 0, Math.PI * 2); ctx.stroke();
  });
  qs('#edHex', root).onclick = function(){ if (cur) copyText(cur.hex); };
  qs('#edRgb', root).onclick = function(){ if (cur) copyText('rgb(' + cur.rgb + ')'); };
  qs('#edCopy', root).onclick = function(){ if (cur) copyText(cur.hex); else toast('先点图片取色'); };
  qs('#edAgain', root).onclick = function(){
    qs('#edPanel', root).classList.add('hidden');
    qs('#edDrop', root).classList.remove('hidden');
    qs('#edFile', root).value = '';
  };
}

/* 工具 27：图片 ↔ Base64 */
function tImg2B64(root){
  root.innerHTML = '' +
    '<label class="file-drop" id="b64Drop">🖼️ 图片 → Base64<input type="file" accept="image/*" id="b64File"></label>' +
    '<div id="b64Panel" class="hidden">' +
      '<div class="canvas-wrap"><img id="b64Prev" style="width:100%;display:block"></div>' +
      '<div class="label">Base64 数据</div>' +
      '<textarea class="ta mono" id="b64Out" style="min-height:120px" readonly></textarea>' +
      '<div class="result-box" style="margin-top:10px;font-size:12px" id="b64Info">-</div>' +
      '<div class="row" style="margin-top:10px">' +
        '<button class="btn sm accent" style="flex:1" id="b64Copy">复制</button>' +
        '<button class="btn sm" id="b64Again">换图</button>' +
      '</div>' +
    '</div>' +
    '<div class="label" style="margin-top:18px">反向：粘贴 DataURL → 图片</div>' +
    '<textarea class="ta" id="b64In" style="min-height:70px" placeholder="粘贴 data:image/png;base64,…"></textarea>' +
    '<button class="btn" style="width:100%;margin-top:10px" id="b64Rev">解析并预览</button>' +
    '<div class="canvas-wrap hidden" id="b64RevWrap" style="margin-top:10px"><img id="b64RevImg" style="width:100%;display:block"></div>';
  qs('#b64File', root).addEventListener('change', function(e){
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var fr = new FileReader();
    fr.onload = function(){
      var s = String(fr.result);
      qs('#b64Out', root).value = s;
      qs('#b64Info', root).textContent = '图片 ' + (f.size > 1048576 ? (f.size / 1048576).toFixed(2) + 'MB' : Math.round(f.size / 1024) + 'KB') +
        ' → Base64 长度 ' + s.length + ' 字符（约 ' + Math.round(s.length / 1024) + 'KB）';
      qs('#b64Prev', root).src = s;
      qs('#b64Drop', root).classList.add('hidden');
      qs('#b64Panel', root).classList.remove('hidden');
    };
    fr.readAsDataURL(f);
  });
  qs('#b64Copy', root).onclick = function(){ copyText(qs('#b64Out', root).value); };
  qs('#b64Again', root).onclick = function(){
    qs('#b64Panel', root).classList.add('hidden');
    qs('#b64Drop', root).classList.remove('hidden');
    qs('#b64File', root).value = '';
  };
  qs('#b64Rev', root).onclick = function(){
    var s = qs('#b64In', root).value.trim();
    if (!/^data:image\//.test(s)){ toast('内容不是 data:image 开头的 DataURL'); return; }
    var img = qs('#b64RevImg', root);
    img.onerror = function(){ toast('解析失败：不是有效的图片数据'); };
    img.src = s;
    qs('#b64RevWrap', root).classList.remove('hidden');
    toast('已解析，可长按图片保存');
  };
}

/* 工具 28：文件打包 ZIP（jszip，MIT） */
function tZip(root){
  root.innerHTML = '' +
    '<label class="file-drop" id="zpDrop">🗂️ 选择文件（任意类型，可多选）<input type="file" multiple id="zpFile"></label>' +
    '<div id="zpPanel" class="hidden">' +
      '<div class="label">文件列表 <span class="muted" id="zpCount"></span></div>' +
      '<div class="result-box" id="zpList" style="max-height:190px;overflow-y:auto;font-size:12px;line-height:1.9">-</div>' +
      '<div class="label">压缩包文件名</div>' +
      '<input class="inp" id="zpName" value="files">' +
      '<button class="btn accent" style="width:100%;margin-top:14px" id="zpGo">打包 ZIP</button>' +
      '<p class="hint" style="margin-top:10px">全本地打包 · 文件不离开你的设备</p>' +
    '</div>';
  var files = [];
  function sz(n){ return n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.round(n / 1024) + 'KB'; }
  qs('#zpFile', root).addEventListener('change', function(e){
    files = Array.prototype.slice.call(e.target.files || []);
    if (!files.length) return;
    qs('#zpDrop', root).classList.add('hidden');
    qs('#zpPanel', root).classList.remove('hidden');
    qs('#zpCount', root).textContent = files.length + ' 个 · 共 ' + sz(files.reduce(function(a, f){ return a + f.size; }, 0));
    qs('#zpList', root).innerHTML = files.map(function(f){ return '📄 ' + f.name + ' <span class="muted">(' + sz(f.size) + ')</span>'; }).join('<br>');
  });
  qs('#zpGo', root).onclick = function(){
    if (!files.length){ toast('先选择文件'); return; }
    var btn = this; btn.disabled = true; btn.textContent = '打包中…';
    var zip = new JSZip();
    files.forEach(function(f){ zip.file(f.name, f); });
    zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
      .then(function(bl){
        downloadBlob(bl, (qs('#zpName', root).value.trim() || 'files') + '.zip');
        btn.disabled = false; btn.textContent = '打包 ZIP';
      }, function(err){
        toast('打包失败：' + ((err && err.message) || err));
        btn.disabled = false; btn.textContent = '打包 ZIP';
      });
  };
}

/* 工具 29：天气查询（Open-Meteo 公开接口） */
function tWeather(root){
  var CODES = { 0:'☀️ 晴', 1:'🌤 大致晴朗', 2:'⛅ 局部多云', 3:'☁️ 阴', 45:'🌫 雾', 48:'🌫 雾凇', 51:'🌦 毛毛雨', 53:'🌦 毛毛雨', 55:'🌦 毛毛雨', 61:'🌧 小雨', 63:'🌧 中雨', 65:'🌧 大雨', 66:'🌧 冻雨', 67:'🌧 冻雨', 71:'🌨 小雪', 73:'🌨 中雪', 75:'❄️ 大雪', 77:'🌨 雪粒', 80:'🌦 阵雨', 81:'🌧 阵雨', 82:'⛈ 强阵雨', 85:'🌨 阵雪', 86:'🌨 强阵雪', 95:'⛈ 雷阵雨', 96:'⛈ 雷阵雨伴冰雹', 99:'⛈ 强雷暴' };
  root.innerHTML = '' +
    '<div class="row">' +
      '<input class="inp" id="wtCity" placeholder="输入城市，如 北京 / 深圳" style="flex:1">' +
      '<button class="btn sm accent" id="wtGo">查询</button>' +
    '</div>' +
    '<div class="row" style="margin-top:8px"><button class="btn sm" id="wtLoc">📍 定位我所在城市</button></div>' +
    '<div id="wtOut"><p class="hint" style="margin-top:14px">数据来自 Open-Meteo（免费公开接口，无需 Key）</p></div>';
  function render(city, data){
    var cur = data.current, daily = data.daily;
    var html = '<div class="result-box" style="margin-top:12px">' +
      '<div style="font-size:15px;font-weight:700">' + city + '</div>' +
      '<div style="font-size:34px;font-weight:800;margin:6px 0">' + Math.round(cur.temperature_2m) + '°C</div>' +
      '<div>' + (CODES[cur.weather_code] || '天气代码 ' + cur.weather_code) + ' · 体感 ' + Math.round(cur.apparent_temperature) + '°C</div>' +
      '<div class="muted" style="margin-top:6px">湿度 ' + cur.relative_humidity_2m + '% · 风速 ' + cur.wind_speed_10m + ' km/h</div>' +
      '</div>';
    if (daily && daily.time){
      html += '<div class="label" style="margin-top:14px">未来 5 天</div><div class="result-box">';
      for (var i=0;i<daily.time.length;i++){
        html += '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border)">' +
          '<span>' + daily.time[i].slice(5) + '</span>' +
          '<span>' + (CODES[daily.weather_code[i]] || '') + '</span>' +
          '<span>' + Math.round(daily.temperature_2m_min[i]) + '° ~ ' + Math.round(daily.temperature_2m_max[i]) + '°</span></div>';
      }
      html += '</div>';
    }
    qs('#wtOut', root).innerHTML = html;
  }
  function fetchWx(lat, lon, name){
    qs('#wtOut', root).innerHTML = '<p class="hint" style="margin-top:14px">查询天气中…</p>';
    fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5')
      .then(function(r){ return r.json(); })
      .then(function(d){ render(name, d); })
      .catch(function(){ qs('#wtOut', root).innerHTML = '<p class="hint" style="margin-top:14px">查询失败：网络不可用或接口异常</p>'; });
  }
  qs('#wtGo', root).onclick = function(){
    var city = qs('#wtCity', root).value.trim();
    if (!city){ toast('输入城市名'); return; }
    qs('#wtOut', root).innerHTML = '<p class="hint" style="margin-top:14px">正在定位「' + city + '」…</p>';
    fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&count=1&language=zh&format=json')
      .then(function(r){ return r.json(); })
      .then(function(g){
        if (!g.results || !g.results.length){ qs('#wtOut', root).innerHTML = '<p class="hint" style="margin-top:14px">没找到「' + city + '」，换个写法试试</p>'; return; }
        var it = g.results[0];
        fetchWx(it.latitude, it.longitude, it.name + (it.admin1 && it.admin1 !== it.name ? ' · ' + it.admin1 : ''));
      })
      .catch(function(){ qs('#wtOut', root).innerHTML = '<p class="hint" style="margin-top:14px">查询失败：网络不可用</p>'; });
  };
  qs('#wtLoc', root).onclick = function(){
    qs('#wtOut', root).innerHTML = '<p class="hint" style="margin-top:14px">正在通过 IP 定位…</p>';
    fetch('https://ipwho.is/').then(function(r){ return r.json(); }).then(function(ipr){
      if (ipr && ipr.success && ipr.latitude){
        fetchWx(ipr.latitude, ipr.longitude, (ipr.city || '') + ' · ' + (ipr.country || ''));
      } else {
        qs('#wtOut', root).innerHTML = '<p class="hint" style="margin-top:14px">定位失败，手动输入城市吧</p>';
      }
    }).catch(function(){ qs('#wtOut', root).innerHTML = '<p class="hint" style="margin-top:14px">定位失败：网络不可用</p>'; });
  };
}

/* 工具 30：汇率换算（Frankfurter 公开接口） */
function tFx(root){
  var CURR = ['CNY','USD','EUR','JPY','GBP','HKD','KRW','AUD','CAD','SGD','THB','MYR'];
  var NAMES = { CNY:'人民币', USD:'美元', EUR:'欧元', JPY:'日元', GBP:'英镑', HKD:'港币', KRW:'韩元', AUD:'澳元', CAD:'加元', SGD:'新元', THB:'泰铢', MYR:'马币' };
  root.innerHTML = '' +
    '<div class="row">' +
      '<input class="inp" id="fxAmt" type="number" value="100" style="flex:1;min-width:0">' +
      '<select class="inp" id="fxFrom" style="flex:1.2;min-width:0"></select>' +
      '<button class="btn sm" id="fxSwap">⇄</button>' +
      '<select class="inp" id="fxTo" style="flex:1.2;min-width:0"></select>' +
    '</div>' +
    '<div class="result-box" style="margin-top:12px;text-align:center;padding:22px 12px">' +
      '<div id="fxOut" style="font-size:26px;font-weight:800">-</div>' +
      '<div class="muted" id="fxRate" style="margin-top:6px;font-size:12px">-</div>' +
    '</div>' +
    '<div class="label">其他参考汇率</div>' +
    '<div class="result-box" id="fxList" style="font-size:12.5px;line-height:1.9">-</div>' +
    '<p class="hint" style="margin-top:10px">数据来自公开汇率接口（160+ 币种 · 每日更新 · 多源自动切换）</p>';
  [qs('#fxFrom', root), qs('#fxTo', root)].forEach(function(sel, i){
    CURR.forEach(function(c){
      var o = document.createElement('option');
      o.value = c; o.textContent = c + ' ' + NAMES[c];
      sel.appendChild(o);
    });
    sel.selectedIndex = i === 0 ? 0 : 1;
  });
  var rates = null, base = null;
  function ensureBase(cb){
    var from = qs('#fxFrom', root).value;
    if (rates && base === from){ cb(); return; }
    base = from;
    qs('#fxOut', root).textContent = '获取汇率中…';
    var srcs = [
      { u: 'https://api.exchangerate-api.com/v4/latest/' },
      { u: 'https://open.er-api.com/v6/latest/' },
      { u: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/', mod: true }
    ];
    (function next(i){
      if (i >= srcs.length){
        rates = null;
        qs('#fxOut', root).textContent = '获取失败';
        qs('#fxRate', root).textContent = '网络不可用或接口异常，稍后再试';
        return;
      }
      var s = srcs[i];
      var url = s.mod ? s.u + from.toLowerCase() + '.json' : s.u + from;
      var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var tm = ctl ? setTimeout(function(){ ctl.abort(); }, 5000) : null;
      fetch(url, ctl ? { signal: ctl.signal } : undefined)
        .then(function(r){ if (tm) clearTimeout(tm); return r.json(); })
        .then(function(d){
          var bank = d && d.rates;
          if (s.mod){
            var low = d && d[from.toLowerCase()];
            if (low && typeof low === 'object'){
              bank = {};
              for (var k in low) bank[k.toUpperCase()] = low[k];
            }
          }
          if (!bank || typeof bank !== 'object' || !Object.keys(bank).length) throw new Error('no rates');
          rates = bank; rates[from] = 1;
          cb();
        })
        .catch(function(){ if (tm) clearTimeout(tm); next(i + 1); });
    })(0);
  }
  function calc(){
    var amt = parseFloat(qs('#fxAmt', root).value) || 0;
    var to = qs('#fxTo', root).value;
    ensureBase(function(){
      var r = rates[to];
      if (r == null){ qs('#fxOut', root).textContent = '暂不支持该货币对'; return; }
      var out = amt * r;
      qs('#fxOut').textContent = (Math.round(out * 100) / 100).toLocaleString() + ' ' + to;
      qs('#fxRate', root).textContent = '1 ' + base + ' ≈ ' + (Math.round(r * 10000) / 10000) + ' ' + to + ' · ' + NAMES[base] + '→' + NAMES[to];
      var list = CURR.filter(function(c){ return c !== base; }).slice(0, 8).map(function(c){
        var rr = rates[c]; return rr == null ? null : c + ' ' + (Math.round(rr * 10000) / 10000);
      }).filter(Boolean).join(' · ');
      qs('#fxList', root).textContent = '1 ' + base + ' =  ' + list;
    });
  }
  qs('#fxAmt', root).addEventListener('input', calc);
  qs('#fxFrom', root).addEventListener('change', function(){ rates = null; calc(); });
  qs('#fxTo', root).addEventListener('change', calc);
  qs('#fxSwap', root).onclick = function(){
    var a = qs('#fxFrom', root), b = qs('#fxTo', root);
    var t = a.value; a.value = b.value; b.value = t;
    rates = null; calc();
  };
  calc();
}

/* 工具 31：IP 查询（ipwho.is 公开接口） */
function tIp(root){
  root.innerHTML = '' +
    '<div class="row">' +
      '<input class="inp" id="ipIn" placeholder="留空=查本机 IP，或输入 8.8.8.8" style="flex:1">' +
      '<button class="btn sm accent" id="ipGo">查询</button>' +
    '</div>' +
    '<div id="ipOut"><p class="hint" style="margin-top:14px">数据来自 ipwho.is（免费公开接口）</p></div>';
  qs('#ipGo', root).onclick = function(){
    var q = qs('#ipIn', root).value.trim();
    qs('#ipOut', root).innerHTML = '<p class="hint" style="margin-top:14px">查询中…</p>';
    fetch('https://ipwho.is/' + encodeURIComponent(q))
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (!d || d.success === false){
          qs('#ipOut', root).innerHTML = '<p class="hint" style="margin-top:14px">查询失败：' + ((d && d.message) || '无效 IP') + '</p>';
          return;
        }
        var flag = (d.flag && d.flag.emoji) ? d.flag.emoji + ' ' : '';
        qs('#ipOut', root).innerHTML =
          '<div class="result-box" style="margin-top:12px">' +
          '<div style="font-size:16px;font-weight:700">' + flag + (d.country || '') + ' · ' + (d.city || '') + '</div>' +
          '<div class="muted" style="margin-top:8px;line-height:2">' +
          'IP：' + d.ip + '<br>' +
          '地区：' + ([d.region, d.postal].filter(Boolean).join(' ') || '-') + '<br>' +
          '运营商：' + ((d.connection && d.connection.isp) || '-') + '<br>' +
          '经纬度：' + d.latitude + ', ' + d.longitude + '<br>' +
          '时区：' + ((d.timezone && d.timezone.id) || '-') + '<br>' +
          '类型：' + ((d.connection && d.connection.type) || '-') +
          '</div></div>' +
          '<div class="row" style="margin-top:10px">' +
          '<button class="btn sm" style="flex:1" id="ipCopy2">复制结果</button>' +
          '<button class="btn sm" id="ipMap">复制坐标</button></div>';
        qs('#ipCopy2', root).onclick = function(){
          copyText([d.ip, d.country, d.city, (d.connection && d.connection.isp) || ''].filter(Boolean).join(' · '));
        };
        qs('#ipMap', root).onclick = function(){
          copyText(d.latitude + ',' + d.longitude);
          toast('坐标已复制，可粘贴到地图 App');
        };
      })
      .catch(function(){ qs('#ipOut', root).innerHTML = '<p class="hint" style="margin-top:14px">查询失败：网络不可用</p>'; });
  };
}

/* 工具 32：翻译（MyMemory 公开接口） */
function tTranslate(root){
  var LANGS = [ ['zh-CN','中文'], ['en','英语'], ['ja','日语'], ['ko','韩语'], ['fr','法语'], ['de','德语'], ['es','西班牙语'], ['ru','俄语'] ];
  root.innerHTML = '' +
    '<div class="row">' +
      '<select class="inp" id="trFrom" style="flex:1"></select>' +
      '<button class="btn sm" id="trSwap">⇄</button>' +
      '<select class="inp" id="trTo" style="flex:1"></select>' +
    '</div>' +
    '<div class="label">原文</div>' +
    '<textarea class="ta" id="trIn" style="min-height:100px" placeholder="输入要翻译的文本（单次 500 字内）…"></textarea>' +
    '<button class="btn accent" style="width:100%;margin-top:10px" id="trGo">翻 译</button>' +
    '<div class="label">译文 <button class="btn sm" id="trCopy" style="height:30px">复制</button></div>' +
    '<div class="result-box" id="trOut" style="min-height:80px;user-select:text">—</div>' +
    '<p class="hint" style="margin-top:10px">数据来自 MyMemory（免费公开接口，无需 Key，有每日额度）</p>';
  [qs('#trFrom', root), qs('#trTo', root)].forEach(function(sel, i){
    LANGS.forEach(function(l){
      var o = document.createElement('option');
      o.value = l[0]; o.textContent = l[1];
      sel.appendChild(o);
    });
    sel.selectedIndex = i === 0 ? 0 : 1;
  });
  qs('#trGo', root).onclick = function(){
    var text = qs('#trIn', root).value.trim();
    if (!text){ toast('先输入要翻译的文本'); return; }
    var from = qs('#trFrom', root).value, to = qs('#trTo', root).value;
    if (from === to){ qs('#trOut', root).textContent = text; return; }
    qs('#trOut', root).textContent = '翻译中…';
    fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text.slice(0, 500)) + '&langpair=' + from + '|' + to)
      .then(function(r){ return r.json(); })
      .then(function(d){
        var t = d && d.responseData && d.responseData.translatedText;
        qs('#trOut', root).textContent = t || '翻译失败，稍后再试';
      })
      .catch(function(){ qs('#trOut', root).textContent = '翻译失败：网络不可用'; });
  };
  qs('#trSwap', root).onclick = function(){
    var a = qs('#trFrom', root), b = qs('#trTo', root);
    var t = a.value; a.value = b.value; b.value = t;
  };
  qs('#trCopy', root).onclick = function(){ copyText(qs('#trOut', root).textContent); };
}

/* ===== 注册第四批工具 ===== */
TB_TOOLS.push(
  { id:'qrscan',    name:'二维码识别',   desc:'图片扫码 / 条码识别',   icon:'📷', cat:'img',  grad:'linear-gradient(135deg,#f472b6,#9d174d)', render: tQrScan },
  { id:'collage',   name:'图片拼接',     desc:'2~9 张拼成一张',       icon:'🧩', cat:'img',  grad:'linear-gradient(135deg,#fbbf24,#b45309)', render: tCollage },
  { id:'eyedrop',   name:'图片取色',     desc:'点哪取哪的颜色',        icon:'💉', cat:'img',  grad:'linear-gradient(135deg,#22d3ee,#0e7490)', render: tEyedropper },
  { id:'imgb64',    name:'图片 ↔ Base64', desc:'图片与 Base64 互转',   icon:'🧬', cat:'img',  grad:'linear-gradient(135deg,#a3e635,#4d7c0f)', render: tImg2B64 },
  { id:'zip',       name:'文件打包 ZIP', desc:'多文件压成一个包',      icon:'🗜️', cat:'text', grad:'linear-gradient(135deg,#f97316,#c2410c)', render: tZip },
  { id:'weather',   name:'天气查询',     desc:'当前 + 未来 5 天',      icon:'⛅', cat:'net',  grad:'linear-gradient(135deg,#38bdf8,#2563eb)', render: tWeather },
  { id:'fx',        name:'汇率换算',     desc:'实时汇率 · 160+ 币种',  icon:'💱', cat:'net',  grad:'linear-gradient(135deg,#34d399,#047857)', render: tFx },
  { id:'ip',        name:'IP 查询',      desc:'归属地 / 运营商',       icon:'🌐', cat:'net',  grad:'linear-gradient(135deg,#818cf8,#4338ca)', render: tIp },
  { id:'translate', name:'翻译',         desc:'中英日韩等 8 语互译',   icon:'🌍', cat:'net',  grad:'linear-gradient(135deg,#f472b6,#be185d)', render: tTranslate }
);
