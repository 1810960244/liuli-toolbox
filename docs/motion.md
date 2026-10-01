# 动效编排规范（GSAP）

网页端与 App 端共用这套动效。改之前先读完三条铁律——每一条都是踩坑之后写下来的。

## 文件与加载

- 库：`libs/gsap.min.js`（3.12.5，72KB，**本地化，不走 CDN**——App 壳内必须离线可用）
- 编排层：`js/app.js` 顶部的 `Motion` 对象，所有动效入口都收在这一个对象里
- 初始态控制：`css/app.css` 末尾的 `.js-ready` 规则负责把卡片初始态藏起来，入场动画再逐个显现

## 三条铁律（违反任何一条 = 线上白屏事故）

1. **GSAP 缺失时必须全部瞬时显示。** `Motion.ok` 为 false（库没加载、或系统开了"减少动态效果"）时，所有 stagger/toolIn 调用走 `show()` 分支直接置 visible。
2. **`js-ready` 只在 GSAP 真正可用时添加。** CSS 用 `.js-ready .card{visibility:hidden}` 藏初始态，如果加了 class 而动画没跑，用户看到的就是一片空白。boot() 里那一行判断是全链路最危险的地方，不要动。
3. **动画失败不阻塞逻辑。** Motion 里所有 try/catch 的 catch 分支都要把内容置为可见，禁止吞掉异常后不管。

## 缓动与时长

全站只用三条曲线、三个时长，写在 CSS 变量里，JS 里对应 GSAP 的 `power2/power3/back`：

| 用途 | 曲线 | 时长 |
|---|---|---|
| 一般过渡（淡入、位移） | `--ease-out` / `power3.out` | .26–.52s |
| 强调、回弹（星标、按压） | `--ease-spring` / `back.out(2~3)` | .16s |
| 进出场对称收尾 | `--ease-io` | .42s |

新动画不允许再发明第四条曲线。

## 触屏与桌面的分界

- hover 效果一律包在 `@media(hover:hover)` 里。触屏设备没有 hover 语义，裸写会让点击态卡在悬浮样式上出不来
- `:active` 的按压反馈（scale .96）是移动端主反馈，桌面保留但弱化

## 兼容性红线

- `color-mix()` 需要 Chrome 111+/Safari 16.2+。**凡是拿它当背景的，声明块里必须先写一行不透明兜底**（`background:var(--bg2);background:color-mix(...)`）。老 WebView 不支持时整条声明作废，导航栏会直接透明
- `prefers-reduced-motion` 的降级同时写在 CSS（媒体查询强制瞬时）和 JS（Motion.ok 判断）两层，缺一不可

## 改版 checklist

动 CSS/JS 后：

1. `index.html` 里对应的 `?v=N` 加一（app.css / app.js / gsap.min.js 各自独立计数）
2. `node --check js/app.js` 过语法
3. 部署后至少截三个宽度：420（手机）/ 1280 / 1920，确认无透明底、无白屏
4. WebView 壳（App 端）与网页共用同一份文件，验证一次即两端生效；APK 需重新云构建才带上新 `index.html`
