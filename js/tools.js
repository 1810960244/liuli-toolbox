/* 百宝箱 · 工具注册表 & 实现（全部本地运行，无网络请求） */

function qs(s, r){ return (r || document).querySelector(s); }
function addCleanup(f){ (window.__tbCleanup = window.__tbCleanup || []).push(f); }
function dataUrlToBlob(du){
  try {
    var parts = du.split(',');
    var mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/png';
    var bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  } catch(e){ return null; }
}
function canvasBlob(cv, type, quality){
  /* 注意：本环境（minis:// WebView）canvas.toBlob 不回调 —— 统一走 toDataURL 同步转换 */
  try { return dataUrlToBlob(cv.toDataURL(type || 'image/png', quality)); }
  catch(e){ return null; }
}
function downloadCanvas(cv, name){
  var bl = canvasBlob(cv, 'image/png');
  if (bl) downloadBlob(bl, name);
  else toast('导出失败，请重试');
}
function downloadBlob(bl, name){
  /* App 内（WebView 桥）：小文件走原生保存到系统「下载」目录 */
  if (window.AndroidBridge && window.AndroidBridge.saveBase64 && bl && bl.size <= 40 * 1024 * 1024){
    try {
      var fr = new FileReader();
      fr.onload = function(){
        try {
          var du = String(fr.result);
          window.AndroidBridge.saveBase64(name, bl.type || 'application/octet-stream', du.slice(du.indexOf(',') + 1));
          toast('已保存到「下载」：' + name);
        } catch(e2){ toast('保存失败，请重试'); }
      };
      fr.readAsDataURL(bl);
      return;
    } catch(e){ /* 回退到浏览器下载 */ }
  }
  try {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(bl);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 800);
    toast('已保存' + name);
  } catch(e){ toast('若未自动下载，请长按图片保存'); }
}

/* ===== 分类 & 工具清单 ===== */
const TB_CATS = [
  { id:'all',  name:'全部' },
  { id:'img',  name:'图片' },
  { id:'text', name:'文本' },
  { id:'calc', name:'计算' },
  { id:'net',  name:'网络' },
];

const TB_TOOLS = [
  { id:'qr',        name:'二维码生成',  desc:'文本/链接一键转码',    icon:'🔳', cat:'img',  grad:'linear-gradient(135deg,#5b8cff,#8b5cf6)', render: tQr },
  { id:'inpaint',   name:'图片去水印',  desc:'涂抹即可智能修复',     icon:'🩹', cat:'img',  grad:'linear-gradient(135deg,#ff758c,#ff7eb3)', render: tInpaint },
  { id:'compress',  name:'图片压缩',    desc:'体积直降画质可调',     icon:'🗜️', cat:'img',  grad:'linear-gradient(135deg,#22d3ee,#3b82f6)', render: tCompress },
  { id:'watermark', name:'图片加水印',  desc:'文字水印防搬运',       icon:'💧', cat:'img',  grad:'linear-gradient(135deg,#38bdf8,#6366f1)', render: tWatermark },
  { id:'json',      name:'JSON 格式化', desc:'格式化/压缩/校验',     icon:'🧾', cat:'text', grad:'linear-gradient(135deg,#f59e0b,#f97316)', render: tJson },
  { id:'base64',    name:'Base64 编解码',desc:'文本与 Base64 互转',  icon:'🔄', cat:'text', grad:'linear-gradient(135deg,#34d399,#10b981)', render: tBase64 },
  { id:'password',  name:'随机密码',    desc:'高强度密码生成器',     icon:'🎲', cat:'calc', grad:'linear-gradient(135deg,#a78bfa,#8b5cf6)', render: tPassword },
  { id:'timestamp', name:'时间戳转换',  desc:'Unix 时间与日期互转',  icon:'⏱️', cat:'calc', grad:'linear-gradient(135deg,#fb7185,#f43f5e)', render: tTimestamp },
];

const TB_SOON = [
  { name:'背景移除', icon:'✂️', grad:'linear-gradient(135deg,#f472b6,#db2777)' },
  { name:'文档扫描', icon:'📑', grad:'linear-gradient(135deg,#fbbf24,#d97706)' },
  { name:'视频压缩', icon:'🎞️', grad:'linear-gradient(135deg,#2dd4bf,#0d9488)' },
  { name:'剪贴板工具', icon:'📋', grad:'linear-gradient(135deg,#94a3b8,#475569)' },
];

/* ===== 工具 1：二维码生成 ===== */
function tQr(root){
  root.innerHTML = '' +
    '<div class="label">内容</div>' +
    '<textarea class="ta" id="qrText" placeholder="输入文本或链接…">https://github.com</textarea>' +
    '<div class="row" style="margin-top:12px;align-items:flex-end">' +
      '<div style="flex:1"><div class="label" style="margin:0 0 6px">前景色</div><input type="color" id="qrFg" value="#111827"></div>' +
      '<div style="flex:1"><div class="label" style="margin:0 0 6px">背景色</div><input type="color" id="qrBg" value="#ffffff"></div>' +
    '</div>' +
    '<div class="label">样式</div>' +
    '<div class="seg" id="qrStyle"><button data-v="rounded" class="active">圆点</button><button data-v="dots">小圆点</button><button data-v="square">方块</button></div>' +
    '<div class="canvas-wrap" style="background:#fff" id="qrHolder"></div>' +
    '<button class="btn accent btn-block" style="margin-top:14px;width:100%" id="qrDl">保存图片</button>' +
    '<p class="hint" style="margin-top:10px">全本地生成 · 无网络也秒出图</p>';

  var holder = qs('#qrHolder', root);
  var style = 'rounded';
  var qr = null;
  var timer = null;

  function fg(){ return qs('#qrFg', root).value; }
  function bg(){ return qs('#qrBg', root).value; }
  function data(){ return qs('#qrText', root).value.trim() || ' '; }

  function build(){
    if (!window.QRCodeStyling){ holder.innerHTML = '<div style="padding:24px;color:#888;font-size:13px">二维码组件加载失败</div>'; return; }
    holder.innerHTML = '';
    try {
      qr = new QRCodeStyling({
        width: 560, height: 560, type: 'canvas', data: data(), margin: 28,
        qrOptions: { errorCorrectionLevel: 'M' },
        dotsOptions: { color: fg(), type: style },
        backgroundOptions: { color: bg() },
        cornersSquareOptions: { type: style === 'square' ? 'square' : 'extra-rounded', color: fg() },
        cornersDotOptions: { color: fg() }
      });
      qr.append(holder);
    } catch(e){ holder.innerHTML = '<div style="padding:24px;color:#888;font-size:13px">生成失败：' + e.message + '</div>'; }
  }
  function update(){
    if (!qr) return;
    try {
      qr.update({
        data: data(),
        dotsOptions: { color: fg(), type: style },
        backgroundOptions: { color: bg() },
        cornersSquareOptions: { type: style === 'square' ? 'square' : 'extra-rounded', color: fg() }
      });
    } catch(e){}
  }
  function debounceUpdate(){ clearTimeout(timer); timer = setTimeout(update, 260); }

  build();
  qs('#qrText', root).addEventListener('input', debounceUpdate);
  qs('#qrFg', root).addEventListener('input', debounceUpdate);
  qs('#qrBg', root).addEventListener('input', debounceUpdate);
  qs('#qrStyle', root).addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    style = b.dataset.v;
    root.querySelectorAll('#qrStyle button').forEach(function(x){ x.classList.toggle('active', x === b); });
    update();
  });
  qs('#qrDl', root).addEventListener('click', function(){
    if (qr && qr.download) qr.download({ name: 'qrcode', extension: 'png' });
    toast('保存中…若无反应请长按二维码');
  });
}

/* ===== 工具 2：图片去水印（本地修复算法） ===== */
function tInpaint(root){
  root.innerHTML = '' +
    '<label class="file-drop" id="ipDrop">📷 点击选择需要去水印的图片<input type="file" accept="image/*" id="ipFile"></label>' +
    '<div id="ipEditor" class="hidden">' +
      '<div class="label">涂抹要消除的区域（完全盖住水印，多出一点边）</div>' +
      '<div class="canvas-wrap"><canvas id="ipCv"></canvas></div>' +
      '<div class="label">笔刷大小</div>' +
      '<input type="range" id="ipBrush" min="8" max="60" value="26">' +
      '<div class="row" style="margin-top:12px">' +
        '<button class="btn sm" id="ipUndo">撤销</button>' +
        '<button class="btn sm" id="ipClear">清除</button>' +
        '<button class="btn accent" style="flex:1" id="ipRun">开始修复</button>' +
      '</div>' +
      '<button class="btn" style="width:100%;margin-top:10px" id="ipDl">保存图片</button>' +
      '<p class="hint" style="margin-top:10px">把水印整个涂住即可（算法会自动多修一圈）· 复杂背景建议接 AI 修复（服务器版规划中）</p>' +
    '</div>';

  var base = document.createElement('canvas');
  var bctx = base.getContext('2d', { willReadFrequently: true });
  var cv = qs('#ipCv', root);
  var ctx = cv.getContext('2d', { willReadFrequently: true });
  var strokes = [], drawing = false, cur = null, loaded = false;

  function factor(){ var r = cv.getBoundingClientRect(); return cv.width / (r.width || cv.width); }
  function pos(e){ var r = cv.getBoundingClientRect(); var f = cv.width / r.width; return { x:(e.clientX - r.left) * f, y:(e.clientY - r.top) * f }; }
  function drawStroke(st){
    ctx.save();
    ctx.strokeStyle = 'rgba(255,64,100,.45)'; ctx.fillStyle = 'rgba(255,64,100,.45)';
    ctx.lineWidth = st.r * 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var p = st.pts;
    if (p.length === 1){ ctx.beginPath(); ctx.arc(p[0].x, p[0].y, st.r, 0, Math.PI*2); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); for (var j=1;j<p.length;j++) ctx.lineTo(p[j].x, p[j].y); ctx.stroke(); }
    ctx.restore();
  }
  function redraw(){
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(base, 0, 0);
    for (var i=0;i<strokes.length;i++) drawStroke(strokes[i]);
    if (cur) drawStroke(cur);
  }

  qs('#ipFile', root).addEventListener('change', function(e){
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var img = new Image();
    img.onload = function(){
      var w = img.naturalWidth, h = img.naturalHeight, m = 2000;
      var s = Math.min(1, m / Math.max(w, h));
      w = Math.round(w * s); h = Math.round(h * s);
      base.width = w; base.height = h; bctx.drawImage(img, 0, 0, w, h);
      cv.width = w; cv.height = h;
      strokes = []; loaded = true;
      qs('#ipDrop', root).classList.add('hidden');
      qs('#ipEditor', root).classList.remove('hidden');
      redraw();
      toast('图片已载入，涂抹水印区域后点「开始修复」');
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  });

  cv.addEventListener('pointerdown', function(e){
    if (!loaded) return; e.preventDefault();
    drawing = true;
    var r = parseFloat(qs('#ipBrush', root).value) * factor() / 2;
    cur = { r: Math.max(3, r), pts: [pos(e)] };
    try { cv.setPointerCapture(e.pointerId); } catch(_e){}
    redraw();
  });
  cv.addEventListener('pointermove', function(e){
    if (!drawing || !cur) return; e.preventDefault();
    var p = pos(e), last = cur.pts[cur.pts.length-1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
    cur.pts.push(p); redraw();
  });
  function endStroke(){ if (!drawing) return; drawing = false; if (cur && cur.pts.length) strokes.push(cur); cur = null; redraw(); }
  cv.addEventListener('pointerup', endStroke);
  cv.addEventListener('pointercancel', endStroke);

  qs('#ipUndo', root).onclick = function(){ strokes.pop(); redraw(); };
  qs('#ipClear', root).onclick = function(){ strokes = []; redraw(); };
  qs('#ipRun', root).onclick = function(){
    if (!loaded) return;
    if (!strokes.length){ toast('先涂抹要消除的区域'); return; }
    var btn = this; btn.disabled = true; btn.textContent = '修复中…';
    setTimeout(function(){
      try {
        var img = bctx.getImageData(0, 0, cv.width, cv.height);
        inpaintRegion(img, cv.width, cv.height, strokes);
        bctx.putImageData(img, 0, 0);
        strokes = []; redraw();
        toast('修复完成 ✓ 可继续处理细节');
      } catch(err){ toast('修复失败：' + err.message); }
      btn.disabled = false; btn.textContent = '开始修复';
    }, 30);
  };
  qs('#ipDl', root).onclick = function(){ if (loaded) downloadCanvas(cv, 'clean.png'); };
}

/* 局部修复核心：洋葱填充 + 平滑（纯本地扩散算法） */
function inpaintRegion(imgData, w, h, strokes){
  var d = imgData.data, mask = new Uint8Array(w * h);
  var minX = w, minY = h, maxX = -1, maxY = -1, any = false;
  for (var si=0; si<strokes.length; si++){
    var st = strokes[si], r = st.r, r2 = r * r;
    for (var pi=0; pi<st.pts.length; pi++){
      var p = st.pts[pi];
      var x0 = Math.max(0, Math.floor(p.x - r)), x1 = Math.min(w-1, Math.ceil(p.x + r));
      var y0 = Math.max(0, Math.floor(p.y - r)), y1 = Math.min(h-1, Math.ceil(p.y + r));
      for (var y=y0; y<=y1; y++) for (var x=x0; x<=x1; x++){
        var dx = x - p.x, dy = y - p.y;
        if (dx*dx + dy*dy <= r2){
          var idx = y * w + x;
          if (!mask[idx]){ mask[idx] = 1; any = true; }
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
  }
  if (!any) return;
  /* 容错：掩码自动向外膨胀 6 层 —— 涂抹不精确（没完全盖住）时也能修干净 */
  for (var dp = 0; dp < 6; dp++){
    var ex = [];
    for (y = Math.max(0, minY - 1); y <= Math.min(h - 1, maxY + 1); y++){
      for (x = Math.max(0, minX - 1); x <= Math.min(w - 1, maxX + 1); x++){
        var ii = y * w + x;
        if (mask[ii]) continue;
        if ((x > 0 && mask[ii - 1]) || (x < w - 1 && mask[ii + 1]) || (y > 0 && mask[ii - w]) || (y < h - 1 && mask[ii + w])) ex.push(ii);
      }
    }
    if (!ex.length) break;
    for (var ei = 0; ei < ex.length; ei++){
      var ix = ex[ei], px2 = ix % w, py2 = (ix / w) | 0;
      mask[ix] = 1;
      if (px2 < minX) minX = px2; if (px2 > maxX) maxX = px2;
      if (py2 < minY) minY = py2; if (py2 > maxY) maxY = py2;
    }
  }
  minX = Math.max(0, minX - 2); minY = Math.max(0, minY - 2);
  maxX = Math.min(w-1, maxX + 2); maxY = Math.min(h-1, maxY + 2);
  var bw = maxX - minX + 1, bh = maxY - minY + 1;
  var R = new Float32Array(bw*bh), G = new Float32Array(bw*bh), B = new Float32Array(bw*bh), F = new Uint8Array(bw*bh);
  var x, y, j, i, remaining = 0;
  for (y=0; y<bh; y++) for (x=0; x<bw; x++){
    j = y*bw + x; i = ((minY+y)*w + (minX+x)) * 4;
    R[j] = d[i]; G[j] = d[i+1]; B[j] = d[i+2];
    if (mask[(minY+y)*w + (minX+x)]) remaining++; else F[j] = 1;
  }
  var guard = 0;
  while (remaining > 0 && guard++ < 3000){
    var tj = [], tr = [], tg = [], tb = [];
    for (y=1; y<bh-1; y++) for (x=1; x<bw-1; x++){
      j = y*bw + x; if (F[j]) continue;
      var n = 0, sr = 0, sg = 0, sb = 0;
      for (var ddy=-1; ddy<=1; ddy++) for (var ddx=-1; ddx<=1; ddx++){
        if (!ddx && !ddy) continue;
        var jj = (y+ddy)*bw + (x+ddx);
        if (F[jj]){ sr += R[jj]; sg += G[jj]; sb += B[jj]; n++; }
      }
      if (n > 0){ tj.push(j); tr.push(sr/n); tg.push(sg/n); tb.push(sb/n); }
    }
    if (!tj.length) break;
    for (var t=0; t<tj.length; t++){ j = tj[t]; R[j] = tr[t]; G[j] = tg[t]; B[j] = tb[t]; F[j] = 1; remaining--; }
  }
  for (var it=0; it<2; it++){
    for (y=1; y<bh-1; y++) for (x=1; x<bw-1; x++){
      j = y*bw + x;
      if (!mask[(minY+y)*w + (minX+x)]) continue;
      var n2 = 0, sr2 = 0, sg2 = 0, sb2 = 0;
      for (var dy2=-1; dy2<=1; dy2++) for (var dx2=-1; dx2<=1; dx2++){
        var jj2 = (y+dy2)*bw + (x+dx2);
        sr2 += R[jj2]; sg2 += G[jj2]; sb2 += B[jj2]; n2++;
      }
      R[j] = sr2/n2; G[j] = sg2/n2; B[j] = sb2/n2;
    }
  }
  for (y=0; y<bh; y++) for (x=0; x<bw; x++){
    if (mask[(minY+y)*w + (minX+x)]){
      j = y*bw + x; i = ((minY+y)*w + (minX+x)) * 4;
      d[i] = R[j]; d[i+1] = G[j]; d[i+2] = B[j];
    }
  }
  return { guard: guard, remaining: remaining };
}

/* 自检：给主程序用（浏览器控制台可调 __tb.testInpaint()） */
function tInpaintTest(){
  var W = 320, H = 180;
  function grad(ctx){ var g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#88aaff'); g.addColorStop(1, '#ffcc88'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  var A = document.createElement('canvas'); A.width = W; A.height = H;
  var a = A.getContext('2d'); grad(a);
  a.fillStyle = '#fff'; a.font = 'bold 24px sans-serif'; a.textAlign = 'center'; a.textBaseline = 'middle';
  a.fillText('水印WATERMARK', W/2, 90);
  var B = document.createElement('canvas'); B.width = W; B.height = H;
  var b = B.getContext('2d'); b.drawImage(A, 0, 0);
  var st = { r: 16, pts: [] };
  for (var x=70; x<=250; x+=6){ st.pts.push({ x:x, y:82 }); st.pts.push({ x:x, y:98 }); }
  var img = b.getImageData(0, 0, W, H);
  inpaintRegion(img, W, H, [st]);
  b.putImageData(img, 0, 0);
  var C = document.createElement('canvas'); C.width = W; C.height = H;
  grad(C.getContext('2d'));
  var rc = C.getContext('2d').getImageData(60, 64, 200, 52).data;
  function rmse(cv){
    var s = cv.getContext('2d').getImageData(60, 64, 200, 52).data, sum = 0, n = 0;
    for (var i=0; i<s.length; i+=4){ var dr = s[i]-rc[i], dg = s[i+1]-rc[i+1], db = s[i+2]-rc[i+2]; sum += dr*dr + dg*dg + db*db; n += 3; }
    return +Math.sqrt(sum/n).toFixed(1);
  }
  return JSON.stringify({ before: rmse(A), after: rmse(B) });
}

/* ===== 通用：复制文本 ===== */
function copyText(t, okMsg){
  if (!t){ toast('没有可复制的内容'); return; }
  function done(){ toast(okMsg || '已复制到剪贴板'); }
  function fallback(){
    try {
      var ta = document.createElement('textarea'); ta.value = t;
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done();
    } catch(e){ toast('复制失败'); }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fallback);
  else fallback();
}

/* ===== 工具 3：图片压缩 ===== */
function tCompress(root){
  root.innerHTML = '' +
    '<label class="file-drop" id="cpDrop">🖼️ 点击选择图片<input type="file" accept="image/*" id="cpFile"></label>' +
    '<div id="cpPanel" class="hidden">' +
      '<div class="label">画质 <span id="cpQv" class="muted">80%</span></div>' +
      '<input type="range" id="cpQ" min="40" max="95" value="80">' +
      '<div class="label">最大宽度</div>' +
      '<div class="seg" id="cpW"><button data-v="0" class="active">原图</button><button data-v="1920">1920</button><button data-v="1280">1280</button><button data-v="800">800</button></div>' +
      '<div class="canvas-wrap" style="margin-top:12px"><img id="cpPrev" style="width:100%;display:block"></div>' +
      '<div class="result-box" style="margin-top:12px" id="cpInfo">-</div>' +
      '<button class="btn accent" style="width:100%;margin-top:12px" id="cpDl">保存压缩图</button>' +
    '</div>';
  var img = null, maxW = 0, outBlob = null;
  function fmt(b){ return b > 1048576 ? (b/1048576).toFixed(2)+'MB' : Math.round(b/1024)+'KB'; }
  function run(){
    if (!img) return;
    var q = parseFloat(qs('#cpQ', root).value) / 100;
    qs('#cpQv', root).textContent = Math.round(q*100) + '%';
    var w = img.naturalWidth, h = img.naturalHeight;
    if (maxW && w > maxW){ h = Math.round(h * maxW / w); w = maxW; }
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    var bl = canvasBlob(cv, 'image/jpeg', q);
    outBlob = bl;
    if (!bl){ qs('#cpInfo', root).textContent = '压缩失败'; return; }
    var before = img._size || bl.size, after = bl.size;
    var saved = before > after ? Math.round((1 - after/before) * 100) : 0;
    qs('#cpInfo', root).innerHTML = '原图 <b>' + fmt(before) + '</b> → 压缩后 <b>' + fmt(after) + '</b>（省 ' + saved + '%）<br><span class="muted">输出尺寸 ' + w + '×' + h + '（JPEG）</span>';
    qs('#cpPrev', root).src = URL.createObjectURL(bl);
  }
  qs('#cpFile', root).addEventListener('change', function(e){
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var im = new Image();
    im.onload = function(){
      img = im; img._size = f.size;
      qs('#cpDrop', root).classList.add('hidden');
      qs('#cpPanel', root).classList.remove('hidden');
      run();
    };
    im.src = URL.createObjectURL(f);
  });
  qs('#cpQ', root).addEventListener('input', run);
  qs('#cpW', root).addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    maxW = parseInt(b.dataset.v, 10) || 0;
    root.querySelectorAll('#cpW button').forEach(function(x){ x.classList.toggle('active', x === b); });
    run();
  });
  qs('#cpDl', root).onclick = function(){ if (outBlob) downloadBlob(outBlob, 'compressed.jpg'); else toast('先选择图片'); };
}

/* ===== 工具 4：图片加水印 ===== */
function tWatermark(root){
  root.innerHTML = '' +
    '<label class="file-drop" id="wmDrop">🖼️ 点击选择图片<input type="file" accept="image/*" id="wmFile"></label>' +
    '<div id="wmPanel" class="hidden">' +
      '<div class="label">水印文字</div>' +
      '<input class="inp" id="wmText" value="© 百宝箱">' +
      '<div class="label">字号 <span id="wmSv" class="muted">32px</span></div>' +
      '<input type="range" id="wmSize" min="14" max="80" value="32">' +
      '<div class="label">透明度 <span id="wmOv" class="muted">70%</span></div>' +
      '<input type="range" id="wmOp" min="10" max="100" value="70">' +
      '<div class="label">位置</div>' +
      '<div class="seg" id="wmPos"><button data-v="br" class="active">右下</button><button data-v="center">居中</button><button data-v="bl">左下</button><button data-v="tile">平铺</button></div>' +
      '<div class="label">颜色</div>' +
      '<div class="seg" id="wmColor"><button data-v="#ffffff" class="active">白色</button><button data-v="#111111">黑色</button></div>' +
      '<div class="canvas-wrap" style="margin-top:12px"><canvas id="wmCv"></canvas></div>' +
      '<button class="btn accent" style="width:100%;margin-top:12px" id="wmDl">保存图片</button>' +
    '</div>';
  var img = null, pos = 'br', color = '#ffffff';
  function render(){
    if (!img) return;
    var cv = qs('#wmCv', root);
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    var ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    var text = qs('#wmText', root).value || ' ';
    var size = parseFloat(qs('#wmSize', root).value);
    var op = parseFloat(qs('#wmOp', root).value) / 100;
    qs('#wmSv', root).textContent = size + 'px';
    qs('#wmOv', root).textContent = Math.round(op*100) + '%';
    ctx.font = '600 ' + size + 'px system-ui,sans-serif';
    ctx.fillStyle = color; ctx.globalAlpha = op;
    if (pos === 'tile'){
      ctx.save();
      ctx.translate(cv.width/2, cv.height/2); ctx.rotate(-0.42);
      var tw = ctx.measureText(text).width + size*5, th = size*6;
      for (var y = -cv.height; y < cv.height; y += th)
        for (var x = -cv.width; x < cv.width; x += tw)
          ctx.fillText(text, x, y);
      ctx.restore();
    } else {
      var pad = size * 0.8, tw2 = ctx.measureText(text).width;
      var x = pos === 'br' ? cv.width - pad - tw2 : (pos === 'bl' ? pad : (cv.width - tw2)/2);
      var y = pos === 'center' ? cv.height/2 : cv.height - pad;
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = size*0.15; ctx.shadowOffsetY = 2;
      ctx.fillText(text, x, y);
    }
    ctx.globalAlpha = 1;
  }
  qs('#wmFile', root).addEventListener('change', function(e){
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var im = new Image();
    im.onload = function(){
      img = im;
      qs('#wmDrop', root).classList.add('hidden');
      qs('#wmPanel', root).classList.remove('hidden');
      render();
    };
    im.src = URL.createObjectURL(f);
  });
  qs('#wmText', root).addEventListener('input', render);
  qs('#wmSize', root).addEventListener('input', render);
  qs('#wmOp', root).addEventListener('input', render);
  qs('#wmPos', root).addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    pos = b.dataset.v;
    root.querySelectorAll('#wmPos button').forEach(function(x){ x.classList.toggle('active', x === b); });
    render();
  });
  qs('#wmColor', root).addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    color = b.dataset.v;
    root.querySelectorAll('#wmColor button').forEach(function(x){ x.classList.toggle('active', x === b); });
    render();
  });
  qs('#wmDl', root).onclick = function(){ if (img) downloadCanvas(qs('#wmCv', root), 'watermarked.png'); };
}

/* ===== 工具 5：JSON 格式化 ===== */
function tJson(root){
  root.innerHTML = '' +
    '<textarea class="ta" id="jsIn" style="min-height:130px" placeholder="粘贴 JSON 文本…"></textarea>' +
    '<div class="row" style="margin-top:12px">' +
      '<button class="btn sm accent" id="jsFmt" style="flex:1">格式化</button>' +
      '<button class="btn sm" id="jsMin" style="flex:1">压缩</button>' +
      '<button class="btn sm" id="jsVal" style="flex:1">校验</button>' +
    '</div>' +
    '<div class="label">结果 <button class="btn sm" id="jsCopy" style="height:30px">复制</button></div>' +
    '<textarea class="ta" id="jsOut" style="min-height:180px" readonly></textarea>';
  function parse(){
    var t = qs('#jsIn', root).value.trim();
    if (!t){ toast('先粘贴 JSON 内容'); return undefined; }
    try { return JSON.parse(t); }
    catch(e){ toast('✗ 解析失败：' + e.message); return undefined; }
  }
  qs('#jsFmt', root).onclick = function(){ var o = parse(); if (o === undefined) return; qs('#jsOut', root).value = JSON.stringify(o, null, 2); toast('✓ 已格式化'); };
  qs('#jsMin', root).onclick = function(){ var o = parse(); if (o === undefined) return; qs('#jsOut', root).value = JSON.stringify(o); toast('✓ 已压缩'); };
  qs('#jsVal', root).onclick = function(){
    var o = parse(); if (o === undefined) return;
    var t = Array.isArray(o) ? 'array' : (o === null ? 'null' : typeof o);
    toast('✓ 合法 JSON · 根类型 ' + t);
  };
  qs('#jsCopy', root).onclick = function(){ copyText(qs('#jsOut', root).value); };
}

/* ===== 工具 6：Base64 编解码 ===== */
function b64e(s){ var bytes = new TextEncoder().encode(s), parts = []; for (var i=0;i<bytes.length;i++) parts.push(String.fromCharCode(bytes[i])); return btoa(parts.join('')); }
function b64d(s){ var bin = atob(s.replace(/\s+/g, '')), arr = new Uint8Array(bin.length); for (var i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i); return new TextDecoder().decode(arr); }
function tBase64(root){
  root.innerHTML = '' +
    '<div class="label">输入</div>' +
    '<textarea class="ta" id="b64In" style="min-height:96px" placeholder="文本 或 Base64 字符串…"></textarea>' +
    '<div class="row" style="margin-top:12px">' +
      '<button class="btn sm accent" id="b64Enc" style="flex:1">编码 →</button>' +
      '<button class="btn sm" id="b64Dec" style="flex:1">← 解码</button>' +
      '<button class="btn sm" id="b64Swap">⇄</button>' +
    '</div>' +
    '<div class="label">输出 <button class="btn sm" id="b64Copy" style="height:30px">复制</button></div>' +
    '<textarea class="ta" id="b64Out" style="min-height:96px" readonly></textarea>';
  qs('#b64Enc', root).onclick = function(){
    var s = qs('#b64In', root).value;
    if (!s){ toast('先输入内容'); return; }
    qs('#b64Out', root).value = b64e(s);
  };
  qs('#b64Dec', root).onclick = function(){
    var s = qs('#b64In', root).value.trim();
    if (!s){ toast('先输入内容'); return; }
    try { qs('#b64Out', root).value = b64d(s); }
    catch(e){ toast('解码失败：不是有效的 Base64'); }
  };
  qs('#b64Swap', root).onclick = function(){
    var out = qs('#b64Out', root).value;
    if (!out){ toast('还没有输出内容'); return; }
    qs('#b64In', root).value = out;
    qs('#b64Out', root).value = '';
  };
  qs('#b64Copy', root).onclick = function(){ copyText(qs('#b64Out', root).value); };
}

/* ===== 工具 7：随机密码 ===== */
function tPassword(root){
  root.innerHTML = '' +
    '<div class="label">长度 <span id="pwLv" class="muted">16</span></div>' +
    '<input type="range" id="pwLen" min="8" max="32" value="16">' +
    '<label class="check-row"><span>大写字母 A-Z</span><input type="checkbox" id="pwU" checked></label>' +
    '<label class="check-row"><span>小写字母 a-z</span><input type="checkbox" id="pwL" checked></label>' +
    '<label class="check-row"><span>数字 0-9</span><input type="checkbox" id="pwD" checked></label>' +
    '<label class="check-row"><span>符号 !@#$%^&amp;*</span><input type="checkbox" id="pwS"></label>' +
    '<div class="result-box mono big-mono" style="margin-top:16px" id="pwOut">—</div>' +
    '<div class="strength"><i id="pwBar"></i></div>' +
    '<div class="row" style="margin-top:14px">' +
      '<button class="btn accent" style="flex:1" id="pwGen">生成密码</button>' +
      '<button class="btn" id="pwCopy">复制</button>' +
    '</div>';
  function gen(){
    var len = parseFloat(qs('#pwLen', root).value);
    qs('#pwLv', root).textContent = len;
    var sets = '';
    if (qs('#pwU', root).checked) sets += 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    if (qs('#pwL', root).checked) sets += 'abcdefghijkmnpqrstuvwxyz';
    if (qs('#pwD', root).checked) sets += '23456789';
    if (qs('#pwS', root).checked) sets += '!@#$%^&*()-_=+';
    if (!sets){ toast('至少选择一种字符类型'); return; }
    var rnd = new Uint32Array(len); crypto.getRandomValues(rnd);
    var out = '';
    for (var i=0;i<len;i++) out += sets[rnd[i] % sets.length];
    qs('#pwOut', root).textContent = out;
    var bits = len * Math.log2(sets.length);
    var pct = Math.min(100, bits), col = bits < 45 ? '#ff5d73' : (bits < 70 ? '#fbbf24' : '#34d399');
    var bar = qs('#pwBar', root); bar.style.width = pct + '%'; bar.style.background = col;
    toast('强度 ' + (bits > 90 ? '极强' : bits > 65 ? '强' : bits > 45 ? '中等' : '偏弱') + ' · 约 ' + Math.round(bits) + ' bit');
  }
  qs('#pwLen', root).addEventListener('input', function(){ qs('#pwLv', root).textContent = this.value; });
  qs('#pwGen', root).onclick = gen;
  qs('#pwCopy', root).onclick = function(){ copyText(qs('#pwOut', root).textContent); };
  gen();
}

/* ===== 工具 8：时间戳转换 ===== */
function tTimestamp(root){
  root.innerHTML = '' +
    '<div class="label">当前时间</div>' +
    '<div class="result-box" id="tsNow">-</div>' +
    '<div class="label">时间戳 → 日期时间</div>' +
    '<div class="row"><input class="inp" id="tsIn" placeholder="10 位秒 或 13 位毫秒" inputmode="numeric"><button class="btn sm accent" id="tsGo1">转换</button></div>' +
    '<div class="result-box" style="margin-top:10px" id="tsOut1">—</div>' +
    '<div class="label">日期时间 → 时间戳</div>' +
    '<div class="row"><input class="inp" id="tsDate" type="datetime-local" step="1"></div>' +
    '<div class="row" style="margin-top:10px"><button class="btn accent" style="flex:1" id="tsGo2">转换为时间戳</button></div>' +
    '<div class="result-box" style="margin-top:10px" id="tsOut2">—</div>';
  function pad(x){ return (x < 10 ? '0' : '') + x; }
  function tick(){
    var d = new Date();
    qs('#tsNow', root).innerHTML = '秒 <b>' + Math.floor(d.getTime()/1000) + '</b> · 毫秒 <b>' + d.getTime() + '</b><br><span class="muted">' + d.toLocaleString() + '</span>';
  }
  tick();
  var iv = setInterval(tick, 1000);
  addCleanup(function(){ clearInterval(iv); });
  var d0 = new Date();
  qs('#tsDate', root).value = d0.getFullYear() + '-' + pad(d0.getMonth()+1) + '-' + pad(d0.getDate()) + 'T' + pad(d0.getHours()) + ':' + pad(d0.getMinutes()) + ':' + pad(d0.getSeconds());
  qs('#tsGo1', root).onclick = function(){
    var v = qs('#tsIn', root).value.trim();
    if (!v){ toast('先输入时间戳'); return; }
    var n = Number(v);
    if (!isFinite(n)){ toast('不是有效数字'); return; }
    var ms = Math.abs(n) > 9999999999 ? n : n * 1000;
    var d = new Date(ms);
    if (isNaN(d.getTime())){ toast('时间超出范围'); return; }
    qs('#tsOut1', root).innerHTML = d.toLocaleString() + '<br><span class="muted">UTC ' + d.toISOString() + '</span>';
  };
  qs('#tsGo2', root).onclick = function(){
    var v = qs('#tsDate', root).value;
    if (!v){ toast('选择日期时间'); return; }
    var d = new Date(v);
    if (isNaN(d.getTime())){ toast('日期无效'); return; }
    qs('#tsOut2', root).innerHTML = '秒 <b>' + Math.floor(d.getTime()/1000) + '</b> · 毫秒 <b>' + d.getTime() + '</b>';
  };
}
