#!/usr/bin/env bash
# Build debug APK for sideload / kynthai.app/download
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Sync web assets into Android (optional if server.url is remote)"
if command -v npx >/dev/null 2>&1; then
  npx cap sync android || true
fi

cd android
chmod +x gradlew
./gradlew assembleDebug --no-daemon

OUT="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
DEST="$ROOT/public/downloads/kynthai-android.apk"
mkdir -p "$(dirname "$DEST")"
cp -f "$OUT" "$DEST"
cp -f "$OUT" "$ROOT/public/downloads/Kynthai.apk"
echo "==> APK ready: $DEST"
ls -la "$DEST"
