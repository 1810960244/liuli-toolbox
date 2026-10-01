#!/bin/sh
# 百宝箱 API · 全链路自测
cd "$(dirname "$0")" || exit 1
echo '=== health ==='
curl -s -m 5 http://127.0.0.1:8791/api/health; echo
echo '=== send_code ==='
R=$(curl -s -m 5 -X POST http://127.0.0.1:8791/api/send_code -H 'Content-Type: application/json' -d '{"phone":"13800138000"}')
echo "$R"
C=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('dev_code',''))")
echo "=== login (code=$C) ==="
R2=$(curl -s -m 5 -X POST http://127.0.0.1:8791/api/login -H 'Content-Type: application/json' -d "{\"phone\":\"13800138000\",\"code\":\"$C\"}")
echo "$R2"
T=$(echo "$R2" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
echo "=== me ==="
curl -s -m 5 http://127.0.0.1:8791/api/me -H "Authorization: Bearer $T"; echo
echo '=== sync put ==='
curl -s -m 5 -X POST http://127.0.0.1:8791/api/sync -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"favs":["qr","inpaint","barcode"],"settings":{"theme":"violet"}}'; echo
echo '=== sync get ==='
curl -s -m 5 http://127.0.0.1:8791/api/sync -H "Authorization: Bearer $T"; echo
echo '=== unauthorized check ==='
curl -s -m 5 http://127.0.0.1:8791/api/sync; echo
echo '=== DONE ==='
