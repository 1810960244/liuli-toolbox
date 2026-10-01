# 百宝箱（ToolBox）· 全能工具箱 v0.5

**38 个工具 · 四大分类 · 安卓/iOS 双端适配 · 云同步 · 视频下载/转音频 · OCR。** 工具本地运行、秒级响应。

## 怎么打开
- Minis 内：`minis://workspace/toolbox/index.html`
- 浏览器直开 `index.html`（无构建、无依赖）
- 有服务器后：浏览器打开 `http://服务器:8791/`（同一服务托管 App + API）

## v0.3 新增
- 🗂️ **首页分类分区**：图片工具(11) / 文本工具(8) / 计算工具(9) / 网络工具(4)，分区带标题和数量，不再是挤成一堆的一整块
- 📱 **双端适配**：Android + iOS —— PWA manifest + 图标 + 苹果专属 meta（可"添加到主屏幕"当 App 用）+ 安全区/视口/前缀兼容
- 🌐 **公开 API 工具**：天气（Open-Meteo）、汇率（open.er-api.com，frankfurter 在部分网络不可达已替换）、IP 查询（ipwho.is）、翻译（MyMemory）
- 🛠️ 修复与优化：汇率接口切换、iOS 100vh 回退、分区容器布局修正

## v0.4 新增
- 🎬 **视频下载**：粘贴分享链接 → 服务器解析 → 保存无水印视频
  - 抖音：自动注册 ttwid → 解析分享页 → 取**无水印**直链（实测 4MB 完整下载 ✓）
  - B站：官方 API 直取 MP4（实测 52MB 完整下载 ✓）｜快手：尽力解析
  - 其他站点：服务器执行 `pip install yt-dlp` 后自动扩展支持
  - 解析与下载**均经你自己的服务器**中转，链接不经过第三方

## v0.5 新增
- 🎵 **视频转音频**：粘贴链接 → 服务器 ffmpeg 提取 M4A（原声）或 MP3（转码）
- 🔍 **OCR 文字识别**：图片提取文字，中文 + 英文混排（服务器 tesseract，实测逐行准确）
- 💬 **文字卡片**：一句话 → 渐变配图（6 种主题）｜ 🧱 **九宫格切图**（一键 ZIP）｜ 🔲 **屏幕检测**（坏点/烧屏，6 色全屏）
- 🐛 **重要修复**：本环境 WebView 的 `canvas.toBlob` 不回调 → 全部改为 `toDataURL` 同步转换（影响所有"保存图片/导出"功能，现已逐项实测通过）

## 全部工具（38 个）
| 分类 | 工具 |
|---|---|
| 🖼️ 图片(14) | 二维码生成 · 图片去水印 · 图片压缩 · 图片加水印 · 条形码生成 · 图片转PDF · 格式转换 · 二维码识别 · 图片拼接 · 图片取色 · 图片↔Base64 · **OCR识别** · **文字卡片** · **九宫格切图** |
| 📝 文本(8) | JSON格式化 · Base64编解码 · URL编解码 · 文本转换 · JSON↔CSV · Markdown预览 · 摩斯电码 · 文件打包ZIP |
| 🧮 计算(10) | 随机密码 · 时间戳转换 · 单位换算 · 颜色工具 · 进制转换 · UUID生成 · 哈希计算(MD5/SHA) · 随机决定 · 倒计时 · **屏幕检测** |
| 🌐 网络(6) | 天气查询 · 汇率换算 · IP查询 · 翻译 · 视频下载 · **视频转音频** |

> SHA 类哈希需要 HTTPS 环境（本机/打包后可用，minis:// 预览下显示不支持——已有友好提示）。

## 文件结构
```
index.html / manifest.webmanifest / icons/    页面 / PWA清单 / 图标
css/app.css                                   设计系统（7 主题 + 分区样式）
js/app.js                                     核心（登录/主题/导航/收藏/搜索/云同步）
js/tools.js    (工具1-8)   js/tools2.js (9-13)
js/tools3.js   (14-23)     js/tools4.js (24-32)   js/tools5.js (33·视频下载)
js/api.js                                     云同步 + 视频解析客户端
libs/  qr-styling · jsbarcode · pdf-lib · marked · zxing · jszip · md5（全部 MIT/Apache）
server/api.py                                 零依赖服务器（登录/同步/静态托管）
tools/make_icons.py                           图标生成脚本
```

## 双端使用
- **安卓**：Chrome 打开 → 菜单"添加到主屏幕/安装应用"；或按《双端适配与打包指南》用 Capacitor 打 APK
- **iOS**：Safari 打开 → 分享 → "添加到主屏幕"，即全屏使用；原生 IPA 需 macOS 打包（指南里有步骤）
- 详见 `../双端适配与打包指南.md`

## 云同步
部署 `server/api.py`（见 `../服务器部署指南.md`）→ App"我的→云同步"填地址 → 登录后收藏/主题自动同步，换设备自动恢复；连不上自动回退本地模式。

## 开发者接口
`__tb.state() / openTool(id) / setTheme(id) / switchTab(tab) / probeServer() / pullSync() / errors()` · `TBApi.*`

## 注意
- 改 js/css 后：把 `index.html` 里对应资源的 `?v=N` 数字加一（破缓存）。
- 服务器生产部署：`DEV=0` + 接真实短信（见部署指南）。
