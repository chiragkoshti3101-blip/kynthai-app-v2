# Kynthai Capacitor plugin architecture

## Purpose

The Android APK is a **native shell** around the production web app (`https://kynthai.app`).

| Layer | Responsibility |
|--------|----------------|
| **Web (Next.js)** | All product UI, auth, portals, API calls |
| **Capacitor Bridge** | JS ↔ native method calls |
| **Native Android** | OS alarms, full-screen intents, notification permission, FCM push |

This is intentional: one product surface, stronger OS rights than a pure PWA.

## Package

- **applicationId:** `app.kynthai.health`
- **Main activity:** `MainActivity` (extends `BridgeActivity`)
- **Config:** `capacitor.config.ts` → `server.url = https://kynthai.app`

## Plugins

### 1. `DoseAlarm` (custom — `DoseAlarmPlugin.java`)

| Method | Behavior |
|--------|----------|
| `schedule({ id, title, body, atMs })` | `AlarmManager.setExactAndAllowWhileIdle` → `DoseAlarmReceiver` |
| `cancel({ id })` | Cancel pending intent |
| `requestPermissions()` | Report Android 13+ `POST_NOTIFICATIONS` grant state |

**Flow:**

```
JS scheduleNativeAlarm()
  → Capacitor.Plugins.DoseAlarm.schedule
  → AlarmManager
  → DoseAlarmReceiver (broadcast)
  → Notification with full-screen intent
  → FullScreenAlarmActivity (Taken / Skip UI over lock screen when OS allows)
```

### 2. Web layer helpers (`src/lib/native-alarms.ts`)

- Detects native shell (`Capacitor.isNativePlatform`)
- Schedules DoseAlarm on Android; falls back to `@capacitor/local-notifications` where available
- Stores a small on-device notification history

### 3. Permission path

1. **Native shell** → `PushNotifications.checkPermissions()` / OS permission prompt
2. **Web/PWA** → `Notification.requestPermission()` / Web Push subscribe
3. **In-app banner** → user taps “Allow notifications” if still default/denied
4. **Server** → sends FCM to Android tokens and APNs HTTP/2 to iPhone tokens

## What the web alone cannot do

| Capability | PWA | Native APK |
|------------|-----|------------|
| Full-screen over other apps | No | Yes (with OS rules) |
| Exact alarms while killed | Weak | Stronger (`SCHEDULE_EXACT_ALARM`) |
| System notification permission dialog | Browser only | App-level + browser |
| Push while app process is closed | Web Push/PWA rules | FCM (Android) / APNs (iPhone) |

## Build outputs

- **Debug APK** (sideload / website download): CI workflow `android-apk.yml`
- **Release / Play Store:** signed AAB — requires keystore secrets (not in repo)

## Security notes

- APK loads **HTTPS production only** in `capacitor.config.ts`
- No embedded API secrets in the shell
- Auth remains cookie/session based against kynthai.app

## Official Capacitor community plugins (in use)

| Package | Use in Kynthai |
|---------|----------------|
| `@capacitor/app` | App resume events, Android back button |
| `@capacitor/status-bar` | Status bar color / style |
| `@capacitor/local-notifications` | Fallback local alerts + channels |
| `@capacitor/push-notifications` | Android FCM / iPhone APNs token registration and tap events |
| `@capacitor/preferences` | Lightweight on-device prefs |
| `@capacitor/haptics` | Taken / Skip feedback |
| **Custom `DoseAlarm`** | Exact alarms + full-screen intent |

Bootstrap: `src/lib/native-shell-bootstrap.ts` (runs once inside native shell).

## Native push configuration

The code path is enabled for both platforms:

- Android: `google-services.json` + Firebase Admin credentials (`FIREBASE_*`).
  `KynthaiApplication` creates the high-importance `kynthai_dose_alarm` channel
  before a background FCM message is displayed.
- iPhone: the Xcode target includes the Push Notifications entitlement and
  `@capacitor/push-notifications` package. The server sends APNs tokens through
  `@parse/node-apn` using `APNS_AUTH_KEY`, `APNS_KEY_ID`, and `APNS_TEAM_ID`.
  Apple Developer must enable Push Notifications for `app.kynthai.health`.
- Native registration is session-bound; the endpoint never accepts an email to
  attach a device to an account. A token tap is constrained to an internal URL.

The remaining optional plugins are deliberately not required:

| Package | Why wait |
|---------|----------|
| `@capacitor/splash-screen` | Core splash via Android theme already |
| `@capacitor/network` | Nice-to-have offline banner |

## Signing

See `docs/ANDROID-SIGNING.md`. CI: `.github/workflows/android-release.yml`.
