/* 百宝箱 · 第三批工具：文本 / 开发 / 实用（10 个） */

/* 工具 14：URL 编解码 */
function tUrl(root){
  root.innerHTML = '' +
    '<div class="label">输入</div>' +
    '<textarea class="ta" id="urlIn" style="min-height:90px" placeholder="粘贴 URL 或文本…"></textarea>' +
    '<div class="row" style="margin-top:12px">' +
      '<button class="btn sm accent" style="flex:1" id="urlE1">编码·component</button>' +
      '<button class="btn sm" style="flex:1" id="urlD1">解码</button>' +
    '</div>' +
    '<div class="row" style="margin-top:8px">' +
      '<button class="btn sm" style="flex:1" id="urlE2">编码·整段 URI</button>' +
      '<button class="btn sm" id="urlSwap">⇄ 回填</button>' +
    '</div>' +
    '<div class="label">输出 <button class="btn sm" id="urlCopy" style="height:30px">复制</button></div>' +
    '<textarea class="ta" id="urlOut" style="min-height:90px" readonly></textarea>';
  function out(s){ qs('#urlOut', root).value = s; }
  qs('#urlE1', root).onclick = function(){ out(encodeURIComponent(qs('#urlIn', root).value)); };
  qs('#urlD1', root).onclick = function(){ try { out(decodeURIComponent(qs('#urlIn', root).value)); } catch(e){ toast('解码失败：不是有效的编码文本'); } };
  qs('#urlE2', root).onclick = function(){ out(encodeURI(qs('#urlIn', root).value)); };
  qs('#urlSwap', root).onclick = function(){ qs('#urlIn', root).value = qs('#urlOut', root).value; toast('已回填到输入框'); };
  qs('#urlCopy', root).onclick = function(){ copyText(qs('#urlOut', root).value); };
}

/* 工具 15：文本转换与统计 */
function tText(root){
  root.innerHTML = '' +
    '<div class="label">文本</div>' +
    '<textarea class="ta" id="txIn" style="min-height:130px" placeholder="粘贴文本…"></textarea>' +
    '<div class="row wrap" style="margin-top:10px;gap:8px">' +
      '<button class="btn sm" data-op="upper">全大写</button>' +
      '<button class="btn sm" data-op="lower">全小写</button>' +
      '<button class="btn sm" data-op="reverse">反转</button>' +
      '<button class="btn sm" data-op="trimlines">去空行</button>' +
      '<button class="btn sm" data-op="uniq">行去重</button>' +
      '<button class="btn sm" data-op="sort">行排序</button>' +
      '<button class="btn sm" data-op="shuffle">行打乱</button>' +
    '</div>' +
    '<div class="row" style="margin-top:10px"><button class="btn sm accent" style="flex:1" id="txUse">将结果写回输入框</button></div>' +
    '<div class="result-box" style="margin-top:12px;font-size:12px" id="txInfo">统计：-</div>' +
    '<div class="label">结果 <button class="btn sm" id="txCopy" style="height:30px">复制</button></div>' +
    '<textarea class="ta" id="txOut" style="min-height:130px" readonly></textarea>';
  function stat(s){
    var cn = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
    var words = s.split(/\s+/).filter(Boolean).length;
    var lines = s ? s.split('\n').length : 0;
    qs('#txInfo', root).textContent = '统计：' + s.length + ' 字符（中文 ' + cn + '）· ' + words + ' 词 · ' + lines + ' 行';
  }
  function put(s){ qs('#txOut', root).value = s; stat(s); }
  root.querySelectorAll('button[data-op]').forEach(function(b){
    b.onclick = function(){
      var s = qs('#txIn', root).value, op = b.dataset.op;
      if (!s){ toast('先输入文本'); return; }
      if (op === 'upper') put(s.toUpperCase());
      else if (op === 'lower') put(s.toLowerCase());
      else if (op === 'reverse') put(s.split('').reverse().join(''));
      else if (op === 'trimlines') put(s.split('\n').map(function(x){ return x.trim(); }).filter(function(x){ return x.length; }).join('\n'));
      else if (op === 'uniq'){ var seen = {}; put(s.split('\n').filter(function(x){ if (seen[x]) return false; seen[x] = 1; return true; }).join('\n')); }
      else if (op === 'sort') put(s.split('\n').sort(function(a, b){ return a.localeCompare(b, 'zh'); }).join('\n'));
      else if (op === 'shuffle'){ var a = s.split('\n'); for (var i=a.length-1;i>0;i--){ var j = Math.floor(Math.random()*(i+1)); var t=a[i]; a[i]=a[j]; a[j]=t; } put(a.join('\n')); }
    };
  });
  qs('#txUse', root).onclick = function(){ qs('#txIn', root).value = qs('#txOut', root).value; toast('已写回'); };
  qs('#txCopy', root).onclick = function(){ copyText(qs('#txOut', root).value); };
  qs('#txIn', root).addEventListener('input', function(){ stat(this.value); });
  stat('');
}

/* 工具 16：进制转换 */
function tRadix(root){
  root.innerHTML = '' +
    '<div class="label">输入数值</div>' +
    '<input class="inp" id="rxIn" value="255" autocomplete="off">' +
    '<div class="label">输入进制</div>' +
    '<div class="seg" id="rxBase"><button data-v="10" class="active">十进制</button><button data-v="2">二进制</button><button data-v="8">八进制</button><button data-v="16">十六进制</button></div>' +
    '<div class="label">结果（点按复制）</div>' +
    '<div class="result-box mono" id="rxR10" style="cursor:pointer">-</div>' +
    '<div class="result-box mono" id="rxR2" style="cursor:pointer;margin-top:8px">-</div>' +
    '<div class="result-box mono" id="rxR8" style="cursor:pointer;margin-top:8px">-</div>' +
    '<div class="result-box mono" id="rxR16" style="cursor:pointer;margin-top:8px">-</div>';
  var base = 10;
  function set(a, b, c, d){
    qs('#rxR10', root).textContent = '十进制    ' + a;
    qs('#rxR2', root).textContent  = '二进制    ' + b;
    qs('#rxR8', root).textContent  = '八进制    ' + c;
    qs('#rxR16', root).textContent = '十六进制  ' + d;
  }
  function calc(){
    var s = qs('#rxIn', root).value.trim().replace(/\s+/g, '');
    if (!s){ set('-', '-', '-', '-'); return; }
    var n = parseInt(s, base);
    if (isNaN(n)){ set('输入无效', '输入无效', '输入无效', '输入无效'); return; }
    set(n.toString(10), n.toString(2), n.toString(8), n.toString(16).toUpperCase());
  }
  qs('#rxBase', root).addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    base = parseInt(b.dataset.v, 10);
    root.querySelectorAll('#rxBase button').forEach(function(x){ x.classList.toggle('active', x === b); });
    calc();
  });
  ['#rxR10', '#rxR2', '#rxR8', '#rxR16'].forEach(function(sel){
    qs(sel, root).onclick = function(){
      var parts = this.textContent.split(/\s{2,}/);
      if (parts.length > 1 && parts[1] !== '-' && parts[1] !== '输入无效') copyText(parts[1].trim());
    };
  });
  qs('#rxIn', root).addEventListener('input', calc);
  calc();
}

/* 工具 17：UUID 生成 */
function tUuid(root){
  root.innerHTML = '' +
    '<div class="label">数量 <span id="uuNv" class="muted">5</span></div>' +
    '<input type="range" id="uuN" min="1" max="20" value="5">' +
    '<label class="check-row"><span>大写</span><input type="checkbox" id="uuUp"></label>' +
    '<label class="check-row"><span>去掉横线</span><input type="checkbox" id="uuNoDash"></label>' +
    '<div class="label">结果 <button class="btn sm" id="uuCopy" style="height:30px">复制</button></div>' +
    '<textarea class="ta" id="uuOut" style="min-height:150px" readonly></textarea>' +
    '<button class="btn accent" style="width:100%;margin-top:12px" id="uuGen">重新生成</button>';
  function gen(){
    var n = parseInt(qs('#uuN', root).value, 10);
    qs('#uuNv', root).textContent = n;
    var up = qs('#uuUp', root).checked, nod = qs('#uuNoDash', root).checked;
    var out = [];
    for (var i=0;i<n;i++){
      var u;
      if (window.crypto && crypto.randomUUID) u = crypto.randomUUID();
      else {
        var b = new Uint8Array(16); crypto.getRandomValues(b);
        b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
        var hx = Array.prototype.map.call(b, function(x){ return (x < 16 ? '0' : '') + x.toString(16); }).join('');
        u = hx.slice(0,8) + '-' + hx.slice(8,12) + '-' + hx.slice(12,16) + '-' + hx.slice(16,20) + '-' + hx.slice(20);
      }
      if (nod) u = u.replace(/-/g, '');
      if (up) u = u.toUpperCase();
      out.push(u);
    }
    qs('#uuOut', root).value = out.join('\n');
  }
  qs('#uuN', root).addEventListener('input', gen);
  qs('#uuUp', root).addEventListener('change', gen);
  qs('#uuNoDash', root).addEventListener('change', gen);
  qs('#uuGen', root).onclick = function(){ gen(); toast('已生成'); };
  qs('#uuCopy', root).onclick = function(){ copyText(qs('#uuOut', root).value); };
  gen();
}

/* 工具 18：哈希计算（MD5 / SHA-1 / SHA-256） */
function tHash(root){
  root.innerHTML = '' +
    '<div class="label">方式</div>' +
    '<div class="seg" id="hsMode"><button data-v="text" class="active">文本</button><button data-v="file">文件</button></div>' +
    '<div id="hsTextWrap"><div class="label">文本内容</div>' +
    '<textarea class="ta" id="hsIn" style="min-height:90px" placeholder="输入要计算哈希的文本…"></textarea></div>' +
    '<label class="file-drop hidden" id="hsDrop">📂 点击选择文件<input type="file" id="hsFile"></label>' +
    '<div class="label">算法</div>' +
    '<div class="seg" id="hsAlgo"><button data-v="md5" class="active">MD5</button><button data-v="sha1">SHA-1</button><button data-v="sha256">SHA-256</button></div>' +
    '<div class="label">结果 <button class="btn sm" id="hsCopy" style="height:30px">复制</button></div>' +
    '<div class="result-box mono" style="word-break:break-all;min-height:52px" id="hsOut">-</div>' +
    '<p class="hint" style="margin-top:10px">SHA 由浏览器原生计算；MD5 走内置实现，全本地完成</p>';
  var mode = 'text', algo = 'md5', fileData = null;
  function hex(h){ return Array.prototype.map.call(new Uint8Array(h), function(x){ return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
  function show(s){ qs('#hsOut', root).textContent = s; }
  function calc(){
    if (mode === 'text'){
      var s = qs('#hsIn', root).value;
      if (!s){ show('-'); return; }
      if (algo === 'md5'){ show(window.md5 ? md5(s) : 'MD5 组件未加载'); return; }
      if (!crypto.subtle){ show('当前环境不支持（需 HTTPS 环境）'); return; }
      crypto.subtle.digest(algo === 'sha1' ? 'SHA-1' : 'SHA-256', new TextEncoder().encode(s))
        .then(function(h){ show(hex(h)); });
    } else {
      if (!fileData){ show('先选择文件'); return; }
      fileData.arrayBuffer().then(function(buf){
        if (algo === 'md5'){ show(window.md5 ? md5(buf) : 'MD5 组件未加载'); return; }
        if (!crypto.subtle){ show('当前环境不支持（需 HTTPS 环境）'); return; }
        crypto.subtle.digest(algo === 'sha1' ? 'SHA-1' : 'SHA-256', buf).then(function(h){ show(hex(h)); });
      });
    }
  }
  qs('#hsMode', root).addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    mode = b.dataset.v;
    root.querySelectorAll('#hsMode button').forEach(function(x){ x.classList.toggle('active', x === b); });
    qs('#hsTextWrap', root).classList.toggle('hidden', mode !== 'text');
    qs('#hsDrop', root).classList.toggle('hidden', mode !== 'file');
    calc();
  });
  qs('#hsAlgo', root).addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    algo = b.dataset.v;
    root.querySelectorAll('#hsAlgo button').forEach(function(x){ x.classList.toggle('active', x === b); });
    calc();
  });
  qs('#hsIn', root).addEventListener('input', calc);
  qs('#hsFile', root).addEventListener('change', function(e){
    fileData = (e.target.files && e.target.files[0]) || null;
    if (fileData){ qs('#hsDrop', root).textContent = '📂 ' + fileData.name + '（点击可换文件）'; }
    calc();
  });
  qs('#hsCopy', root).onclick = function(){ copyText(qs('#hsOut', root).textContent); };
  calc();
}

/* 工具 19：JSON ↔ CSV */
function tJsonCsv(root){
  root.innerHTML = '' +
    '<div class="label">输入（JSON 数组 或 CSV）</div>' +
    '<textarea class="ta" id="jcIn" style="min-height:130px" placeholder="JSON: [{&quot;a&quot;:1,&quot;b&quot;:2}]\n或  CSV: a,b（回车）1,2"></textarea>' +
    '<div class="row" style="margin-top:10px">' +
      '<button class="btn sm accent" style="flex:1" id="jc2c">JSON → CSV</button>' +
      '<button class="btn sm" style="flex:1" id="jc2j">CSV → JSON</button>' +
    '</div>' +
    '<div class="label">输出 <button class="btn sm" id="jcCopy" style="height:30px">复制</button></div>' +
    '<textarea class="ta" id="jcOut" style="min-height:140px" readonly></textarea>';
  function csvEscape(v){
    v = v == null ? '' : String(v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function coerce(v){
    if (v == null) return '';
    var n = Number(v);
    if (v !== '' && !isNaN(n)) return n;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v;
  }
  function parseCSV(text){
    var rows = [], row = [], cur = '', inQ = false;
    for (var i=0;i<text.length;i++){
      var c = text[i];
      if (inQ){
        if (c === '"'){ if (text[i+1] === '"'){ cur += '"'; i++; } else inQ = false; }
        else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ','){ row.push(cur); cur = ''; }
        else if (c === '\n'){ row.push(cur); rows.push(row); row = []; cur = ''; }
        else if (c !== '\r') cur += c;
      }
    }
    row.push(cur); rows.push(row);
    return rows;
  }
  qs('#jc2c', root).onclick = function(){
    var t = qs('#jcIn', root).value.trim();
    if (!t){ toast('先粘贴 JSON'); return; }
    try {
      var arr = JSON.parse(t);
      if (!Array.isArray(arr)) arr = [arr];
      var keys = [];
      arr.forEach(function(o){ Object.keys(o).forEach(function(k){ if (keys.indexOf(k) < 0) keys.push(k); }); });
      var lines = [keys.map(csvEscape).join(',')];
      arr.forEach(function(o){ lines.push(keys.map(function(k){ return csvEscape(o[k]); }).join(',')); });
      qs('#jcOut', root).value = lines.join('\n');
      toast('✓ 已转换 ' + arr.length + ' 行');
    } catch(e){ toast('JSON 解析失败：' + e.message); }
  };
  qs('#jc2j', root).onclick = function(){
    var t = qs('#jcIn', root).value.trim();
    if (!t){ toast('先粘贴 CSV'); return; }
    var rows = parseCSV(t);
    if (rows.length < 2){ toast('至少需要表头 + 一行数据'); return; }
    var keys = rows[0];
    var out = rows.slice(1).map(function(r){
      var o = {};
      keys.forEach(function(k, i){ o[k] = coerce(r[i]); });
      return o;
    });
    qs('#jcOut', root).value = JSON.stringify(out, null, 2);
    toast('✓ 已转换 ' + out.length + ' 行');
  };
  qs('#jcCopy', root).onclick = function(){ copyText(qs('#jcOut', root).value); };
}

/* 工具 20：Markdown 预览 */
function tMarkdown(root){
  root.innerHTML = '' +
    '<div class="label">Markdown</div>' +
    '<textarea class="ta" id="mdIn" style="min-height:150px" placeholder="# 标题&#10;&#10;- 列表&#10;- **加粗** 与 `代码`"></textarea>' +
    '<div class="label">预览</div>' +
    '<div class="result-box md-body" id="mdOut" style="min-height:80px"></div>' +
    '<div class="row" style="margin-top:10px">' +
      '<button class="btn sm" style="flex:1" id="mdHtml">复制 HTML 源码</button>' +
      '<button class="btn sm" id="mdTpl">载入示例</button>' +
    '</div>';
  var timer = null;
  function render(){
    var t = qs('#mdIn', root).value;
    var fn = window.marked ? (marked.parse || marked) : null;
    var html = fn ? String(fn(t)) : '<p style="color:#999">marked 组件加载失败</p>';
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    qs('#mdOut', root).innerHTML = html;
  }
  function tpl(){
    qs('#mdIn', root).value = '# 百宝箱 Markdown 预览\n\n支持 **加粗**、*斜体*、`行内代码` 和列表：\n\n- 列表项一\n- 列表项二\n\n> 引用文字\n\n```js\nconsole.log("hello")\n```\n\n[链接](https://example.com)';
    render();
  }
  qs('#mdIn', root).addEventListener('input', function(){ clearTimeout(timer); timer = setTimeout(render, 300); });
  qs('#mdHtml', root).onclick = function(){ copyText(qs('#mdOut', root).innerHTML); };
  qs('#mdTpl', root).onclick = tpl;
  tpl();
}

/* 工具 21：摩斯电码 */
function tMorse(root){
  var MAP = { 'A':'.-','B':'-...','C':'-.-.','D':'-..','E':'.','F':'..-.','G':'--.','H':'....','I':'..','J':'.---','K':'-.-','L':'.-..','M':'--','N':'-.','O':'---','P':'.--.','Q':'--.-','R':'.-.','S':'...','T':'-','U':'..-','V':'...-','W':'.--','X':'-..-','Y':'-.--','Z':'--..','0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....','6':'-....','7':'--...','8':'---..','9':'----.','.':'.-.-.-',',':'--..--','?':'..--..','!':'-.-.--','/':'-..-.','@':'.--.-.','-':'-....-','(':'-.--.',')':'-.--.-',':':'---...',"'":'.----.','=':'-...-' };
  var REV = {}; Object.keys(MAP).forEach(function(k){ REV[MAP[k]] = k; });
  root.innerHTML = '' +
    '<div class="label">文本</div>' +
    '<textarea class="ta" id="moIn" style="min-height:90px" placeholder="输入文本或摩斯码（用 / 分隔单词）…"></textarea>' +
    '<div class="row" style="margin-top:12px">' +
      '<button class="btn sm accent" style="flex:1" id="moEnc">文本 → 电码</button>' +
      '<button class="btn sm" style="flex:1" id="moDec">电码 → 文本</button>' +
    '</div>' +
    '<div class="label">结果 <button class="btn sm" id="moCopy" style="height:30px">复制</button></div>' +
    '<textarea class="ta mono" id="moOut" style="min-height:90px" readonly></textarea>' +
    '<p class="hint" style="margin-top:10px">字母间空格分隔 · 单词间用 / 分隔</p>';
  qs('#moEnc', root).onclick = function(){
    var s = qs('#moIn', root).value.toUpperCase();
    if (!s){ toast('先输入文本'); return; }
    qs('#moOut', root).value = s.split(/\n/).map(function(line){
      return line.split(/\s+/).map(function(word){
        return word.split('').map(function(c){ return MAP[c] || '?'; }).join(' ');
      }).join(' / ');
    }).join('\n');
  };
  qs('#moDec', root).onclick = function(){
    var s = qs('#moIn', root).value.trim();
    if (!s){ toast('先输入电码'); return; }
    qs('#moOut', root).value = s.split(/\n/).map(function(line){
      return line.split(/\s*\/\s*/).map(function(word){
        return word.split(/\s+/).map(function(code){ return REV[code] || '?'; }).join('');
      }).join(' ');
    }).join('\n');
  };
  qs('#moCopy', root).onclick = function(){ copyText(qs('#moOut', root).value); };
}

/* 工具 22：随机决定（骰子 / 硬币 / 名单抽签） */
function tRandom(root){
  root.innerHTML = '' +
    '<div class="seg" id="rdMode"><button data-v="dice" class="active">🎲 骰子</button><button data-v="coin">🪙 硬币</button><button data-v="list">📋 名单抽签</button></div>' +
    '<div class="result-box" style="margin-top:14px;text-align:center;padding:26px 12px">' +
      '<div id="rdBig" style="font-size:46px;font-weight:800;line-height:1.2">-</div>' +
      '<div class="muted" id="rdSub" style="margin-top:6px">点下方按钮</div>' +
    '</div>' +
    '<div id="rdListWrap" class="hidden">' +
      '<div class="label">名单（一行一个）</div>' +
      '<textarea class="ta" id="rdList" style="min-height:110px" placeholder="张三&#10;李四&#10;王五"></textarea>' +
    '</div>' +
    '<button class="btn accent" style="width:100%;margin-top:14px" id="rdGo">来一下</button>';
  var mode = 'dice', busy = false;
  qs('#rdMode', root).addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    mode = b.dataset.v;
    root.querySelectorAll('#rdMode button').forEach(function(x){ x.classList.toggle('active', x === b); });
    qs('#rdListWrap', root).classList.toggle('hidden', mode !== 'list');
    qs('#rdBig', root).textContent = '-';
    qs('#rdSub', root).textContent = '点下方按钮';
  });
  qs('#rdGo', root).onclick = function(){
    if (busy) return; busy = true;
    var big = qs('#rdBig', root), sub = qs('#rdSub', root);
    var ticks = 0;
    var iv = setInterval(function(){
      ticks++;
      if (mode === 'dice'){ big.textContent = '🎲 ' + (1 + Math.floor(Math.random() * 6)); }
      else if (mode === 'coin'){ big.textContent = Math.random() < 0.5 ? '🪙 正面' : '🪙 反面'; }
      else {
        var lines = qs('#rdList', root).value.split('\n').map(function(x){ return x.trim(); }).filter(Boolean);
        if (!lines.length){ clearInterval(iv); busy = false; big.textContent = '-'; sub.textContent = '先填写名单'; return; }
        big.textContent = lines[Math.floor(Math.random() * lines.length)];
      }
      if (ticks >= 10){
        clearInterval(iv); busy = false;
        if (mode === 'dice'){
          big.textContent = '🎲 ' + (1 + Math.floor(Math.random() * 6));
        } else if (mode === 'coin'){
          big.textContent = Math.random() < 0.5 ? '🪙 正面' : '🪙 反面';
        } else {
          var L = qs('#rdList', root).value.split('\n').map(function(x){ return x.trim(); }).filter(Boolean);
          big.textContent = '🎯 ' + L[Math.floor(Math.random() * L.length)];
        }
        sub.textContent = '结果已定！';
      }
    }, 70);
    addCleanup(function(){ clearInterval(iv); });
  };
}

/* 工具 23：倒计时 */
function tTimer(root){
  root.innerHTML = '' +
    '<div class="result-box" style="text-align:center;padding:30px 12px">' +
      '<div id="tmBig" style="font-size:52px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:2px">00:00</div>' +
      '<div class="muted" id="tmHint" style="margin-top:8px">设置时长后开始</div>' +
    '</div>' +
    '<div class="row wrap" style="margin-top:12px;gap:8px" id="tmPresets">' +
      '<button class="btn sm" data-m="1">1 分钟</button>' +
      '<button class="btn sm" data-m="3">3 分钟</button>' +
      '<button class="btn sm" data-m="5">5 分钟</button>' +
      '<button class="btn sm" data-m="10">10 分钟</button>' +
      '<button class="btn sm" data-m="25">25 分钟</button>' +
    '</div>' +
    '<div class="row" style="margin-top:12px">' +
      '<input class="inp" id="tmMin" type="number" min="0" max="999" value="1" style="width:88px"><span class="muted">分</span>' +
      '<input class="inp" id="tmSec" type="number" min="0" max="59" value="0" style="width:88px"><span class="muted">秒</span>' +
      '<button class="btn sm accent" id="tmSet">设定</button>' +
    '</div>' +
    '<div class="row" style="margin-top:14px">' +
      '<button class="btn accent" style="flex:1" id="tmStart">开始</button>' +
      '<button class="btn" id="tmReset">重置</button>' +
    '</div>';
  var total = 60, left = 60, iv = null, running = false;
  function fmt(s){
    var m = Math.floor(s / 60), ss = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
  }
  function show(){ qs('#tmBig', root).textContent = fmt(left); }
  function beep(n){
    for (var i=0;i<n;i++){
      (function(i2){
        setTimeout(function(){
          try {
            var AC = new (window.AudioContext || window.webkitAudioContext)();
            var o = AC.createOscillator(), g = AC.createGain();
            o.frequency.value = 880; o.type = 'sine';
            g.gain.value = 0.12;
            g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.5);
            o.connect(g); g.connect(AC.destination);
            o.start(); o.stop(AC.currentTime + 0.55);
          } catch(e){}
        }, i2 * 700);
      })(i);
    }
  }
  function stop(){ if (iv){ clearInterval(iv); iv = null; } running = false; qs('#tmStart', root).textContent = '开始'; }
  qs('#tmPresets', root).addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    qs('#tmMin', root).value = b.dataset.m; qs('#tmSec', root).value = '0';
    setT();
  });
  function setT(){
    var m = parseInt(qs('#tmMin', root).value, 10) || 0;
    var s = parseInt(qs('#tmSec', root).value, 10) || 0;
    total = m * 60 + s; left = total;
    stop(); show();
    qs('#tmHint', root).textContent = total ? '准备就绪' : '设置时长后开始';
  }
  qs('#tmSet', root).onclick = setT;
  qs('#tmStart', root).onclick = function(){
    if (running){ stop(); qs('#tmHint', root).textContent = '已暂停'; return; }
    if (left <= 0){ toast('先设定时长'); return; }
    running = true; qs('#tmStart', root).textContent = '暂停';
    qs('#tmHint', root).textContent = '计时中…';
    iv = setInterval(function(){
      left--;
      if (left <= 0){
        left = 0; show(); stop();
        qs('#tmHint', root).textContent = '⏰ 时间到！';
        beep(3); toast('⏰ 时间到！');
        return;
      }
      show();
    }, 1000);
  };
  qs('#tmReset', root).onclick = function(){ setT(); qs('#tmHint', root).textContent = '已重置'; };
  addCleanup(function(){ if (iv) clearInterval(iv); });
  show();
}

/* ===== 注册第三批工具 ===== */
TB_TOOLS.push(
  { id:'url',      name:'URL 编解码',  desc:'链接转义 / 还原',      icon:'🔗', cat:'text', grad:'linear-gradient(135deg,#38bdf8,#0ea5e9)', render: tUrl },
  { id:'text',     name:'文本转换',    desc:'大小写/排序/去重/统计', icon:'✏️', cat:'text', grad:'linear-gradient(135deg,#fbbf24,#f59e0b)', render: tText },
  { id:'radix',    name:'进制转换',    desc:'二/八/十/十六进制',    icon:'🔢', cat:'calc', grad:'linear-gradient(135deg,#60a5fa,#3b82f6)', render: tRadix },
  { id:'uuid',     name:'UUID 生成',   desc:'批量 UUID v4',        icon:'🆔', cat:'calc', grad:'linear-gradient(135deg,#a78bfa,#8b5cf6)', render: tUuid },
  { id:'hash',     name:'哈希计算',    desc:'MD5 / SHA-1 / SHA-256', icon:'#️⃣', cat:'calc', grad:'linear-gradient(135deg,#34d399,#059669)', render: tHash },
  { id:'jsoncsv',  name:'JSON ↔ CSV',  desc:'表格与 JSON 互转',    icon:'📊', cat:'text', grad:'linear-gradient(135deg,#f472b6,#db2777)', render: tJsonCsv },
  { id:'markdown', name:'Markdown 预览', desc:'实时渲染 Markdown',  icon:'📝', cat:'text', grad:'linear-gradient(135deg,#818cf8,#6366f1)', render: tMarkdown },
  { id:'morse',    name:'摩斯电码',    desc:'电码编码 / 解码',      icon:'📡', cat:'text', grad:'linear-gradient(135deg,#94a3b8,#64748b)', render: tMorse },
  { id:'random',   name:'随机决定',    desc:'骰子 / 硬币 / 抽签',   icon:'🎲', cat:'calc', grad:'linear-gradient(135deg,#fb923c,#ea580c)', render: tRandom },
  { id:'timer',    name:'倒计时',      desc:'计时 / 提醒',          icon:'⏳', cat:'calc', grad:'linear-gradient(135deg,#f87171,#dc2626)', render: tTimer }
);
