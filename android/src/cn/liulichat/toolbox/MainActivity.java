package cn.liulichat.toolbox;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.ContentValues;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.KeyEvent;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
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
    private WebView web;
    private long lastBack = 0;
    /* 下载 id → 文件名，用于下载完成后弹窗告知保存位置 */
    private final Map<Long, String> dlNames = new HashMap<>();
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
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setMediaPlaybackRequiresUserGesture(false);

        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
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
        dlReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                String name = dlNames.remove(id);
                if (name == null) return;
                showSaveDialog(name);
            }
        };
        registerReceiver(dlReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
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

    /** 下载/保存完成后弹窗：明确告知保存路径，并可一键跳到系统下载目录 */
    private void showSaveDialog(final String name) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (isFinishing()) return;
                String dir = Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS).getAbsolutePath();
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
