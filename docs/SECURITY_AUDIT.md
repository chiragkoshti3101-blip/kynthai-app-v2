# Kynthai — Security Audit (Application Security Review)

**Scope:** authentication, authorization, role-based access, session management, API security,
SQL injection, XSS, CSRF, SSRF, IDOR, file uploads, rate limiting, input validation, secret
management, dependency vulnerabilities, database access policies, sensitive-data logging.

**Method:** source review of `src/` (middleware, `lib/`, route handlers), SQL migrations, and
`npm audit`. Every finding below is backed by a file path or command output. Nothing here is a
penetration test: no request was sent against a running deployment, and no live database was
queried.

**Severity:** Critical (exploitable now / PHI exposure) · High · Medium · Low · Info.

---

## Findings

### SEC-001 — Vulnerable `fast-uri` (authority injection) — **High — Fixed**

| | |
|---|---|
| Evidence | `npm audit`: `fast-uri 3.0.0 - 3.1.8`, "authority injection via an unvalidated port in serialize", also "host confusion via an unclosed bracket". Reached transitively through the pinned override `"fast-uri": "3.1.6"`. |
| Impact | URI parsing mismatch can turn a validated URL into a different authority (SSRF/allow-list bypass class) in code paths that parse caller-supplied URLs. |
| Fix | Override bumped to `3.1.9` (patched release); lockfile regenerated. |
| Verification | `npm audit` after the bump: **0 high, 0 critical** (was 1 high); 12 moderate / 5 low remain, all in build-time tooling. |

### SEC-002 — Row Level Security missing on seven Prisma-created tables — **High — Fixed in migration, runtime verification blocked**

| | |
|---|---|
| Evidence | `supabase/migrations/20261108_comprehensive_rls.sql` enables RLS for 35 tables. `prisma/migrations/` contains no `ROW LEVEL SECURITY` statement (`grep -r "ROW LEVEL SECURITY" prisma/migrations` → no matches). Tables created by Prisma and absent from the RLS migration: `medical_documents`, `push_subscriptions`, `revoked_sessions`, `feedback`, `newsletter_subscribers`, `free_tier_usage`, `free_tier_usage_audit`. |
| Impact | Supabase grants `anon`/`authenticated` access to new tables in `public` by default. Any such table without RLS is readable through PostgREST with the anon key that ships in the client bundle — for `medical_documents` that is the document metadata table (titles, storage paths, sizes). This is exposure independent of the Next.js app, which uses Prisma with the service role and bypasses RLS. |
| Fix | `supabase/migrations/20261113_rls_internal_tables.sql` enables RLS and revokes `anon`/`authenticated` privileges on the seven tables. The app is unaffected because Prisma connects as the service role. |
| Verification | **Blocked** — applying a migration and running `SET ROLE anon; SELECT * FROM medical_documents;` requires database access this environment does not have. The migration must be applied in staging, then production, and the query re-run to confirm zero rows. |

### SEC-003 — Operator endpoints used a non-constant-time token compare with no throttling — **Medium — Fixed**

| | |
|---|---|
| Evidence | `src/app/api/admin/bootstrap-schema/route.ts`, `.../diag/test-push/route.ts`, `.../diag/timezone/route.ts`, `.../diag/notifications/route.ts` all did `provided !== \`Bearer ${expected}\``. `test-push` fans a real push out to every registered device and `timezone` can bulk-update user rows. |
| Impact | Timing side-channel on the deployment secret plus unlimited guessing attempts; a single leaked token also grants a mass-push primitive. |
| Fix | New `src/lib/operator-token.ts`: `timingSafeEqual` comparison, 5 requests/min per caller, fails closed when `SCHEMA_BOOTSTRAP_TOKEN` is unset. All four routes now call `requireOperatorToken(req)`. |
| Verification | `npm run typecheck` + full Vitest suite (see Remediation log). Runtime token-rejection not exercised (no deployment). |

### SEC-004 — `/api/migrate` composes DDL with string interpolation — **Medium — Accepted, recommend deletion**

| | |
|---|---|
| Evidence | `src/app/api/migrate/route.ts` builds statements as `` `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "${col.column}" ${col.type}` `` and executes them with `$executeRawUnsafe`. |
| Impact | Not exploitable today: `col.column`/`col.type` come from hard-coded arrays in the same file, the route returns 404 when `NODE_ENV === 'production'`, and it requires `MIGRATION_SECRET`. The pattern is still one edit away from injection if a request value is ever fed into it. |
| Fix | Not changed in this pass. Recommendation: delete the route now that the columns exist in Prisma migrations; if it must stay, derive the column list from a typed constant and validate `column`/`type` with an allow-list regex. |

### SEC-005 — Edge rate limiting is per-instance — **Medium — Open (ops)**

| | |
|---|---|
| Evidence | `src/middleware.ts` calls `rateLimitWithInfo` (in-memory). Upstash is only used on the Node path (`requireAuth` → `rateLimitProduction`); `isDistributedRateLimitActive()` is exposed for observability but the edge never calls Redis. |
| Impact | On serverless, N instances multiply the effective limit by N. Login/OTP brute-force protection is weaker than the configured number suggests. |
| Fix | Open — needs Upstash REST credentials wired into the edge limiter and `UPSTASH_*` set in production. Tracked as KYN-HIGH-014. |

### SEC-006 — Environment identifier committed in a report — **Low — Fixed**

| | |
|---|---|
| Evidence | `PRODUCTION-READINESS-REPORT.md` contained a live `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` value. |
| Impact | Publishable/anon keys are designed to be public, so this is not a secret disclosure; it still leaks a project identifier in version control and normalises pasting credentials into docs. |
| Fix | Value redacted in the report. |

### SEC-007 — CSRF exemptions on system paths — **Low — Verified, no change**

| | |
|---|---|
| Evidence | `src/middleware.ts` `SYSTEM_API_PATHS` exempts cron endpoints plus `/api/auth/logout`, `/api/newsletter`, `/api/notifications/fcm-register`. Cron callers hold no browser cookie; logout's worst case is ending the victim's own session, and session cookies are `SameSite=strict`. |
| Impact | None demonstrated. Exemption is deliberate and documented inline. |
| Fix | No change. Add `/api/notifications/fcm-register` session binding if push-token hijacking is ever reported. |

### SEC-008 — `node-forge` advisory via APNs client — **Low — Accepted (no fix available)**

| | |
|---|---|
| Evidence | `npm audit`: `@parse/node-apn → node-forge <=1.4.2`, "Ed25519 signature verification accepts small-order public keys", `fixAvailable: false`. |
| Impact | Only used server-side to sign APNs requests with the project's key; no attacker-supplied signatures are verified through it. |
| Fix | None upstream. Monitor; replace the APNs client if a patched release lands. |

### SEC-009 — Inline HTML injection points — **Low — Verified safe**

| | |
|---|---|
| Evidence | `dangerouslySetInnerHTML` appears in `src/app/layout.tsx` (static boot CSS + theme script), `src/components/ui/chart.tsx` (CSS custom properties from developer-supplied config), `src/components/structured-data.tsx` (JSON-LD from static schema objects and static FAQ props). No user/DB string reaches any of them. |
| Impact | None found. Residual risk if FAQ content ever becomes user-editable — `JSON.stringify` does not escape `</script>`. |
| Fix | No change. If FAQ entries become dynamic, escape `<` as `\u003c` before serialising. |

### SEC-010 — Sensitive-data logging — **Info — Verified**

| | |
|---|---|
| Evidence | `src/middleware.ts` redacts PHI-bearing query keys (`patientId`, `symptoms`, `diagnosis`, …) and masks IDs in paths before logging; `src/lib/logger.ts` exposes `phiSafeError`, used on webhook and auth failure paths; audit writes for malware rejection now store `resourceType` only (see KYN-MED-005). |
| Impact | None found in reviewed paths. |
| Fix | n/a |

---

## Verified controls (no defect found in this pass)

| Control | Evidence |
|---|---|
| Session integrity | Supabase `auth.getUser()` with an 8 s timeout; fallback is the HMAC-signed `kynthai-session` cookie verified by `verifySessionToken`, with a revocation lookup that fails closed (`src/lib/api-helpers.ts:233+`). Forged sb-* cookies are rejected at the edge by `verifySupabaseJwt` (HS256/ES256), not decoded-and-trusted. |
| API default-deny | `src/middleware.ts` requires a session for `/api/*` unless the path is explicitly public/system; role checks are enforced in handlers (`requireAdmin`). |
| Authorization on admin routes | `admin/blocked`, `admin/doctors`, `admin/fraud`, `admin/labs`, `admin/overview`, `admin/retention` all call `requireAdmin`; demo accounts are hard-blocked from admin in production (`isDemoAdminBlockedInProduction`). Diag/bootstrap routes use the operator token instead of a user session (SEC-003). |
| IDOR | `GET/PUT/DELETE /api/medications/[id]` share `userOwnsMedication` (fixed in KYN-HIGH-001); prescriptions verify patient/doctor linkage before writes. |
| CSRF | Double-submit token enforced in middleware for every state-changing API request except documented system paths; token is HttpOnly + SameSite=strict. |
| SQL injection | All data access goes through Prisma parameterised queries. Raw SQL is limited to fixed DDL lists, parameterised `$1` lookups, or constant statements (SEC-004 is the only interpolation pattern and is constant-fed). |
| File uploads | `src/app/api/documents/upload/route.ts`: 50 MB cap, MIME allow-list, magic-byte cross-check against the declared MIME type, ClamAV scan before encryption, and rejection when AV is required but unavailable. |
| Secret management | No server-only secret is referenced with a `NEXT_PUBLIC_` prefix; `getSupabaseServerKey()` never returns the anon key in production; `getSupabaseAdmin()` throws in production when storage credentials are absent. |
| Secret-leak scanning | `.gitleaks.toml` present for CI; the only credential-shaped string found by review was the public publishable key in SEC-006. |

## Not verified / blocked

- **Multi-role authorization testing (runtime).** No staging accounts or database are reachable
  from this environment, so "user A cannot read user B's records" was verified by code review of
  ownership predicates, not by executing requests with two sessions.
- **Live RLS behaviour (SEC-002).** Migration written; applying it and testing with `SET ROLE anon`
  needs database access.
- **Penetration testing / load testing.** Not performed. This report must not be read as a
  penetration-test result or as evidence of HIPAA/GDPR compliance.
- **Remaining dependency advisories.** One high is fixed; 12 moderate and 5 low remain, mostly
  dev-tooling (`@sentry/nextjs` glob/minimatch, `@typescript-eslint/*`) that would need major
  upgrades. They are build-time paths, not request paths.

## Remediation log

| Item | Change | Verification |
|---|---|---|
| SEC-001 | `package.json` override `fast-uri` 3.1.6 → 3.1.9, lockfile regenerated | `npm audit` (see commit) |
| SEC-002 | `supabase/migrations/20261113_rls_internal_tables.sql` | Static SQL review; **not applied** |
| SEC-003 | `src/lib/operator-token.ts` + four routes updated | `npm run typecheck`, `npx vitest run` |
| SEC-006 | Publishable key redacted in `PRODUCTION-READINESS-REPORT.md` | Diff review |
| KYN-MED-006 | `*_enc` shadows + middleware + backfill entries for `MedicalDocument.title/description`, `VideoCall.notes`, `LabBooking.deliveryAddress/City/Zip` | New unit tests in `prisma-encryption-write.test.ts`; **backfill not executed** |
