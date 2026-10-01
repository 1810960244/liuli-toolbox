#!/bin/sh
# 百宝箱 · 服务器一键部署脚本
# 用法：解压部署包后，进入 server/ 目录执行：  sh setup.sh
# 可选环境变量： PORT=8791  DEV=1（1=调试模式验证码随响应返回，接入短信后改 0）
set -e
cd "$(dirname "$0")"
PORT="${PORT:-8791}"
HOST="${HOST:-0.0.0.0}"
DEV="${DEV:-1}"

echo '=================================='
echo '  百宝箱 · 服务器部署'
echo '=================================='

if ! command -v python3 >/dev/null 2>&1; then
  echo '❌ 未找到 python3，请先安装（apk add python3 / apt install python3）'
  exit 1
fi
echo "✓ python3: $(python3 --version 2>&1)"

# ---- 可选依赖：ffmpeg（视频转音频） / tesseract（OCR） / yt-dlp（更多站点）----
if command -v apk >/dev/null 2>&1; then
  echo '· 检测到 Alpine，安装可选依赖…'
  apk add --no-cache ffmpeg tesseract-ocr tesseract-ocr-data-chi_sim tesseract-ocr-data-eng 2>/dev/null || true
elif command -v apt-get >/dev/null 2>&1; then
  echo '· 检测到 Debian/Ubuntu，安装可选依赖…'
  (apt-get update -qq && apt-get install -y -qq ffmpeg tesseract-ocr tesseract-ocr-chi-sim) 2>/dev/null || true
elif command -v yum >/dev/null 2>&1; then
  echo '· 检测到 CentOS，安装可选依赖…'
  yum install -y -q ffmpeg tesseract tesseract-langpack-chi_sim 2>/dev/null || true
fi
python3 -m pip install -q yt-dlp 2>/dev/null || true

# ---- 启动服务 ----
if command -v systemctl >/dev/null 2>&1 && [ "$(id -u)" = "0" ]; then
  SVC_USER=$(id -u www-data >/dev/null 2>&1 && echo www-data || echo root)
  chown -R "$SVC_USER:$SVC_USER" "$(dirname "$(pwd)")/server" 2>/dev/null || true
  cat > /etc/systemd/system/toolbox.service <<EOF
[Unit]
Description=Toolbox API (百宝箱)
After=network.target

[Service]
Type=simple
User=$SVC_USER
Group=$SVC_USER
WorkingDirectory=$(pwd)
Environment=DEV=$DEV PORT=$PORT HOST=$HOST
ExecStart=$(command -v python3) -u api.py
Restart=always
RestartSec=3

# ---- 加固 ----
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$(dirname "$(pwd)")/server
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ProtectClock=true
ProtectHostname=true
ProtectProc=invisible
RestrictSUIDSGID=true
RestrictRealtime=true
RestrictNamespaces=true
LockPersonality=true
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
CapabilityBoundingSet=
AmbientCapabilities=
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now toolbox >/dev/null 2>&1
  sleep 1.5
  systemctl is-active toolbox && echo "✓ systemd 服务已启动（开机自启 · 用户 $SVC_USER）"
  systemctl --no-pager -l status toolbox 2>/dev/null | head -10
else
  (nohup env DEV="$DEV" PORT="$PORT" HOST="$HOST" python3 -u api.py > api.log 2>&1 &)
  sleep 1.5
  echo '✓ 已用 nohup 启动'
fi

echo '---- 健康检查 ----'
curl -s -m 5 "http://127.0.0.1:$PORT/api/health" || echo '（健康检查失败，请看 api.log）'
echo
echo "================ 完成 ================"
echo "浏览器访问：  http://<服务器IP>:$PORT/"
echo "App 连接：   我的 → 云同步 → 填 http://<服务器IP>:$PORT"
echo ""
echo "提示："
echo " 1) 云服务器记得在【安全组/防火墙】放行 $PORT 端口"
echo " 2) 当前 DEV=$DEV（验证码随响应显示，方便测试）；接入短信后改 DEV=0 重启"
echo " 3) 想要 HTTPS：用 Caddy/nginx 反代本端口即可（见部署指南）"
