/* 百宝箱 · 第六批工具：视频转音频 / OCR / 文字卡片 / 九宫格切图 / 屏幕检测 */

function escH(s){
  return String(s == null ? '' : s).replace(/[<>&"]/g, function(c){
    return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
  });
}

/* 工具 34：视频转音频（链接 → MP3 / M4A） */
function tVideoAudio(root){
  root.innerHTML = '' +
    '<div class="label">粘贴视频分享链接</div>' +
    '<textarea class="ta" id="vaIn" style="min-height:76px" placeholder="支持抖音 / B站 / 快手 / 小红书…（与视频下载相同）"></textarea>' +
    '<div class="label">输出格式</div>' +
    '<div class="seg" id="vaFmt"><button data-v="m4a" class="active">M4A · 原声音质</button><button data-v="mp3">MP3 · 兼容性好</button></div>' +
    '<button class="btn accent" style="width:100%;margin-top:12px" id="vaGo">解析并提取音频</button>' +
    '<div id="vaOut"><p class="hint" style="margin-top:12px">由服务器 ffmpeg 提取 · 仅供个人学习备份</p></div>';
  qs('#vaFmt', root).addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    root.querySelectorAll('#vaFmt button').forEach(function(x){ x.classList.toggle('active', x === b); });
  });
  qs('#vaGo', root).onclick = function(){
    var link = qs('#vaIn', root).value.trim();
    if (!link){ toast('先粘贴链接'); return; }
    var fmtBtn = root.querySelector('#vaFmt button.active');
    var fmt = fmtBtn ? fmtBtn.dataset.v : 'm4a';
    var btn = this;
    var out = qs('#vaOut', root);
    if (!window.TBApi){ out.innerHTML = '<p class="hint" style="margin-top:12px">组件未加载</p>'; return; }
    btn.disabled = true; btn.textContent = '解析中…';
    out.innerHTML = '<p class="hint" style="margin-top:12px">正在解析视频…</p>';
    window.TBApi.videoParse(link).then(function(r){
      if (!r || !r.ok){
        btn.disabled = false; btn.textContent = '解析并提取音频';
        out.innerHTML = '<p class="hint" style="margin-top:12px">解析失败：' + escH((r && r.error) || (r && r.__net ? '连不上服务器' : '未知错误')) + '</p>';
        return;
      }
      var url = window.TBApi.videoAudio(r.video, r.title || 'audio', r.referer, fmt);
      var aname = String(r.title || 'audio').slice(0, 30) + (fmt === 'mp3' ? '.mp3' : '.m4a');
      if (window.AndroidBridge && window.AndroidBridge.downloadUrl){
        window.AndroidBridge.downloadUrl(url, aname);
        btn.disabled = false; btn.textContent = '解析并提取音频';
        out.innerHTML = '<p class="hint" style="margin-top:12px">已交给系统下载：' + escH(aname) + '（完成后见系统通知栏）</p>';
        return;
      }
      btn.textContent = '提取中…（视视频大小，稍等）';
      out.innerHTML = '<p class="hint" style="margin-top:12px">已解析「' + escH((r.title || '').slice(0, 30)) + '」，正在提取音频…</p>';
      fetch(url).then(function(resp){ return resp.blob(); }).then(function(bl){
        downloadBlob(bl, String(r.title || 'audio').slice(0, 30) + (fmt === 'mp3' ? '.mp3' : '.m4a'));
        btn.disabled = false; btn.textContent = '解析并提取音频';
        out.innerHTML = '<div class="result-box" style="margin-top:12px">' +
          '<div style="font-weight:700">' + escH(r.title || '') + '</div>' +
          '<div class="muted" style="margin-top:6px;font-size:12px">' + escH(r.author || '') + ' · ' + (fmt === 'mp3' ? 'MP3' : 'M4A') + ' · 约 ' + Math.round(bl.size / 1024) + 'KB</div></div>' +
          '<p class="hint" style="margin-top:10px">已保存 · 仅供个人学习备份</p>';
      }, function(){
        btn.disabled = false; btn.textContent = '解析并提取音频';
        out.innerHTML = '<p class="hint" style="margin-top:12px">提取失败：服务器未装 ffmpeg 或网络异常</p>';
      });
    }, function(){
      btn.disabled = false; btn.textContent = '解析并提取音频';
      out.innerHTML = '<p class="hint" style="margin-top:12px">解析失败：网络或服务器异常</p>';
    });
  };
}

/* 工具 35：OCR 文字识别（服务器 tesseract） */
function tOcr(root){
  root.innerHTML = '' +
    '<label class="file-drop" id="ocDrop">🖼️ 选择含文字的图片（截图 / 照片 / 文档）<input type="file" accept="image/*" id="ocFile"></label>' +
    '<div id="ocPanel" class="hidden">' +
      '<div class="canvas-wrap"><img id="ocPrev" style="width:100%;display:block"></div>' +
      '<button class="btn accent" style="width:100%;margin-top:12px" id="ocGo">开始识别（中文 + 英文）</button>' +
      '<div class="label">识别结果 <button class="btn sm" id="ocCopy" style="height:30px">复制</button></div>' +
      '<textarea class="ta" id="ocOut" style="min-height:150px" placeholder="识别结果将显示在这里…"></textarea>' +
      '<p class="hint" style="margin-top:10px">由你的服务器运行 tesseract 识别 · 图片不出你的服务器</p>' +
    '</div>';
  var file = null;
  qs('#ocFile', root).addEventListener('change', function(e){
    file = e.target.files && e.target.files[0];
    if (!file) return;
    qs('#ocPrev', root).src = URL.createObjectURL(file);
    qs('#ocDrop', root).classList.add('hidden');
    qs('#ocPanel', root).classList.remove('hidden');
    qs('#ocOut', root).value = '';
  });
  qs('#ocGo', root).onclick = function(){
    if (!file){ toast('先选择图片'); return; }
    var btn = this;
    var out = qs('#ocOut', root);
    btn.disabled = true; btn.textContent = '识别中…（大图稍慢）';
    window.TBApi.ocr(file).then(function(r){
      btn.disabled = false; btn.textContent = '开始识别（中文 + 英文）';
      if (r && r.ok){
        out.value = r.text || '';
        toast('识别完成 · ' + (r.chars || 0) + ' 字');
      } else if (r && r.__net){
        out.value = '识别失败：连不上服务器（到 我的 → 云同步 检查地址）';
      } else {
        out.value = '识别失败：' + ((r && r.error) || '未知错误');
      }
    }, function(){
      btn.disabled = false; btn.textContent = '开始识别（中文 + 英文）';
      out.value = '识别失败：网络异常';
    });
  };
  qs('#ocCopy', root).onclick = function(){ copyText(qs('#ocOut', root).value); };
}

/* 工具 36：文字卡片（文字 → 精美图片） */
function tQuote(root){
  var THEMES = [
    ['#5b8cff', '#8b5cf6'], ['#f43f5e', '#fb923c'], ['#0ea5e9', '#22d3ee'],
    ['#1f2937', '#4b5563'], ['#16a34a', '#84cc16'], ['#db2777', '#f472b6']
  ];
  root.innerHTML = '' +
    '<div class="label">文字内容</div>' +
    '<textarea class="ta" id="qtIn" style="min-height:104px">所有打不倒你的，都会让你更强大。</textarea>' +
    '<div class="label">署名（可选）</div>' +
    '<input class="inp" id="qtBy" placeholder="—— 百宝箱">' +
    '<div class="label">背景</div>' +
    '<div class="row" id="qtThemes" style="gap:8px;flex-wrap:wrap"></div>' +
    '<div class="label">字号 <span id="qtSv" class="muted">44</span></div>' +
    '<input type="range" id="qtSize" min="26" max="72" value="44">' +
    '<div class="canvas-wrap" style="margin-top:12px"><canvas id="qtCv"></canvas></div>' +
    '<button class="btn accent" style="width:100%;margin-top:12px" id="qtDl">保存图片</button>';
  var themeIdx = 0, timer = null;
  function draw(){
    var cv = qs('#qtCv', root);
    var W = 1080, H = 1440;
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var th = THEMES[themeIdx];
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, th[0]); g.addColorStop(1, th[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.font = 'bold 260px Georgia, serif';
    ctx.fillText('“', 60, 330);
    ctx.fillText('”', W - 260, H - 110);
    var size = parseFloat(qs('#qtSize', root).value);
    qs('#qtSv', root).textContent = size;
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 ' + size + 'px system-ui, "PingFang SC", "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    var text = (qs('#qtIn', root).value || ' ').trim();
    var lines = [];
    text.split('\n').forEach(function(par){
      var cur = '';
      for (var i = 0; i < par.length; i++){
        if (ctx.measureText(cur + par[i]).width > W - 240){ lines.push(cur); cur = ''; }
        cur += par[i];
      }
      lines.push(cur);
    });
    var lh = size * 1.6;
    var startY = H / 2 - (lines.length - 1) * lh / 2;
    lines.forEach(function(ln, i){ ctx.fillText(ln, W / 2, startY + i * lh); });
    var by = qs('#qtBy', root).value.trim();
    if (by){
      ctx.font = '400 ' + Math.max(24, size * 0.55) + 'px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(by, W / 2, startY + lines.length * lh + size * 0.8);
    }
  }
  function renderThemes(){
    var box = qs('#qtThemes', root);
    box.innerHTML = '';
    THEMES.forEach(function(th, i){
      var b = document.createElement('button');
      b.style.cssText = 'width:46px;height:46px;border-radius:12px;border:2px solid ' + (i === themeIdx ? 'var(--text)' : 'transparent') + ';background:linear-gradient(135deg,' + th[0] + ',' + th[1] + ')';
      b.onclick = function(){ themeIdx = i; renderThemes(); draw(); };
      box.appendChild(b);
    });
  }
  qs('#qtIn', root).addEventListener('input', function(){ clearTimeout(timer); timer = setTimeout(draw, 250); });
  qs('#qtBy', root).addEventListener('input', function(){ clearTimeout(timer); timer = setTimeout(draw, 250); });
  qs('#qtSize', root).addEventListener('input', function(){ clearTimeout(timer); timer = setTimeout(draw, 120); });
  qs('#qtDl', root).onclick = function(){ downloadCanvas(qs('#qtCv', root), 'quote-card.png'); };
  renderThemes(); draw();
}

/* 工具 37：九宫格切图 */
function tNineGrid(root){
  root.innerHTML = '' +
    '<label class="file-drop" id="ngDrop">🖼️ 选择图片（自动居中裁成正方形）<input type="file" accept="image/*" id="ngFile"></label>' +
    '<div id="ngPanel" class="hidden">' +
      '<div class="label">预览（点单张可单独保存）</div>' +
      '<div id="ngGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px"></div>' +
      '<div class="row" style="margin-top:12px">' +
        '<button class="btn accent" style="flex:1" id="ngZip">打包下载 9 张（ZIP）</button>' +
        '<button class="btn sm" id="ngAgain">换图</button>' +
      '</div>' +
      '<p class="hint" style="margin-top:10px">发圈时按 1~9 顺序选九宫格，即可拼回完整大图</p>' +
    '</div>';
  var tiles = [];
  qs('#ngFile', root).addEventListener('change', function(e){
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var im = new Image();
    im.onload = function(){
      var s = Math.min(im.width, im.height);
      var sx = (im.width - s) / 2, sy = (im.height - s) / 2;
      var cell = Math.min(360, Math.floor(s / 3));
      tiles = [];
      var grid = qs('#ngGrid', root);
      grid.innerHTML = '';
      for (var r = 0; r < 3; r++){
        for (var c = 0; c < 3; c++){
          var cv = document.createElement('canvas');
          cv.width = cell; cv.height = cell;
          cv.getContext('2d').drawImage(im, sx + c * s / 3, sy + r * s / 3, s / 3, s / 3, 0, 0, cell, cell);
          tiles.push(cv);
          var wrap = document.createElement('div');
          wrap.style.cssText = 'cursor:pointer';
          var img = document.createElement('img');
          img.src = cv.toDataURL();
          img.style.cssText = 'width:100%;display:block';
          wrap.appendChild(img);
          (function(cv2, idx){
            wrap.onclick = function(){ downloadCanvas(cv2, 'tile-' + (idx + 1) + '.png'); };
          })(cv, r * 3 + c);
          grid.appendChild(wrap);
        }
      }
      qs('#ngDrop', root).classList.add('hidden');
      qs('#ngPanel', root).classList.remove('hidden');
    };
    im.src = URL.createObjectURL(f);
  });
  qs('#ngZip', root).onclick = function(){
    if (!tiles.length){ toast('先选图片'); return; }
    var btn = this; btn.disabled = true; btn.textContent = '打包中…';
    var zip = new JSZip();
    tiles.forEach(function(cv, i){
      var bl = canvasBlob(cv, 'image/png');
      if (bl) zip.file('tile-' + (i + 1) + '.png', bl);
    });
    zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }).then(function(bl){
      downloadBlob(bl, 'nine-grid.zip');
      btn.disabled = false; btn.textContent = '打包下载 9 张（ZIP）';
    });
  };
  qs('#ngAgain', root).onclick = function(){
    qs('#ngPanel', root).classList.add('hidden');
    qs('#ngDrop', root).classList.remove('hidden');
    qs('#ngFile', root).value = '';
  };
}

/* 工具 38：屏幕检测（坏点 / 烧屏） */
function tDeadPixel(root){
  var COLORS = [['红', '#ff0000'], ['绿', '#00ff00'], ['蓝', '#0000ff'], ['白', '#ffffff'], ['黑', '#000000'], ['灰', '#808080']];
  root.innerHTML = '' +
    '<div class="result-box" style="text-align:center;padding:40px 12px">' +
      '<div style="font-size:40px">🔲</div>' +
      '<div style="margin-top:10px;font-weight:700">坏点 / 烧屏检测</div>' +
      '<div class="muted" style="margin-top:6px;font-size:12px">全屏依次显示 6 种纯色，检查是否有坏点、亮点、烧屏</div>' +
    '</div>' +
    '<button class="btn accent" style="width:100%;margin-top:14px" id="dpGo">开始全屏检测</button>' +
    '<p class="hint" style="margin-top:10px">检测时轻点屏幕切换颜色 · 右上角 ✕ 退出</p>';
  var ovRef = null;
  function closeOverlay(){
    if (ovRef && ovRef.parentNode) ovRef.parentNode.removeChild(ovRef);
    ovRef = null;
  }
  addCleanup(closeOverlay);
  qs('#dpGo', root).onclick = function(){
    if (ovRef) return;
    var idx = 0;
    var ov = document.createElement('div');
    ov.id = 'dpOverlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:500;display:flex;align-items:center;justify-content:center;touch-action:none';
    var tip = document.createElement('div');
    tip.style.cssText = 'font-size:14px;opacity:.55;pointer-events:none';
    var close = document.createElement('div');
    close.textContent = '✕';
    close.style.cssText = 'position:absolute;top:calc(14px + env(safe-area-inset-top));right:18px;width:40px;height:40px;border-radius:50%;background:rgba(128,128,128,.4);color:#fff;font-size:17px;display:flex;align-items:center;justify-content:center';
    var invert = { '#ff0000': '#000', '#00ff00': '#000', '#0000ff': '#fff', '#ffffff': '#000', '#000000': '#fff', '#808080': '#fff' };
    function apply(){
      ov.style.background = COLORS[idx][1];
      tip.style.color = invert[COLORS[idx][1]] || '#000';
      tip.textContent = COLORS[idx][0] + ' · ' + (idx + 1) + '/' + COLORS.length + ' · 轻点切换';
    }
    ov.onclick = function(e){
      if (e.target === close) return;
      idx++;
      if (idx >= COLORS.length){ closeOverlay(); toast('检测完成 ✓'); return; }
      apply();
    };
    close.onclick = function(e){ e.stopPropagation(); closeOverlay(); };
    ov.appendChild(tip); ov.appendChild(close);
    document.body.appendChild(ov);
    ovRef = ov;
    apply();
  };
}

/* ===== 注册第六批工具 ===== */
TB_TOOLS.push(
  { id:'videoaudio', name:'视频转音频', desc:'链接 → MP3 / M4A',      icon:'🎵', cat:'net',  grad:'linear-gradient(135deg,#8b5cf6,#6d28d9)', render: tVideoAudio },
  { id:'ocr',        name:'OCR 文字识别', desc:'图片提取文字（中英）', icon:'🔍', cat:'img',  grad:'linear-gradient(135deg,#60a5fa,#1d4ed8)', render: tOcr },
  { id:'quote',      name:'文字卡片',    desc:'一句话转精美图片',      icon:'💬', cat:'img',  grad:'linear-gradient(135deg,#e879f9,#a21caf)', render: tQuote },
  { id:'ninegrid',   name:'九宫格切图',  desc:'一张图切九张发圈',      icon:'🧱', cat:'img',  grad:'linear-gradient(135deg,#fbbf24,#ea580c)', render: tNineGrid },
  { id:'deadpixel',  name:'屏幕检测',    desc:'坏点 / 烧屏检测',       icon:'🔲', cat:'calc', grad:'linear-gradient(135deg,#64748b,#0f172a)', render: tDeadPixel }
);
