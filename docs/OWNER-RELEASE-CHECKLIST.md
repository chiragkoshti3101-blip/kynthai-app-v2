# Owner release checklist (Kynthai)

## Now (live web)

- [x] Production on kynthai.app
- [x] Auth CSRF + rate limits
- [x] Notification banner + auto-enable (web)
- [x] Hide Download CTAs inside native shell (web code)
- [ ] **New APK** with MainActivity permission + DoseAlarm schedule on `/download`

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

1. **FCM** in APK (firebase `google-services.json`) for reliable data push
2. **Signed release** + Play Store listing (keystore in GitHub secrets)
3. **iOS** TestFlight + APNs (Capacitor iOS project already present)
4. CI: `tsc` + `next build` required green on every PR

## Honest bar

Soft launch: web + sideload APK is fine for early users.  
“Market perfect” needs Play/App Store + FCM/APNs + device matrix pass.
