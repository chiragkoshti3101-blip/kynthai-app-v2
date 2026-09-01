# Owner release checklist (Kynthai)

## Now (live web)

- [x] Production on kynthai.app
- [x] Auth CSRF + rate limits
- [x] Notification banner + auto-enable (web)
- [x] Hide Download CTAs inside native shell (web code)
- [x] Android native push channel + FCM token registration in the new APK path
- [x] iPhone APNs token registration and native tap/foreground routing in the iOS project
- [ ] Configure production Firebase Admin + APNs credentials and test on physical devices

## Android APK (this week)

1. GitHub → **Actions** → **Android APK** → Run workflow  
   (or push any change under `android/`)
2. Download artifact `kynthai-android-debug`
3. Copy to `public/downloads/kynthai-android.apk`
4. Deploy web (Vercel) so the site serves the new binary
5. On device: **Uninstall** old app → install from kynthai.app/download → **Allow** notifications

Local:

```bash
./scripts/build-android-apk.sh
```

## Product verification (real phones)

| Role | Account | Check |
|------|---------|--------|
| Patient | patient@kynthai.app / Demo@2024 | Login, med alarm open+closed, banner Allow |
| Family | caretaker@kynthai.app | Missed-dose style alerts |
| Doctor | doctor@kynthai.app | Consult notification |
| Lab | lab@kynthai.app | Booking notification |

## Next product engineering

1. Configure the server-only `FIREBASE_*` and `APNS_*` variables, then run one
   Android and one physical iPhone delivery test.
2. **Signed release** + Play Store listing (keystore in GitHub secrets)
3. **iOS** TestFlight/App Store signing and Apple Push Notifications capability
4. CI: `tsc` + `next build` required green on every PR

## Honest bar

Soft launch: web + sideload APK is fine for early users.  
“Market perfect” needs Play/App Store + FCM/APNs + device matrix pass.

## Signing (Play / trusted installs)

1. Generate keystore once — see `docs/ANDROID-SIGNING.md`
2. Add GitHub secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
3. Actions → **Android Release** → produces debug always; signed APK+AAB when secrets set
4. Copy release APK to `public/downloads/kynthai-android.apk` and deploy web

## Capacitor plugins

Bootstrap runs on native only (`native-shell-bootstrap.ts`): StatusBar, App,
LocalNotifications channel, PushNotifications, and Haptics.
