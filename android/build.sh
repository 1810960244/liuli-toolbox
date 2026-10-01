#!/usr/bin/env bash
# 百宝箱 APK 构建脚本（不依赖 Gradle，直接使用 Android SDK 自带工具链）
# 云构建（GitHub Actions）：SDK/JDK 已预装，自动发现
# 本地构建：设置 ANDROID_HOME 指向 Android SDK 即可
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"

# ---------- 1. 定位 Android SDK ----------
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "${SDK:-}" ] || [ ! -d "$SDK" ]; then
  for p in /usr/local/lib/android/sdk "$HOME/Android/Sdk" /opt/android-sdk; do
    if [ -d "$p" ]; then SDK="$p"; break; fi
  done
fi
[ -n "${SDK:-}" ] && [ -d "$SDK" ] || { echo "找不到 Android SDK（设置 ANDROID_HOME）"; exit 1; }

BT="$(ls -d "$SDK"/build-tools/* 2>/dev/null | sort -V | tail -1)"
PLAT="$(ls -d "$SDK"/platforms/android-3* 2>/dev/null | sort -V | tail -1)"
[ -n "$BT" ]   || { echo "找不到 build-tools"; exit 1; }
[ -n "$PLAT" ] || { echo "找不到 platforms（需 platforms;android-3x）"; exit 1; }
echo "SDK  = $SDK"
echo "BT   = $BT"
echo "PLAT = $PLAT"

# ---------- 2. 资源编译 ----------
rm -rf build out && mkdir -p build/gen build/classes build/dex out
"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -o build/base.apk \
  -I "$PLAT/android.jar" \
  --manifest AndroidManifest.xml \
  -R build/res.zip \
  --java build/gen \
  --min-sdk-version 29 \
  --target-sdk-version 34 \
  --version-code "${VERSION_CODE:-1}" \
  --version-name "${VERSION_NAME:-1.0.0}"

# ---------- 3. 编译 Java → dex ----------
javac --release 17 -encoding UTF-8 -classpath "$PLAT/android.jar" -d build/classes \
  $(find src build/gen -name '*.java')
"$BT/d8" --release --lib "$PLAT/android.jar" --min-api 29 --output build/dex \
  $(find build/classes -name '*.class')

# ---------- 4. classes.dex 合并进 APK ----------
cp build/base.apk build/merged.apk
( cd "$ROOT/build/dex" && zip -q "$ROOT/build/merged.apk" classes.dex )

# ---------- 5. 对齐 ----------
"$BT/zipalign" -f 4 build/merged.apk build/aligned.apk

# ---------- 6. 签名 ----------
[ -f keystore.p12 ] || { echo "缺少 keystore.p12"; exit 1; }
"$BT/apksigner" sign \
  --ks keystore.p12 --ks-type PKCS12 \
  --ks-pass "pass:${KS_PASS:-KS_PASS_REMOVED}" \
  --ks-key-alias toolbox \
  --out out/toolbox.apk build/aligned.apk
"$BT/apksigner" verify --print-certs out/toolbox.apk | head -4
echo "APK 构建完成:"; ls -la out/
