#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
MODE="${1:-debug}"

if command -v npx >/dev/null 2>&1; then
  npx cap sync android 2>/dev/null || true
fi

cd android
chmod +x gradlew

if [ "$MODE" = "release" ]; then
  if [ -z "${ANDROID_KEYSTORE_PATH:-}" ]; then
    echo "Set ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD"
    exit 1
  fi
  ./gradlew assembleRelease --no-daemon
  OUT="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
else
  ./gradlew assembleDebug --no-daemon
  OUT="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
fi

DEST="$ROOT/public/downloads/kynthai-android.apk"
mkdir -p "$(dirname "$DEST")"
cp -f "$OUT" "$DEST"
cp -f "$OUT" "$ROOT/public/downloads/Kynthai.apk"
echo "APK → $DEST"
ls -la "$DEST"
