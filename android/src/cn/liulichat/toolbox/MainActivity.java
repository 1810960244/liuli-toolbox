package cn.liulichat.toolbox;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.view.KeyEvent;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * 百宝箱 · Android 壳
 * 加载线上应用（https://toolbox.liulichat.cn），并提供：
 *  - 下载桥：网页里的文件（图片/压缩包等）经 saveBase64 存入系统「下载」目录
 *  - 系统下载：视频/音频等大文件经 downloadUrl 交给系统 DownloadManager
 */
public class MainActivity extends Activity {

    private static final String HOME = "https://toolbox.liulichat.cn/";
    /* 必须与 .github/workflows/build-apk.yml 的 VERSION_CODE 保持一致，
       网页靠它判断用户装的是不是旧壳 —— 壳太旧时文件选择等能力不可用 */
    private static final int APP_VERSION = 5;
    private static final int REQ_FILE = 1001;
    private static final int REQ_PERM = 1002;
    private WebView web;
    private long lastBack = 0;
    /* 网页 <input type="file"> 的回调，必须持有到 onActivityResult */
    private ValueCallback<Uri[]> filePathCallback;
    /* 下载 id → 文件名，用于下载完成后弹窗告知保存位置 */
    private final Map<Long, String> dlNames = new HashMap<>();
    /* 属于「应用更新」的下载 id，完成后要拉起安装器而不是提示保存路径 */
    private final java.util.Set<Long> installIds = new java.util.HashSet<>();
    private BroadcastReceiver dlReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);
        registerDownloadReceiver();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);

        /* ── 跨平台显示适配（App 内）── */
        // 尊重页面的 viewport meta，否则会按桌面宽度渲染，手机上字小得没法看
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        // 工具类应用不需要页面缩放，禁用以免误触双指放大破版
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        // 固定文字缩放为 100%：系统字体调大时 WebView 会跟着放大，直接把布局撑坏
        s.setTextZoom(100);

        /* ── 媒体与安全 ── */
        // 视频类工具需要不经手势就能播放
        s.setMediaPlaybackRequiresUserGesture(false);
        // 只允许读取用户主动选择的内容（配合 onShowFileChooser）
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        // 本站全 HTTPS，混合内容按兼容模式处理即可
        s.setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);
        // 不用定位，直接关掉（页面里天气工具走的是 IP 定位）
        s.setGeolocationEnabled(false);

        /* WebView 默认不处理 mailto: / tel: 这类外部 scheme —— 点了完全没反应。
           反馈邮件按钮要能用，必须自己接管。 */
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest req) {
                return handleExternalUrl(req.getUrl().toString());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleExternalUrl(url + "");
            }
        });
        /* 默认的 WebChromeClient 不处理文件选择，网页里所有 <input type="file">
           在 App 内都会「点了没反应」。这里必须自己接管，否则图片去水印、
           压缩、拼接、切图、打包 ZIP、OCR 等十二个工具全部失效。 */
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                    filePathCallback = null;
                }
                filePathCallback = cb;
                try {
                    Intent i = params.createIntent();
                    startActivityForResult(Intent.createChooser(i, "选择文件"), REQ_FILE);
                } catch (Exception e) {
                    filePathCallback = null;
                    toast("无法打开文件选择器：" + e.getMessage());
                    return false;
                }
                return true;
            }
        });
        askStoragePermissionIfNeeded();
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        web.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimeType, long contentLength) {
                try {
                    DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                    r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    String n = guessName(url);
                    r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, n);
                    if (userAgent != null) r.addRequestHeader("User-Agent", userAgent);
                    long id = ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(r);
                    trackDownload(id, n);
                    toast("已开始下载：" + n);
                } catch (Exception e) {
                    toast("下载失败：" + e.getMessage());
                }
            }
        });

        if (savedInstanceState == null) {
            web.loadUrl(HOME);
        } else {
            web.restoreState(savedInstanceState);
        }
    }

    private String guessName(String url) {
        String n = "download";
        try {
            n = url.substring(url.lastIndexOf('/') + 1);
            int q = n.indexOf('?');
            if (q >= 0) n = n.substring(0, q);
        } catch (Exception ignored) {}
        if (n.isEmpty() || !n.contains(".")) n = "toolbox-" + System.currentTimeMillis();
        return n;
    }

    /** 链接分流：站内留在 WebView；mailto/tel 交给系统；其他外链走系统浏览器。
        返回 true 表示已由原生接管，WebView 不再加载该地址。 */
    private boolean handleExternalUrl(String url) {
        if (url == null || url.isEmpty()) return false;
        String low = url.toLowerCase();
        /* 本站域名继续在应用内打开（含即将上线的博客 www.liulichat.cn） */
        if (low.startsWith("https://toolbox.liulichat.cn")
                || low.startsWith("https://www.liulichat.cn")
                || low.startsWith("https://liulichat.cn")) {
            return false;
        }
        try {
            if (low.startsWith("mailto:")) {
                Intent it = new Intent(Intent.ACTION_SENDTO, Uri.parse(url));
                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(it);
                return true;
            }
            if (low.startsWith("tel:") || low.startsWith("sms:") || low.startsWith("smsto:")) {
                Intent it = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(it);
                return true;
            }
            if (low.startsWith("http://") || low.startsWith("https://")) {
                Intent it = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(it);
                return true;
            }
        } catch (Exception e) {
            toast(low.startsWith("mailto:")
                    ? "没有找到邮件应用，可手动发送到 hello@example.com"
                    : "无法打开该链接");
            return true;
        }
        return false;
    }

    /* Android 6~12 需要运行时授权才能读取本地文件；13+ 走分区存储不再需要 */
    private void askStoragePermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || Build.VERSION.SDK_INT > 32) return;
        if (checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                    new String[]{android.Manifest.permission.READ_EXTERNAL_STORAGE}, REQ_PERM);
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req != REQ_FILE) {
            super.onActivityResult(req, res, data);
            return;
        }
        if (filePathCallback == null) {
            super.onActivityResult(req, res, data);
            return;
        }
        Uri[] results = null;
        if (res == Activity.RESULT_OK && data != null) {
            ClipData cd = data.getClipData();
            if (cd != null) {
                results = new Uri[cd.getItemCount()];
                for (int i = 0; i < cd.getItemCount(); i++) {
                    results[i] = cd.getItemAt(i).getUri();
                }
            } else if (data.getDataString() != null) {
                results = new Uri[]{Uri.parse(data.getDataString())};
            }
        }
        /* 用户取消时也必须回传 null，否则 WebView 会卡住，之后点击文件选择器全部失灵 */
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    private void toast(final String msg) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
            }
        });
    }

    /* 把 DownloadManager 的下载 id 与文件名绑定，完成后才能告诉用户存到哪 */
    private void trackDownload(long id, String name) {
        if (id > 0 && name != null) dlNames.put(id, name);
    }

    private void registerDownloadReceiver() {
        /* Android 13（API 33）起，targetSdk >= 33 的应用调 registerReceiver 必须显式
           指定 RECEIVER_EXPORTED / RECEIVER_NOT_EXPORTED，否则直接抛 SecurityException。
           这行在 onCreate 里，一旦抛出就是启动闪退 —— 必须按版本分支。 */
        try {
            dlReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context ctx, Intent intent) {
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (installIds.remove(id)) {      /* 更新包：装它 */
                        installApk(id);
                        return;
                    }
                    String name = dlNames.remove(id);
                    if (name == null) return;
                    showSaveDialog(name);
                }
            };
            IntentFilter f = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
            if (Build.VERSION.SDK_INT >= 33) {
                registerReceiver(dlReceiver, f, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(dlReceiver, f);
            }
        } catch (Exception e) {
            /* 下载完成弹窗是次要能力，注册失败也要能正常用 App */
            dlReceiver = null;
            if (e.getMessage() != null) {
                android.util.Log.w("Toolbox", "下载广播注册失败：" + e.getMessage());
            }
        }
    }

    /** 打开系统下载目录（弹窗的「打开」按钮与网页桥共用同一实现） */
    private void openDownloadsDir() {
        try {
            Intent it = new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS);
            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(it);
        } catch (Exception e) {
            toast("无法打开下载目录：" + e.getMessage());
        }
    }

    /** 用系统安装器安装已下载的更新包。
        注意：Android 7+ 禁止跨应用传 file:// URI。本项目是 aapt2 手写构建、
        没有 AndroidX，所以不走 FileProvider，改用 DownloadManager 自带的
        content:// URI（由系统 DownloadProvider 提供），无需额外依赖。 */
    private void installApk(long downloadId) {
        try {
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            Uri uri = dm.getUriForDownloadedFile(downloadId);
            if (uri == null) {
                toast("安装包读取失败，请到「下载」目录手动安装");
                return;
            }
            Intent it = new Intent(Intent.ACTION_VIEW);
            it.setDataAndType(uri, "application/vnd.android.package-archive");
            it.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(it);
        } catch (Exception e) {
            toast("无法拉起安装界面：" + e.getMessage());
        }
    }

    /** 下载/保存完成后弹窗：明确告知保存路径，并可一键跳到系统下载目录 */
    private void showSaveDialog(final String name) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (isFinishing()) return;
                String dir = "下载";
                try {
                    dir = Environment.getExternalStoragePublicDirectory(
                            Environment.DIRECTORY_DOWNLOADS).getAbsolutePath();
                } catch (Exception ignored) {}
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("已保存")
                        .setMessage("文件：" + name + "\n\n位置：下载/" + name
                                + "\n完整路径：" + dir + "/" + name)
                        .setPositiveButton("打开", new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface d, int which) {
                                openDownloadsDir();
                            }
                        })
                        .setNegativeButton("知道了", null)
                        .show();
            }
        });
    }

    /** 暴露给网页的桥（网页里通过 window.AndroidBridge 调用） */
    public class Bridge {
        @JavascriptInterface
        public void saveBase64(String name, String mime, String b64) {
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                v.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                OutputStream os = getContentResolver().openOutputStream(u);
                os.write(data);
                os.flush();
                os.close();
                v.clear();
                v.put(MediaStore.Downloads.IS_PENDING, 0);
                getContentResolver().update(u, v, null, null);
                showSaveDialog(name);
            } catch (Exception e) {
                toast("保存失败：" + e.getMessage());
            }
        }

        @JavascriptInterface
        public void downloadUrl(String url, String name) {
            try {
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                long id = ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(r);
                trackDownload(id, name);
                toast("已开始下载：" + name);
            } catch (Exception e) {
                toast("下载失败：" + e.getMessage());
            }
        }

        @JavascriptInterface
        public void openDownloads() {
            openDownloadsDir();
        }

        /** 壳版本号，供网页判断是否需要提示用户更新 App */
        @JavascriptInterface
        public int getVersionCode() {
            return APP_VERSION;
        }

        /** 下载更新包并在完成后拉起系统安装界面。
            Android 8+ 需要「安装未知应用」授权，未授权时先引导用户去开启。
            系统不允许应用静默安装自己，最后一步必须由用户点「安装」。 */
        @JavascriptInterface
        public void downloadAndInstall(String url, String name) {
            try {
                if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                    toast("请先允许「安装未知应用」，再回来点一次更新");
                    Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + getPackageName()));
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(i);
                    return;
                }
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                r.setTitle("百宝箱更新");
                r.setDescription(name);
                r.setMimeType("application/vnd.android.package-archive");
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                long id = ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(r);
                installIds.add(id);
                toast("正在下载更新包，完成后会弹出安装界面");
            } catch (Exception e) {
                toast("更新失败：" + e.getMessage());
            }
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null) {
            if (web.canGoBack()) {
                web.goBack();
                return true;
            }
            // 先让网页处理（关闭工具页 / 返回首页），未消费则二次确认退出
            web.evaluateJavascript(
                "(function(){try{return window.__tbHandleBack ? String(window.__tbHandleBack()) : 'false';}catch(e){return 'false';}})()",
                new android.webkit.ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if (!"\"true\"".equals(value) && !"true".equals(value)) {
                            long now = System.currentTimeMillis();
                            if (now - lastBack < 2000) {
                                finish();
                            } else {
                                lastBack = now;
                                toast("再按一次退出百宝箱");
                            }
                        }
                    }
                });
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (dlReceiver != null) {
            try { unregisterReceiver(dlReceiver); } catch (Exception ignored) {}
            dlReceiver = null;
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
