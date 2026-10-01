package cn.liulichat.toolbox;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

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
                    r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, guessName(url));
                    if (userAgent != null) r.addRequestHeader("User-Agent", userAgent);
                    ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(r);
                    toast("已开始下载…");
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
                toast("已保存到「下载」：" + name);
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
                ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(r);
                toast("已开始下载：" + name);
            } catch (Exception e) {
                toast("下载失败：" + e.getMessage());
            }
        }

        @JavascriptInterface
        public void openDownloads() {
            try {
                Intent it = new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS);
                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(it);
            } catch (Exception e) {
                toast("无法打开下载目录：" + e.getMessage());
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
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
