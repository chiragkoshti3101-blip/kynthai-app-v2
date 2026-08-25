# Kynthai Capacitor plugin architecture

## Purpose

The Android APK is a **native shell** around the production web app (`https://kynthai.app`).

| Layer | Responsibility |
|--------|----------------|
| **Web (Next.js)** | All product UI, auth, portals, API calls |
| **Capacitor Bridge** | JS ↔ native method calls |
| **Native Android** | OS alarms, full-screen intents, notification permission |

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

1. **MainActivity.onCreate** → `requestPermissions(POST_NOTIFICATIONS)` on API 33+
2. **Web** → `Notification.requestPermission()` / Web Push subscribe
3. **In-app banner** → user taps “Allow notifications” if still default/denied

## What the web alone cannot do

| Capability | PWA | Native APK |
|------------|-----|------------|
| Full-screen over other apps | No | Yes (with OS rules) |
| Exact alarms while killed | Weak | Stronger (`SCHEDULE_EXACT_ALARM`) |
| System notification permission dialog | Browser only | App-level + browser |

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
| `@capacitor/preferences` | Lightweight on-device prefs |
| `@capacitor/haptics` | Taken / Skip feedback |
| **Custom `DoseAlarm`** | Exact alarms + full-screen intent |

Bootstrap: `src/lib/native-shell-bootstrap.ts` (runs once inside native shell).

## Not yet enabled (optional later)

| Package | Why wait |
|---------|----------|
| `@capacitor/push-notifications` + FCM | Needs Firebase `google-services.json` |
| `@capacitor/splash-screen` | Core splash via Android theme already |
| `@capacitor/network` | Nice-to-have offline banner |

## Signing

See `docs/ANDROID-SIGNING.md`. CI: `.github/workflows/android-release.yml`.
