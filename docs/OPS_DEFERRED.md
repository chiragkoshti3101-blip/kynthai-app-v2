# Deferred operations checklist (server/agent scope)

Items that require production secrets, database execution, staging validation, or parallel middleware work (PR #80).

## Secrets & infrastructure

1. **SESSION_SIGNING_SECRET** — Generate a 32+ byte random secret; set in Vercel Production. App fails closed without it (`src/lib/session-signing.ts`).
2. **UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN** — Configure for distributed rate limiting; alert on in-memory fallback logs (`src/lib/rate-limit.ts`). Edge middleware remains in-memory until wired in PR #80+.
3. **KYNTHAI_CLAMSCAN** — Enable ClamAV socket/host in staging, then production; verify EICAR rejection on `POST /api/documents/upload` after deploy.
4. **CORS_ORIGIN** — Set explicit HTTPS origins in production (required by `applyStandardHeaders`).

## PHI encryption backfill (KYN-CRIT-004)

1. In staging: snapshot DB, run `node scripts/encrypt-existing-data.mjs`, verify no plaintext in sampled `*_enc` columns.
2. Set `ENCRYPTION_TRANSITIONAL=false` in production only after backfill verification.
3. Schedule additive migration to drop/null legacy plaintext columns (do not run destructive DDL until legal/compliance sign-off).

## Stripe / payments (out of agent scope)

1. Set live Stripe keys and webhook secret when ready.
2. Disable mock checkout paths in staging if product requires real charges (`KYN-MED-011`).

## Middleware / edge auth (PR #80 — do not change here)

1. Default-deny or expand `AUTH_REQUIRED_PREFIXES` for `/api/*`.
2. Edge role enforcement for `/admin` and portal routes.
3. CSRF allowlist review (`fcm-register`, `bootstrap-schema`).

## Staging-only validation

1. Manual download test for encrypted medical PDF (`KYN-CRIT-002` staging acceptance).
2. Health-report prompt capture — confirm no name/email/raw chat in outbound payload.
3. Account erasure spot-check: no `MedicalDocument` rows or storage objects for deleted user ID.

## Legacy lab shares

Bookings created before `2025-06-01` with empty `resultsSharedWith` remain readable; newer bookings require explicit doctor profile IDs (`src/app/api/lab/share/[token]/route.ts`).
