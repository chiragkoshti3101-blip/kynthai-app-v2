# Android signing (Kynthai)

**Never commit the keystore or passwords.** Store them only in GitHub Actions secrets / a password manager.

## 1. Create a release keystore (once, on a secure machine)

```bash
keytool -genkeypair -v \
  -keystore kynthai-release.keystore \
  -alias kynthai \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass 'CHOOSE_A_STRONG_STORE_PASSWORD' \
  -keypass 'CHOOSE_A_STRONG_KEY_PASSWORD' \
  -dname "CN=Kynthai, OU=Mobile, O=Kynthai, L=City, ST=State, C=US"
```

Back up `kynthai-release.keystore` offline. Losing it means you cannot update the same Play Store app id.

## 2. GitHub Actions secrets

Repo → **Settings → Secrets and variables → Actions** → New repository secret:

| Secret | Value |
|--------|--------|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 kynthai-release.keystore` (Linux) or `base64 -i kynthai-release.keystore` (macOS) |
| `ANDROID_KEYSTORE_PASSWORD` | Store password |
| `ANDROID_KEY_ALIAS` | e.g. `kynthai` |
| `ANDROID_KEY_PASSWORD` | Key password |

## 3. CI behavior

- **Without secrets:** workflow builds **debug APK** only (sideload / website download).
- **With secrets:** also builds **signed release APK** (+ AAB when configured).

Workflow: `.github/workflows/android-release.yml`

## 4. Local signed build

```bash
export ANDROID_KEYSTORE_PATH=/secure/path/kynthai-release.keystore
export ANDROID_KEYSTORE_PASSWORD=...
export ANDROID_KEY_ALIAS=kynthai
export ANDROID_KEY_PASSWORD=...
cd android && ./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

## 5. Publish to website download

```bash
cp android/app/build/outputs/apk/release/app-release.apk public/downloads/kynthai-android.apk
# deploy web so kynthai.app/download serves the new file
```

## 6. Play Store (later)

```bash
./gradlew bundleRelease
# upload app-release.aab in Play Console
```

Requires Play Console account, store listing, content rating, privacy policy URL.
