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

## 签名密钥注意
- `keystore.p12`（密码默认见 build.sh，可用环境变量 `KS_PASS` 覆盖）
- **此文件不要丢失**：以后升级安装必须用同一把钥匙签名，否则无法覆盖安装
- 仓库请保持私有；如泄露可将密钥换新（但老版本用户需卸载重装）

## 版本号
构建时可用环境变量注入：`VERSION_CODE` / `VERSION_NAME`（默认 1 / 1.0.0）。
