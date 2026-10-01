/* 百宝箱 · 第二批工具：条形码 / 图片转PDF / 格式转换 / 单位换算 / 颜色工具 */

/* 工具 9：条形码生成（JsBarcode，MIT） */
function tBarcode(root){
  root.innerHTML = '' +
    '<div class="label">内容</div>' +
    '<textarea class="ta" id="bcText" style="min-height:70px" placeholder="输入数字/字母…">HELLO 2026</textarea>' +
    '<div class="label">类型</div>' +
    '<div class="seg" id="bcType"><button data-v="CODE128" class="active">CODE128</button><button data-v="EAN13">EAN13</button><button data-v="CODE39">CODE39</button></div>' +
    '<div class="canvas-wrap" style="background:#fff;padding:10px 10px 4px"><canvas id="bcCv"></canvas></div>' +
    '<button class="btn accent" style="width:100%;margin-top:12px" id="bcDl">保存图片</button>' +
    '<p class="hint" style="margin-top:10px">CODE128 支持数字/字母/符号；EAN13 需 12~13 位数字；CODE39 支持大写与数字</p>';
  var type = 'CODE128';
  var timer = null;
  function render(){
    var cv = qs('#bcCv', root);
    var text = qs('#bcText', root).value.trim() || ' ';
    var ok = true;
    try {
      JsBarcode(cv, text, {
        format: type, width: 2.5, height: 100, displayValue: true,
        margin: 14, background: '#ffffff', lineColor: '#111111',
        valid: function(v){ ok = v; }
      });
    } catch(e){ ok = false; }
    if (ok === false){
      cv.width = 600; cv.height = 170;
      var x = cv.getContext('2d');
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, 600, 170);
      x.fillStyle = '#bbbbbb'; x.font = '16px sans-serif'; x.textAlign = 'center';
      x.fillText('内容不符合该编码规则', 300, 95);
    }
    cv.style.width = '100%'; cv.style.height = 'auto';
  }
  qs('#bcText', root).addEventListener('input', function(){ clearTimeout(timer); timer = setTimeout(render, 300); });
  qs('#bcType', root).addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    type = b.dataset.v;
    root.querySelectorAll('#bcType button').forEach(function(x){ x.classList.toggle('active', x === b); });
    render();
  });
  qs('#bcDl', root).onclick = function(){ downloadCanvas(qs('#bcCv', root), 'barcode.png'); };
  render();
}

/* 工具 10：图片转 PDF（pdf-lib，MIT） */
function tImg2Pdf(root){
  root.innerHTML = '' +
    '<label class="file-drop" id="p2Drop">📄 选择图片（可多选，按选择顺序合成）<input type="file" accept="image/*" multiple id="p2File"></label>' +
    '<div id="p2Panel" class="hidden">' +
      '<div class="label">已选 <span id="p2Count">0</span> 张 · 页面尺寸</div>' +
      '<div class="seg" id="p2Size"><button data-v="fit" class="active">跟随图片</button><button data-v="a4">A4 页面</button></div>' +
      '<div class="grid" id="p2List" style="margin-top:10px;grid-template-columns:repeat(3,1fr)"></div>' +
      '<div class="row" style="margin-top:8px"><button class="btn sm" id="p2Clear">清空重选</button></div>' +
      '<button class="btn accent" style="width:100%;margin-top:12px" id="p2Go">生成 PDF</button>' +
      '<p class="hint" style="margin-top:10px">全本地生成 · 图片不离开你的设备</p>' +
    '</div>';
  var items = [];
  var sizeMode = 'fit';

  function isPng(b){ return b[0] === 0x89 && b[1] === 0x50; }
  function isJpg(b){ return b[0] === 0xff && b[1] === 0xd8; }
  function toBytes(file){
    return new Promise(function(res, rej){
      var fr = new FileReader();
      fr.onload = function(){ res(new Uint8Array(fr.result)); };
      fr.onerror = rej;
      fr.readAsArrayBuffer(file);
    });
  }
  function normalize(bytes, mime){
    if (isPng(bytes)) return Promise.resolve({ bytes: bytes, kind: 'png' });
    if (isJpg(bytes)) return Promise.resolve({ bytes: bytes, kind: 'jpg' });
    return new Promise(function(res, rej){
      var blob = new Blob([bytes], { type: mime || 'image/*' });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function(){
        var w = img.naturalWidth, h = img.naturalHeight, MAX = 2400;
        var s = Math.min(1, MAX / Math.max(w, h));
        w = Math.round(w * s); h = Math.round(h * s);
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        var x = cv.getContext('2d');
        x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
        x.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        var bl = canvasBlob(cv, 'image/jpeg', 0.88);
        if (!bl){ rej(new Error('图片转换失败')); return; }
        var fr2 = new FileReader();
        fr2.onload = function(){ res({ bytes: new Uint8Array(fr2.result), kind: 'jpg' }); };
        fr2.onerror = rej;
        fr2.readAsArrayBuffer(bl);
      };
      img.onerror = function(){ URL.revokeObjectURL(url); rej(new Error('图片解码失败')); };
      img.src = url;
    });
  }
  function renderList(){
    var box = qs('#p2List', root);
    box.innerHTML = '';
    qs('#p2Count', root).textContent = String(items.length);
    items.forEach(function(it){
      var d = document.createElement('div');
      d.style.cssText = 'border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--card2)';
      d.innerHTML = '<img src="' + it.url + '" style="width:100%;height:74px;object-fit:cover;display:block">' +
        '<div style="font-size:10px;color:var(--muted);padding:4px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + it.name + '</div>';
      box.appendChild(d);
    });
  }
  qs('#p2File', root).addEventListener('change', function(e){
    var fs = Array.prototype.slice.call(e.target.files || []);
    if (!fs.length) return;
    items = [];
    Promise.all(fs.slice(0, 20).map(function(f){
      return toBytes(f).then(function(b){
        return normalize(b, f.type).then(function(norm){
          return {
            name: f.name,
            bytes: norm.bytes,
            kind: norm.kind,
            url: URL.createObjectURL(new Blob([norm.bytes], { type: norm.kind === 'png' ? 'image/png' : 'image/jpeg' }))
          };
        });
      });
    })).then(function(list){
      items = list;
      qs('#p2Drop', root).classList.add('hidden');
      qs('#p2Panel', root).classList.remove('hidden');
      renderList();
    }, function(){ toast('有图片读取失败，请重试'); });
  });
  qs('#p2Size', root).addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    sizeMode = b.dataset.v;
    root.querySelectorAll('#p2Size button').forEach(function(x){ x.classList.toggle('active', x === b); });
  });
  qs('#p2Clear', root).onclick = function(){
    items = [];
    qs('#p2Panel', root).classList.add('hidden');
    qs('#p2Drop', root).classList.remove('hidden');
    qs('#p2File', root).value = '';
  };
  qs('#p2Go', root).onclick = function(){
    if (!items.length){ toast('先选择图片'); return; }
    var btn = this; btn.disabled = true; btn.textContent = '生成中…';
    var PDFDocument = window.PDFLib.PDFDocument;
    PDFDocument.create().then(function(doc){
      var seq = Promise.resolve();
      items.forEach(function(it){
        seq = seq.then(function(){
          var embed = it.kind === 'png' ? doc.embedPng(it.bytes) : doc.embedJpg(it.bytes);
          return embed.then(function(img){
            if (sizeMode === 'a4'){
              var A4W = 595.28, A4H = 841.89, m = 24;
              var s = Math.min((A4W - m * 2) / img.width, (A4H - m * 2) / img.height);
              var w = img.width * s, h = img.height * s;
              var page = doc.addPage([A4W, A4H]);
              page.drawImage(img, { x: (A4W - w) / 2, y: (A4H - h) / 2, width: w, height: h });
            } else {
              var page2 = doc.addPage([img.width, img.height]);
              page2.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
            }
          });
        });
      });
      return seq.then(function(){ return doc.save(); });
    }).then(function(out){
      downloadBlob(new Blob([out], { type: 'application/pdf' }), 'toolbox-images.pdf');
      btn.disabled = false; btn.textContent = '生成 PDF';
    }).catch(function(err){
      toast('生成失败：' + ((err && err.message) || err));
      btn.disabled = false; btn.textContent = '生成 PDF';
    });
  };
}

/* 工具 11：图片格式转换 */
function tImgFmt(root){
  root.innerHTML = '' +
    '<label class="file-drop" id="fcDrop">🖼️ 点击选择图片<input type="file" accept="image/*" id="fcFile"></label>' +
    '<div id="fcPanel" class="hidden">' +
      '<div class="label">输出格式</div>' +
      '<div class="seg" id="fcType"><button data-v="image/jpeg" class="active">JPEG</button><button data-v="image/png">PNG</button><button data-v="image/webp">WebP</button></div>' +
      '<div class="label" id="fcQWrap">质量 <span id="fcQv" class="muted">85%</span></div>' +
      '<input type="range" id="fcQ" min="50" max="95" value="85">' +
      '<div class="canvas-wrap" style="margin-top:12px"><img id="fcPrev" style="width:100%;display:block"></div>' +
      '<div class="result-box" style="margin-top:12px" id="fcInfo">-</div>' +
      '<button class="btn accent" style="width:100%;margin-top:12px" id="fcDl">保存图片</button>' +
    '</div>';
  var img = null, outBlob = null, outName = 'converted.png';
  function fmt(b){ return b > 1048576 ? (b / 1048576).toFixed(2) + 'MB' : Math.round(b / 1024) + 'KB'; }
  function run(){
    if (!img) return;
    var pick = root.querySelector('#fcType button.active');
    var type = pick ? pick.dataset.v : 'image/jpeg';
    var q = parseFloat(qs('#fcQ', root).value) / 100;
    qs('#fcQv', root).textContent = Math.round(q * 100) + '%';
    qs('#fcQWrap', root).style.opacity = type === 'image/png' ? '.4' : '1';
    var cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    var x = cv.getContext('2d');
    if (type === 'image/jpeg'){ x.fillStyle = '#ffffff'; x.fillRect(0, 0, cv.width, cv.height); }
    x.drawImage(img, 0, 0);
    var bl = canvasBlob(cv, type, q);
    if (!bl){ qs('#fcInfo', root).textContent = '转换失败'; return; }
    var realType = bl.type || type;
    outBlob = bl;
    outName = 'converted.' + (realType.indexOf('png') >= 0 ? 'png' : realType.indexOf('webp') >= 0 ? 'webp' : 'jpg');
    var note = realType !== type ? '（当前环境不支持该格式，已输出 ' + realType + '）' : '';
    qs('#fcInfo', root).innerHTML = '原图 <b>' + fmt(img._size || bl.size) + '</b> → 转换后 <b>' + fmt(bl.size) + '</b><br>' +
      '<span class="muted">' + realType + ' · ' + cv.width + '×' + cv.height + ' ' + note + '</span>';
    qs('#fcPrev', root).src = URL.createObjectURL(bl);
  }
  qs('#fcFile', root).addEventListener('change', function(e){
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var im = new Image();
    im.onload = function(){
      img = im; img._size = f.size;
      qs('#fcDrop', root).classList.add('hidden');
      qs('#fcPanel', root).classList.remove('hidden');
      run();
    };
    im.src = URL.createObjectURL(f);
  });
  qs('#fcType', root).addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    root.querySelectorAll('#fcType button').forEach(function(x){ x.classList.toggle('active', x === b); });
    run();
  });
  qs('#fcQ', root).addEventListener('input', run);
  qs('#fcDl', root).onclick = function(){ if (outBlob) downloadBlob(outBlob, outName); };
}

/* 工具 12：单位换算 */
function tUnit(root){
  var CATS = [
    { id:'len',  name:'长度', units:{ '米':1, '千米':1000, '厘米':0.01, '毫米':0.001, '英寸':0.0254, '英尺':0.3048, '英里':1609.344 } },
    { id:'wt',   name:'重量', units:{ '千克':1, '克':0.001, '斤':0.5, '两':0.05, '磅':0.45359237, '盎司':0.028349523125, '吨':1000 } },
    { id:'area', name:'面积', units:{ '平方米':1, '平方千米':1e6, '亩':666.6666667, '公顷':10000, '平方英尺':0.09290304 } },
    { id:'data', name:'存储', units:{ 'B':1, 'KB':1024, 'MB':1048576, 'GB':1073741824, 'TB':1099511627776 } },
    { id:'time', name:'时间', units:{ '秒':1, '分钟':60, '小时':3600, '天':86400, '周':604800 } },
    { id:'temp', name:'温度', special:true, units:{ '摄氏 ℃':1, '华氏 ℉':1, '开尔文 K':1 } }
  ];
  var cur = CATS[0];
  root.innerHTML = '' +
    '<div class="chips" id="unCats" style="padding-bottom:10px"></div>' +
    '<div class="label">数值</div>' +
    '<input class="inp" id="unVal" type="number" value="1" inputmode="decimal">' +
    '<div class="row" style="margin-top:10px">' +
      '<select class="inp" id="unFrom" style="flex:1"></select>' +
      '<span class="muted">→</span>' +
      '<select class="inp" id="unTo" style="flex:1"></select>' +
    '</div>' +
    '<div class="result-box" style="margin-top:12px;display:flex;justify-content:space-between;align-items:center">' +
      '<span class="muted" id="unEq" style="font-size:12px">=</span>' +
      '<span class="big-mono" id="unOut">-</span>' +
    '</div>' +
    '<div class="row" style="margin-top:12px">' +
      '<button class="btn sm" id="unSwap">⇄ 交换单位</button>' +
      '<button class="btn sm" id="unCopy">复制结果</button>' +
    '</div>';
  function fillCats(){
    var box = qs('#unCats', root);
    box.innerHTML = '';
    CATS.forEach(function(c){
      var b = document.createElement('button');
      b.className = 'chip' + (c.id === cur.id ? ' active' : '');
      b.textContent = c.name;
      b.onclick = function(){ cur = c; fillCats(); fillUnits(); calc(); };
      box.appendChild(b);
    });
  }
  function fillUnits(){
    var names = Object.keys(cur.units);
    [qs('#unFrom', root), qs('#unTo', root)].forEach(function(sel, i){
      sel.innerHTML = '';
      names.forEach(function(n){ var o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
      sel.selectedIndex = i === 0 ? 0 : Math.min(1, names.length - 1);
    });
  }
  function convTemp(v, from, to){
    var c = from.indexOf('摄氏') >= 0 ? v : (from.indexOf('华氏') >= 0 ? (v - 32) * 5 / 9 : v - 273.15);
    if (to.indexOf('摄氏') >= 0) return c;
    if (to.indexOf('华氏') >= 0) return c * 9 / 5 + 32;
    return c + 273.15;
  }
  function calc(){
    var v = parseFloat(qs('#unVal', root).value);
    var from = qs('#unFrom', root).value, to = qs('#unTo', root).value;
    if (!isFinite(v)){ qs('#unOut', root).textContent = '-'; return; }
    var out = cur.special ? convTemp(v, from, to) : v * cur.units[from] / cur.units[to];
    var s = (Math.abs(out) >= 1e12 || (Math.abs(out) < 1e-6 && out !== 0)) ? out.toExponential(6) : (Math.round(out * 1e8) / 1e8);
    qs('#unEq', root).textContent = v + ' ' + from + ' =';
    qs('#unOut', root).textContent = s + ' ' + to;
  }
  qs('#unVal', root).addEventListener('input', calc);
  qs('#unFrom', root).addEventListener('change', calc);
  qs('#unTo', root).addEventListener('change', calc);
  qs('#unSwap', root).onclick = function(){
    var a = qs('#unFrom', root), b = qs('#unTo', root);
    var t = a.selectedIndex; a.selectedIndex = b.selectedIndex; b.selectedIndex = t;
    calc();
  };
  qs('#unCopy', root).onclick = function(){ copyText(qs('#unOut', root).textContent); };
  fillCats(); fillUnits(); calc();
}

/* 工具 13：颜色工具 */
function tColor(root){
  root.innerHTML = '' +
    '<div class="label">选择颜色</div>' +
    '<input type="color" id="clPick" value="#5b8cff">' +
    '<div class="canvas-wrap" style="margin-top:12px"><div id="clPreview" style="height:104px;background:#5b8cff;transition:background .15s"></div></div>' +
    '<div class="label">数值（点按复制）</div>' +
    '<div class="result-box mono" id="clHex" style="cursor:pointer">-</div>' +
    '<div class="result-box mono" id="clRgb" style="cursor:pointer;margin-top:8px">-</div>' +
    '<div class="result-box mono" id="clHsl" style="cursor:pointer;margin-top:8px">-</div>' +
    '<div class="label">和谐配色（点按使用）</div>' +
    '<div class="row" id="clPalette" style="gap:8px;flex-wrap:wrap"></div>' +
    '<button class="btn" style="width:100%;margin-top:14px" id="clRandom">🎲 随机一套配色</button>';
  var cur = { hex: '#5B8CFF', rgb: '91, 140, 255', hsl: '222, 100%, 68%' };

  function hexToRgb(hex){
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) n = 0;
    return [ (n >> 16) & 255, (n >> 8) & 255, n & 255 ];
  }
  function rgbToHex(r, g, b){
    return '#' + [r, g, b].map(function(v){
      v = Math.max(0, Math.min(255, Math.round(v)));
      return (v < 16 ? '0' : '') + v.toString(16);
    }).join('').toUpperCase();
  }
  function rgbToHsl(r, g, b){
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2;
    var d = mx - mn;
    if (d){
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }
  function hslToRgb(h, s, l){
    h = (((h % 360) + 360) % 360) / 360; s /= 100; l /= 100;
    function f(p, q, t){ if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; }
    if (!s){ var v = Math.round(l * 255); return [v, v, v]; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [Math.round(f(p, q, h + 1/3) * 255), Math.round(f(p, q, h) * 255), Math.round(f(p, q, h - 1/3) * 255)];
  }
  function update(hex){
    var rgb = hexToRgb(hex);
    var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    var hx = rgbToHex(rgb[0], rgb[1], rgb[2]);
    cur = { hex: hx, rgb: rgb.join(', '), hsl: hsl[0] + ', ' + hsl[1] + '%, ' + hsl[2] + '%' };
    qs('#clPick', root).value = hx;
    qs('#clPreview', root).style.background = hx;
    qs('#clHex', root).textContent = 'HEX ' + hx;
    qs('#clRgb', root).textContent = 'RGB ' + cur.rgb;
    qs('#clHsl', root).textContent = 'HSL ' + cur.hsl;
    var pal = [
      rgbToHex.apply(null, hslToRgb(hsl[0], Math.min(100, hsl[1] + 10), Math.max(14, hsl[2] - 28))),
      rgbToHex.apply(null, hslToRgb(hsl[0], Math.max(24, hsl[1] - 22), Math.min(92, hsl[2] + 22))),
      rgbToHex.apply(null, hslToRgb(hsl[0] + 180, hsl[1], hsl[2])),
      rgbToHex.apply(null, hslToRgb(hsl[0] + 40, hsl[1], hsl[2])),
      rgbToHex.apply(null, hslToRgb(hsl[0] - 40, hsl[1], hsl[2]))
    ];
    var box = qs('#clPalette', root);
    box.innerHTML = '';
    pal.forEach(function(c){
      var d = document.createElement('button');
      d.style.cssText = 'width:52px;height:52px;border-radius:12px;border:1px solid var(--border);background:' + c;
      d.title = c;
      d.onclick = function(){ update(c); toast('已使用 ' + c); };
      box.appendChild(d);
    });
  }
  qs('#clPick', root).addEventListener('input', function(){ update(this.value); });
  qs('#clHex', root).onclick = function(){ copyText(cur.hex); };
  qs('#clRgb', root).onclick = function(){ copyText('rgb(' + cur.rgb + ')'); };
  qs('#clHsl', root).onclick = function(){ copyText('hsl(' + cur.hsl + ')'); };
  qs('#clRandom', root).onclick = function(){
    var h = Math.floor(Math.random() * 360);
    var c = hslToRgb(h, 65 + Math.random() * 30, 52 + Math.random() * 18);
    update(rgbToHex(c[0], c[1], c[2]));
  };
  update('#5B8CFF');
}

/* ===== 注册第二批工具 ===== */
TB_TOOLS.push(
  { id:'barcode', name:'条形码生成', desc:'CODE128 / EAN13 等', icon:'🏷️', cat:'img',  grad:'linear-gradient(135deg,#fbbf24,#d97706)', render: tBarcode },
  { id:'img2pdf', name:'图片转 PDF', desc:'多图合成一份 PDF',  icon:'📄', cat:'img',  grad:'linear-gradient(135deg,#60a5fa,#4f46e5)', render: tImg2Pdf },
  { id:'imgfmt',  name:'格式转换',   desc:'PNG / JPEG / WebP', icon:'🖼️', cat:'img',  grad:'linear-gradient(135deg,#2dd4bf,#0d9488)', render: tImgFmt },
  { id:'unit',    name:'单位换算',   desc:'长度/重量/面积/存储', icon:'📐', cat:'calc', grad:'linear-gradient(135deg,#94a3b8,#475569)', render: tUnit },
  { id:'color',   name:'颜色工具',   desc:'取色 / 转换 / 配色',  icon:'🎨', cat:'calc', grad:'linear-gradient(135deg,#c084fc,#7c3aed)', render: tColor }
);
