# Kynthai native medication alarms + push

## Product standard
- **Copy:** "Medication reminder" / "Time to take {med}" — never "MEDICATION ALARM" or emoji spam
- **Android APK:** full-screen intent can cover the phone over other apps
- **iOS:** system notification with **sound** (APNs / local); tap opens full-screen Taken / Skip in-app
- **Web PWA:** sticky system notification → open → full-screen alarm + continuous ring

## Android (full-screen over other apps)
```bash
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```
User must allow: **Notifications**, **Alarms & reminders**, **Full-screen notifications**.

## iOS (APNs + sound) — requires Mac + Apple Developer account

### 1. Xcode capabilities
1. `npx cap sync ios && npx cap open ios`
2. Select **App** target → **Signing & Capabilities**
3. Add:
   - **Push Notifications**
   - **Background Modes** → Remote notifications (already in Info.plist)
4. Ensure **App.entitlements** has `aps-environment` = `production` (or `development` for debug)

### 2. Apple Developer portal
1. Certificates, Identifiers & Profiles → Identifiers → App ID `app.kynthai.health`
2. Enable **Push Notifications**
3. Create **APNs Auth Key** (.p8) — Keys → + → Apple Push Notifications service (APNs)
4. Note **Key ID**, **Team ID**, download `.p8` once

### 3. Server (production)
Store in Vercel env (never commit):
- `APNS_KEY_ID`
- `APNS_TEAM_ID`
- `APNS_BUNDLE_ID=app.kynthai.health`
- `APNS_P8` (contents of the .p8 file)

Wire the same dose/consult/lab events that already call `sendNotification` to also send via APNs for native iOS device tokens (in addition to Web Push).

### 4. Sound on iPhone
- Permission must include **sound** (alert + sound + badge)
- Physical **silent switch** off; Focus / DND off for testing
- Local notifications use **system default** sound (`default`) — do not point at a missing custom file
- Web Push on iOS Home Screen PWA uses the OS default alert sound when `silent: false`

### 5. Build
```bash
npx cap sync ios
npx cap open ios
# Product → Archive → distribute TestFlight / Ad Hoc
```

## Splash / no black flash
- PWA `background_color` + Capacitor `backgroundColor` = `#f9fdfb`
- Layout injects critical `html,body{background:#f9fdfb}` before paint
- iOS LaunchScreen uses system background (white)

## On-device history
Capacitor Preferences / localStorage keeps a short notification log on the phone so alerts are not only in the cloud.
