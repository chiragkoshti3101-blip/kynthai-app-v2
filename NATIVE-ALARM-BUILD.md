# Kynthai native full-screen medication alarms

## What this adds
- **Android full-screen alarm activity** — can cover the phone over other apps (OS-level)
- **Exact local notifications** via Capacitor (`@capacitor/local-notifications`)
- **On-device notification history** (Preferences / localStorage) so alerts stay stored on the phone
- Web app still runs at https://kynthai.app inside the shell

## Build APK (on a machine with Android Studio)
```bash
npm install
npx cap sync android
npx cap open android
# In Android Studio: Build → Build APK(s) / Generate Signed Bundle
```

## Permissions (already in AndroidManifest)
- POST_NOTIFICATIONS
- SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM
- USE_FULL_SCREEN_INTENT
- VIBRATE, WAKE_LOCK, RECEIVE_BOOT_COMPLETED

## User must allow
1. Notifications
2. Alarms & reminders (exact alarm)
3. Full-screen notifications (Android 14+ special app access)


## Platforms

### Android
Debug APK can be built with:
```bash
export ANDROID_HOME=... JAVA_HOME=...
cd android && ./gradlew assembleDebug --max-workers=1
# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

### iOS
Requires **macOS + Xcode** (cannot build on Linux CI):
```bash
npx cap sync ios
npx cap open ios
# Xcode → Select device/simulator → Product → Archive
```
Add Push Notifications + Time Sensitive Notifications capability in Xcode for dose alerts.
