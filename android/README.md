# 百宝箱 · Android 壳工程

一个极简的 WebView 壳：加载 `https://toolbox.liulichat.cn`，并给网页提供两个原生下载能力。

## 结构
```
android/
├── AndroidManifest.xml        清单（minSdk 29 / targetSdk 34，仅 INTERNET 权限）
├── src/cn/liulichat/toolbox/
│   └── MainActivity.java      WebView 壳 + 下载桥
├── res/values/                应用名 / 主题
├── res/mipmap-*/ic_launcher.png  应用图标
├── keystore.p12               签名密钥库（PKCS12，alias=toolbox）
└── build.sh                   构建脚本（aapt2 → javac → d8 → zipalign → apksigner）
```

## 构建（云构建 · 推荐）
推送到 `main` 分支后，GitHub Actions 自动构建（`.github/workflows/build-apk.yml`），
产物在 Actions → 对应运行 → Artifacts → `toolbox-apk`；
打 `v*` 标签推送时，APK 还会自动附到 Release 上。

## 构建（本地）
需要：JDK 17 + Android SDK（build-tools + platforms;android-34）。
```bash
export ANDROID_HOME=/path/to/android-sdk
cd android && bash build.sh
# 产物: android/out/toolbox.apk
```

## 网页桥（给前端开发者）
网页中 `window.AndroidBridge` 存在时可用：
- `AndroidBridge.saveBase64(name, mime, base64)` — 小于 40MB 的文件（图片/ZIP）保存到系统「下载」目录
- `AndroidBridge.downloadUrl(url, name)` — 大文件（视频/音频）交给系统 DownloadManager

## 签名密钥
- **密钥不在仓库里**，`.gitignore` 已排除 `*.p12`。
- 本地构建：把密钥放到 `android/keystore.p12`，并设 `KS_PASS` 环境变量。
- 云构建：仓库 Secrets 配 `KEYSTORE_BASE64`（密钥的 base64）和 `KS_PASS`（口令），
  CI 构建前还原、构建后随 runner 销毁。
- 没设 `KS_PASS` 时 `build.sh` 直接退出 —— 不会用默认口令悄悄签出一个包。
- **密钥别丢**：升级安装必须同一把钥匙签名，否则用户装不上，得卸载重装。

## 版本号
构建时可用环境变量注入：`VERSION_CODE` / `VERSION_NAME`（默认 1 / 1.0.0）。
