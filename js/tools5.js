/* 百宝箱 · 第五批工具：视频下载（分享链接 → 无水印视频） */

function tVideoDl(root){
  root.innerHTML = '' +
    '<div class="label">粘贴分享链接</div>' +
    '<textarea class="ta" id="vdIn" style="min-height:84px" placeholder="把分享文案或链接整段粘贴进来，例如：&#10;复制打开抖音，看看… https://v.douyin.com/xxxx/ &#10;或 https://www.bilibili.com/video/BVxxxxxxxxxx"></textarea>' +
    '<button class="btn accent" style="width:100%;margin-top:10px" id="vdGo">解析视频</button>' +
    '<div id="vdOut"><p class="hint" style="margin-top:12px">支持：抖音（无水印）· B站 · 快手 · 其他站点自动尝试<br>解析与下载经你的服务器中转，链接不会上传到第三方</p></div>';

  var current = null;
  function setHtml(html){ qs('#vdOut', root).innerHTML = html; }
  function esc(s){
    return String(s == null ? '' : s).replace(/[<>&"]/g, function(c){
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
    });
  }
  function render(d){
    current = d;
    var html = '<div class="result-box" style="margin-top:12px">' +
      '<div style="font-size:15px;font-weight:700;line-height:1.5">' + esc(d.title || '') + '</div>' +
      '<div class="muted" style="margin-top:6px;font-size:12px">' +
        esc(d.platform) + (d.author ? ' · ' + esc(d.author) : '') +
        (d.watermark_free ? ' · <span style="color:#34d399;font-weight:700">无水印</span>' : '') +
        (d.duration ? ' · ' + Math.round(d.duration / 1000) + ' 秒' : '') +
      '</div>' +
      (d.cover ? '<img src="' + esc(d.cover) + '" style="width:100%;max-height:300px;object-fit:cover;border-radius:10px;margin-top:10px" onerror="this.style.display=\'none\'">' : '') +
      '</div>' +
      '<div class="row" style="margin-top:12px">' +
        '<button class="btn accent" style="flex:1" id="vdSave">保存视频</button>' +
        '<button class="btn sm" id="vdCopy">复制下载直链</button>' +
      '</div>' +
      '<p class="hint" style="margin-top:10px">仅供个人学习备份使用，请尊重原作者版权</p>';
    setHtml(html);
    qs('#vdSave', root).onclick = function(){
      var btn = this;
      if (!current) return;
      var url = window.TBApi.videoDl(current.video, current.title || current.platform, current.referer);
      var vname = String(current.title || current.platform || 'video').slice(0, 30) + '.mp4';
      if (window.AndroidBridge && window.AndroidBridge.downloadUrl){
        window.AndroidBridge.downloadUrl(url, vname);
        downloadDialog(vname);
        return;
      }
      btn.disabled = true; btn.textContent = '下载中…（看视频大小，稍等）';
      fetch(url).then(function(r){ return r.blob(); }).then(function(bl){
        downloadBlob(bl, String(current.title || current.platform || 'video').slice(0, 30) + '.mp4');
        btn.disabled = false; btn.textContent = '保存视频';
      }, function(){
        toast('下载失败，可尝试"复制下载直链"到浏览器打开');
        btn.disabled = false; btn.textContent = '保存视频';
      });
    };
    qs('#vdCopy', root).onclick = function(){
      if (!current) return;
      copyText(window.TBApi.videoDl(current.video, current.title || current.platform, current.referer));
      toast('直链已复制，可粘贴到浏览器/下载器');
    };
  }
  qs('#vdGo', root).onclick = function(){
    var link = qs('#vdIn', root).value.trim();
    if (!link){ toast('先粘贴分享链接'); return; }
    if (!window.TBApi){ setHtml('<p class="hint" style="margin-top:12px">组件未加载</p>'); return; }
    var btn = this;
    btn.disabled = true; btn.textContent = '解析中…（最多约 30 秒）';
    setHtml('<p class="hint" style="margin-top:12px">正在解析…</p>');
    window.TBApi.videoParse(link).then(function(r){
      btn.disabled = false; btn.textContent = '解析视频';
      if (r && r.ok){ render(r); }
      else {
        var msg = (r && r.error) || (r && r.__net ? '连不上服务器（到 我的 → 云同步 检查地址）' : '未知错误');
        setHtml('<p class="hint" style="margin-top:12px">解析失败：' + esc(msg) + '</p>');
      }
    }, function(){
      btn.disabled = false; btn.textContent = '解析视频';
      setHtml('<p class="hint" style="margin-top:12px">解析失败：网络或服务器异常</p>');
    });
  };
}

TB_TOOLS.push(
  { id:'videodl', name:'视频下载', desc:'分享链接 · 去水印下载', icon:'🎬', cat:'net', grad:'linear-gradient(135deg,#f43f5e,#b91c1c)', render: tVideoDl }
);
