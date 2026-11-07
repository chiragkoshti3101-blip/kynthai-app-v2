# SECURITY — Fixes Applied (2026-11-08)

This change set closes the audit findings from the 57-point review of `kynthai-app-v2`.
Payment/Stripe items are intentionally **out of scope** here (no Stripe key available yet).

## What was fixed in code

| # | Finding | Fix |
|---|---------|-----|
| 45 | Demo admin usable in production with a known password (`Demo@2024`), and auto "Try the demo" logged into the prod-domain `admin@kynthai.app` | `isDemoLoginEnabled()` now OFF by default in production (opt-in via `NEXT_PUBLIC_ENABLE_DEMO_LOGIN=true`). Demo auto-login targets only the seeded `@demo.kynthai.app` identities. |
| 6 | Real prod-domain staff/admin addresses skipped CAPTCHA | Login route now skips CAPTCHA **only** for `*@demo.kynthai.app`; prod-domain accounts (incl. `admin@kynthai.app`) keep CAPTCHA. |
| 16/39 | Seeded demo admin (role=admin + known password) could reach admin writes | `requireAdmin` now rejects `isDemo` / `admin@demo.kynthai.app` in production with 403, independent of credentials. |
| 21/25 | CSP `script-src` carried `unsafe-eval` | `unsafe-eval` removed from the non-TLS fallback branch (no code uses `eval()`/`new Function()`; hydration only needs `unsafe-inline`). |
| 50/51 | No dependency scanning | Added `.github/dependabot.yml` (npm weekly, GitHub Actions, Gradle). |
| 52 | No secret scanning | Added `.github/workflows/secret-scan.yml` (gitleaks over full history) + `gitleaks.toml` allowlist for the repo's documented placeholders/dev fallbacks. |
| 3 | `prisma db push --accept-data-loss` in the deploy/E2E pipeline | Replaced with `npx prisma migrate deploy` — non-destructive; the catastrophic `--accept-data-loss` flag is gone. |
| 4/26 | ~13 MB of APK/AAB + 7 historical copies in the public repo | `/download` page is now env-driven (`NEXT_PUBLIC_APK_URL` falls back to the committed path). `.gitignore` now blocks `public/downloads/*.apk|aab` so new binaries don't get committed again. |
| doc | Stale `?key=` secret-in-URL comment on `/admin-login` | Corrected the comment — no such parameter exists; admin sign-in is credential-only. |

## Manual actions still required (cannot be done from the repo)

1. **Rotate the exposed Firebase API key.** The public repo's history contains
   `android/app/google-services.json` with key `AIzaSyCWkOc1yACJ8IybfYrJk1R3DNAxpOf9Uck`
   (project `kynthai-prod`).
   - GCP Console → APIs & Services → Credentials: **restrict the key** to your Android app
     (package name `app.kynthai.health` + app cert SHA-1/SHA-256) and to the FCM/Maps APIs only.
   - **Disable/rotate** that key and regenerate `google-services.json`, then re-commit the new file.
   - The Android build tolerates a missing/changed `google-services.json`
     (`android/app/build.gradle` logs "not found" and skips native FCM), so a stale copy
     won't break the build — but the old key must be revoked.

2. **Run a live `npm audit`** in a normal terminal (the sandbox here can't spawn node):
   `npm audit --omit=dev`. CI already enforces a HIGH/CRITICAL gate
   (`scripts/deps-audit-check.mjs`), so this is a confirmation, not a blocker.

3. **Verify Supabase Storage ACLs** (15/46): confirm the `private-uploads` bucket is not
   public-read; RLS is enabled on the 12 core tables with default-deny policies.

4. **Purge the historical APK/AAB blobs** from git history if you want the repo smaller /
   cleaner (the `.gitignore` stop is forward-looking only). E.g. BFG or
   `git filter-repo --invert-paths --path public/downloads`.

## Test status
- Code changes are type-safe (verified against the Prisma `User` model: `isDemo`, `email`
  present; `jsonError` in scope; no orphaned refs after removing `DEMO_EMAILS`).
- Full `next build` / `tsc` could not be run in this sandbox (node cannot spawn); run CI
  (`ci.yml` + `deploy.yml`) to confirm. No payment code was touched.
