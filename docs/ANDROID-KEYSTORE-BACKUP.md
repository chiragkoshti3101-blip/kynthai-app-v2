# Release keystore backup (owner only)

GitHub Actions secrets are set for signed builds:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS` = `kynthai`
- `ANDROID_KEY_PASSWORD`

**You must download and store the keystore offline** from the secure backup location used at generation time.
If this keystore is lost, Play Store updates for `app.kynthai.health` cannot use the same signing key.

Never commit `.keystore` files or passwords to git.
