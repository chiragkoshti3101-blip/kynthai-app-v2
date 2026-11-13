# Kynthai — Issue Register (Phase 1)

**Format:** `id` | **severity** | area | paths | evidence | root cause | proposed fix | dependencies | acceptance criteria

Severity scale: **Critical** (exploit/data loss/build blocker) → **High** → **Medium** → **Low**.

---

## Summary counts

| Severity | Count |
|----------|------:|
| Critical | 4 |
| High | 14 |
| Medium | 18 |
| Low | 9 |
| **Total** | **45** |

---

## Critical

### KYN-CRIT-001 — Production build fails TypeScript check

| Field | Detail |
|-------|--------|
| **Area** | Build / CI |
| **Paths** | `src/app/api/documents/[id]/download/route.ts`, `src/app/api/feedback/route.ts`, `src/lib/health-files.ts`, `src/lib/storage.ts`, `src/lib/__tests__/encryption-file-split.test.ts` |
| **Evidence** | `npm run build` → “Failed to type check”; `tsc` errors TS2554 / TS2769 / TS7053 (see `docs/ENGINEERING_AUDIT.md` §9.3). |
| **Root cause** | Incomplete refactor: callers use `decryptFile(ciphertext, iv, salt, authTag)` but `encryption.ts` exports single-buffer `decryptFile(stored)` only; Zod v4 enum `errorMap` usage in feedback route. |
| **Proposed fix** | Add `decryptFileParts(...)` overload (or restore 4-arg signature), fix `feedbackSchema` for Zod 4, type `fields` record. |
| **Dependencies** | None |
| **Acceptance** | `npx tsc -b --noEmit` and `npm run build` exit 0 on CI without skipping typecheck. |
| **Status** | **Fixed** (Batch 0–1) — `decryptFile` overload + Zod 4 feedback enum + lockfile sync. |

### KYN-CRIT-002 — Medical document streaming decryption broken

| Field | Detail |
|-------|--------|
| **Area** | PHI / documents |
| **Paths** | `src/lib/encryption.ts:164-180`, `src/app/api/documents/[id]/download/route.ts:88`, `src/lib/storage.ts:304`, `src/lib/health-files.ts:81` |
| **Evidence** | Vitest: `encryption-file-split.test.ts` fails “round-trips the split form”; runtime path passes 4 args to 1-arg function. |
| **Root cause** | Split-metadata storage (`encryptionKey` = `iv:salt:tag`) not aligned with `decryptFile` API. |
| **Proposed fix** | Implement split decrypt helper; use consistently in download, storage, health-files; keep packed envelope for `encryptHealthFile`. |
| **Dependencies** | KYN-CRIT-001 |
| **Acceptance** | All encryption-file-split tests green; manual download returns decrypted bytes for uploaded test PDF in staging. |
| **Status** | **Fixed** (Batch 0–1) — `decryptFileParts` + split/packed `decryptFile`. |

### KYN-CRIT-003 — `DATABASE_URL` unset crashes DB accessors

| Field | Detail |
|-------|--------|
| **Area** | Reliability / dev ergonomics |
| **Paths** | `package.json` (`dev`: `unset DATABASE_URL`), `src/lib/db.ts:13-14`, `src/app/api/doctors/route.ts` |
| **Evidence** | Dev probe: `GET /api/doctors` → 500 `Cannot read properties of undefined (reading 'startsWith')` when `DATABASE_URL` unset. |
| **Root cause** | `resolveDatabaseUrl` assumes string; dev script deliberately clears URL. |
| **Proposed fix** | Fail closed with clear 503 JSON when `DATABASE_URL` missing; document dev requirement or use local SQLite/file URL in `.env.example`. |
| **Dependencies** | None |
| **Acceptance** | With missing `DATABASE_URL`, API returns structured 503, not 500 stack trace; `npm run dev` documented with required env. |
| **Status** | **Fixed** (Batch 0–1) — `dev` no longer unsets URL; `DatabaseNotConfiguredError` + `ensureDatabase()`. |

### KYN-CRIT-004 — Dual plaintext + encrypted columns (transitional PHI exposure)

| Field | Detail |
|-------|--------|
| **Area** | Privacy / encryption |
| **Paths** | `prisma/schema.prisma` (e.g. `Medication` name/dosage plaintext + `*_enc`), `src/lib/prisma-encryption-middleware.ts`, `HIPAA-COMPLIANCE.md` |
| **Evidence** | Schema retains plaintext columns; middleware clears on write but legacy rows may still read plaintext when `_enc` null and transitional mode enabled. |
| **Root cause** | Incremental encryption rollout without mandatory backfill + strict mode enforcement in all environments. |
| **Proposed fix** | Run `scripts/encrypt-existing-data.mjs` + verify; set `ENCRYPTION_TRANSITIONAL=false` in production; migration to drop/null plaintext after verify. |
| **Dependencies** | Ops runbook, staging DB |
| **Acceptance** | Sample audit query shows zero non-null plaintext on encrypted fields in prod; strict mode on in prod env. |
| **Status** | **Partial** (Batch 0–1) — writes clear plaintext; transitional read fallback; `docs/ENCRYPTION_BACKFILL.md` + existing `scripts/encrypt-existing-data.mjs` (not executed). Prod backfill + `ENCRYPTION_TRANSITIONAL=false` remain ops (Batch 4). |

---

## High

### KYN-HIGH-001 — IDOR on `GET /api/medications/[id]` when `userId` is null

| Field | Detail |
|-------|--------|
| **Paths** | `src/app/api/medications/[id]/route.ts:31-47` |
| **Evidence** | Ownership check only inside `if (med.userId && med.userId !== u.id)`; if `userId` null, returns medication without `owns` logic used on PUT/DELETE. |
| **Root cause** | Asymmetric GET vs mutating handlers. |
| **Proposed fix** | Reuse PUT `owns` predicate on GET; deny when neither owner nor permitted family caretaker. |
| **Dependencies** | DB migration if legacy null `userId` rows exist |
| **Acceptance** | Security test: user A cannot GET user B’s family-member med by ID; fuzz legacy rows. |

### KYN-HIGH-002 — Monthly health report sends identifiable PHI to third-party LLM

| Field | Detail |
|-------|--------|
| **Paths** | `src/app/api/health-report/route.ts:75-178` |
| **Evidence** | JSON payload includes `user.name`, exact age, allergies, meds, **recent chat message content**; unlike `buildDeidentifiedContext` in chat. |
| **Root cause** | Route added without PHI filter parity. |
| **Proposed fix** | Reuse `buildDeidentifiedContext` / `phi-filter`; exclude chat verbatim; add `isAiAvailable()` guard. |
| **Dependencies** | Legal review of AI subprocessors |
| **Acceptance** | Unit test asserts outbound prompt contains no name/email/raw chat; manual prompt capture in staging shows de-identified payload. |

### KYN-HIGH-003 — Symptom analyzer: clinical JSON without server output controls

| Field | Detail |
|-------|--------|
| **Paths** | `src/app/api/symptom-analyze/route.ts`, `src/components/medication/symptom-analyzer.tsx` |
| **Evidence** | Prompt requests `possibleCauses`, `otcOptions`; no `safeAIResponse`; UI claims “real-time web search” but server sets `searchResults = []`. |
| **Root cause** | Trust model = model JSON + UI disclaimer only. |
| **Proposed fix** | Post-process with schema validation + mandatory fixed disclaimer append; fix marketing copy or implement search. |
| **Dependencies** | Product copy |
| **Acceptance** | API rejects/hard-caps OTC lists; e2e asserts disclaimer present; search claim removed or backed by data source. |

### KYN-HIGH-004 — Drug interactions route may suggest alternative meds (LLM)

| Field | Detail |
|-------|--------|
| **Paths** | `src/app/api/interactions/route.ts` |
| **Evidence** | JSON schema includes `alternativeSuggestion`; user’s active med names+dosages in prompt; no output filter. |
| **Root cause** | Open-ended LLM clinical advice. |
| **Proposed fix** | Remove or constrain field to “discuss with prescriber”; apply `safeAIResponse`. |
| **Dependencies** | Medical safety review |
| **Acceptance** | Automated test: response never contains unsolicited drug switch without clinician framing. |

### KYN-HIGH-005 — `seed-demo` resets known password and returns it in JSON

| Field | Detail |
|-------|--------|
| **Paths** | `src/app/api/system/seed-demo/route.ts:83`, `src/middleware.ts` (system path, no CSRF) |
| **Evidence** | Response includes `password: 'Demo@2024'`; upserts `patient@kynthai.app`, `admin@kynthai.app`, etc. |
| **Root cause** | QA convenience endpoint reachable with `CRON_SECRET`. |
| **Proposed fix** | Never return password; use random per-seed passwords; disable endpoint on production or IP-restrict; rotate secrets on schedule. |
| **Dependencies** | Ops |
| **Acceptance** | Response body has no credentials; prod deployment has endpoint disabled or 404. |

### KYN-HIGH-006 — Account deletion incomplete (erasure gaps)

| Field | Detail |
|-------|--------|
| **Paths** | `src/app/api/user/account/route.ts:113-182` |
| **Evidence** | Deletes many tables but not `MedicalDocument`, `PushSubscription`, `Complaint`, `ConsultMessage`, `VideoCall*`, storage blobs. |
| **Root cause** | Handler grown without full model inventory. |
| **Proposed fix** | Extend DELETE cascade list + Supabase object delete; document Stripe customer handling. |
| **Dependencies** | Storage API |
| **Acceptance** | Post-delete integration test: no rows or objects remain for user ID in DB + storage listing. |

### KYN-HIGH-007 — Medical document upload without antivirus scan

| Field | Detail |
|-------|--------|
| **Paths** | `src/app/api/documents/upload/route.ts` vs `src/app/api/upload/route.ts:88-100` |
| **Evidence** | Documents route: magic-byte checks only; health upload calls `scanBuffer`. |
| **Root cause** | AV wired on one path only. |
| **Proposed fix** | Call `scanBuffer` + `isAntivirusRequired()` before encrypt on documents route. |
| **Dependencies** | `KYNTHAI_CLAMSCAN` in prod |
| **Acceptance** | EICAR test file rejected on documents upload in staging with AV required. |

### KYN-HIGH-008 — Push payload leaks drug names on lock screen channel data

| Field | Detail |
|-------|--------|
| **Paths** | `src/lib/notifications.ts:602-618`, `src/lib/push-server.ts` |
| **Evidence** | Lock-screen title/body generic, but `data.medName`, `dosage`, URL query `med=` still set. |
| **Root cause** | Deep-link convenience over privacy on device backups/logs. |
| **Proposed fix** | Push `data` only opaque IDs; fetch med details in-app after auth. |
| **Dependencies** | Mobile clients |
| **Acceptance** | Push payload inspection shows no drug strings; reminders still open correct screen. |

### KYN-HIGH-009 — Doctor dashboard shows sample PHI-like data on API failure

| Field | Detail |
|-------|--------|
| **Paths** | `src/components/kynthai/doctor/doctor-dashboard.tsx:737-754, 894-908` |
| **Evidence** | `isRealData` false when `dashboardData === null` → renders `APPOINTMENTS` / demo patients; banner on error still shows samples. |
| **Root cause** | Demo fallbacks used as loading/error state. |
| **Proposed fix** | Skeleton/error empty states only for non-demo; never render `APPOINTMENTS` for real accounts on error. |
| **Dependencies** | None |
| **Acceptance** | With API 500, verified doctor sees error state, zero fake patient names. |

### KYN-HIGH-010 — Middleware auth prefix gaps (defense in depth)

| Field | Detail |
|-------|--------|
| **Paths** | `src/middleware.ts:223-265`, `673-680` |
| **Evidence** | `/api/admin/*`, `/api/user/*`, many routes not in `AUTH_REQUIRED_PREFIXES`; handlers usually call `requireAuth`. |
| **Root cause** | Prefix list incomplete vs API growth. |
| **Proposed fix** | Default-deny: require session for all `/api/*` except explicit public/system sets; or extend prefix list. |
| **Acceptance** | Unauthenticated request to `/api/user/data-export` gets 401 at edge without hitting handler. |

### KYN-HIGH-011 — Portal role not enforced at edge

| Field | Detail |
|-------|--------|
| **Paths** | `src/middleware.ts:621-623` |
| **Evidence** | Comments: role enforced client-side only; any session can load `/admin` HTML. |
| **Root cause** | Role not in JWT at edge without DB lookup. |
| **Proposed fix** | Encode role in signed session cookie or lightweight edge role check. |
| **Dependencies** | Auth design |
| **Acceptance** | Patient session receives 403 on `/admin` document request at edge. |

### KYN-HIGH-012 — Prescription intelligence image path may not be multimodal

| Field | Detail |
|-------|--------|
| **Paths** | `src/app/api/prescription-intelligence/route.ts` |
| **Evidence** | Image flag uses text-only user message vs multimodal in `prescription-scan`. |
| **Root cause** | Copy/paste divergent implementations. |
| **Proposed fix** | Align message format with vision API used elsewhere. |
| **Dependencies** | AI provider |
| **Acceptance** | Integration test with sample Rx image returns structured fields in staging. |

### KYN-HIGH-013 — `package-lock.json` out of sync with `package.json`

| Field | Detail |
|-------|--------|
| **Paths** | `package-lock.json`, CI `npm ci` |
| **Evidence** | `npm ci` failed: Missing `magicast@0.3.5`. |
| **Root cause** | Lock not updated after dependency change. |
| **Proposed fix** | Regenerate lock on main; enforce `npm ci` in dev docs. |
| **Dependencies** | None |
| **Acceptance** | Fresh clone + `npm ci` succeeds on CI and agent VM. |

### KYN-HIGH-014 — Distributed rate limiting degrades to per-instance memory

| Field | Detail |
|-------|--------|
| **Paths** | `src/lib/rate-limit.ts:150-157`, `src/middleware.ts` (`rateLimitWithInfo` always in-memory) |
| **Evidence** | Production warns and falls back when Upstash missing/unconfigured; edge never uses Redis. |
| **Root cause** | Availability-first design on serverless. |
| **Proposed fix** | Wire edge Upstash limiter or accept + alert; ensure `UPSTASH_*` set in prod. |
| **Dependencies** | Upstash account |
| **Acceptance** | Load test from multiple workers shows shared 429 budget on login route. |

---

## Medium

### KYN-MED-001 — Session signing falls back to Supabase service role key

| **Paths** | `src/lib/session-signing.ts:23-24` |
| **Fix** | Require dedicated `SESSION_SIGNING_SECRET` in production; remove fallback. |
| **Acceptance** | App fails startup in prod if `SESSION_SIGNING_SECRET` unset. |

### KYN-MED-002 — Legacy lab share: empty `resultsSharedWith` allows any verified doctor

| **Paths** | `src/app/api/lab/share/[token]/route.ts:58-60` |
| **Fix** | Backfill share list or deny when empty unless explicit legacy flag. |

### KYN-MED-003 — `test-dose` cron can target arbitrary email

| **Paths** | `src/app/api/system/test-dose/route.ts:21-24` |
| **Fix** | Allowlist demo emails; drop query param in production. |

### KYN-MED-004 — `bootstrap-schema` DDL via bearer token (GET, no CSRF)

| **Paths** | `src/app/api/admin/bootstrap-schema/route.ts` |
| **Fix** | One-time migration job; disable after use; rate-limit failures. |

### KYN-MED-005 — Audit `details` stores PHI-adjacent strings

| **Paths** | `src/app/api/documents/upload/route.ts`, download audit lines |
| **Fix** | Store resource type + masked ID only. |

### KYN-MED-006 — Many PHI fields never enrolled in encryption middleware

| **Paths** | `LabBooking` delivery address, `MedicalDocument.title`, `VideoCall.notes`, etc. |
| **Fix** | Extend middleware map or stop persisting sensitive free text in plaintext columns. |

### KYN-MED-007 — Doctor nudge pushes free-text clinical message to lock screen

| **Paths** | `src/lib/notifications.ts:657-668` |
| **Fix** | Generic push body; clinical text in-app only. |

### KYN-MED-008 — Supabase storage client placeholder credentials

| **Paths** | `src/lib/storage.ts:11-12` |
| **Fix** | Fail closed in production if URL/key missing. |

### KYN-MED-009 — Server Supabase client may fall back to anon key

| **Paths** | `src/lib/supabase/get-server-client.ts` |
| **Fix** | Never use anon key for admin storage paths. |

### KYN-MED-010 — `parse-schedule` / `health-report` no `isAiAvailable()` soft fail

| **Paths** | respective `route.ts` |
| **Fix** | Consistent unavailable response vs 500. |

### KYN-MED-011 — Mock payment provider in non-production may confuse staging

| **Paths** | `src/app/api/payments/route.ts:61`, `checkout-page.tsx` demo banner |
| **Fix** | Require Stripe in staging; feature-flag mock. |

### KYN-MED-012 — Consult messaging API without UI

| **Paths** | `src/app/api/consult-messages/route.ts` — no component imports |
| **Fix** | Ship UI or mark API experimental / hide. |

### KYN-MED-013 — Video token / SFU story incomplete

| **Paths** | `src/app/api/video-call/token/route.ts` |
| **Fix** | Document supported path; remove mock in prod or gate feature. |

### KYN-MED-014 — Admin overview unbounded `findMany` scans

| **Paths** | `src/app/api/admin/overview/route.ts:31-76` |
| **Fix** | Pagination / aggregated SQL / materialized counts. |

### KYN-MED-015 — Large client bundles (patient/doctor/admin apps 1.5k–2.4k LOC)

| **Paths** | `patient-app.tsx`, `doctor-dashboard.tsx`, etc. |
| **Fix** | Route-level code split, lazy tabs, React Query consolidation. |

### KYN-MED-016 — No `src/app/api/**` unit tests

| **Paths** | Vitest only under `src/lib` |
| **Fix** | Add handler tests for auth, IDOR, AI guardrails (priority routes). |

### KYN-MED-017 — Unused dependencies increase attack surface

| **Paths** | `socket.io-client`, `@dnd-kit/*`, `next-auth`, `@auth/supabase-adapter` (no src imports) |
| **Fix** | Remove or wire; verify bundle. |

### KYN-MED-018 — COPPA privacy copy vs schema (under 16) vs API (under 18 consent)

| **Paths** | `privacy-policy.tsx`, `family/members/route.ts:36-58` |
| **Fix** | Align age thresholds and consent records with legal counsel. |

---

## Low

| ID | Title | Paths | Notes |
|----|-------|-------|-------|
| KYN-LOW-001 | Orphan NextAuth config | `src/lib/auth.config.ts` | Remove or integrate |
| KYN-LOW-002 | `GET /api/debug` exposed in dev | `src/app/api/debug/route.ts` | 404 in production ✓ |
| KYN-LOW-003 | `fcm-register` CSRF exempt | `middleware.ts` | Document threat model |
| KYN-LOW-004 | CSP `unsafe-inline` scripts | `middleware.ts` CSP | Needed for Next hydration |
| KYN-LOW-005 | Lab modal backdrop not keyboard-accessible | `lab-dashboard.tsx:322` | Add button + Esc handler |
| KYN-LOW-006 | `encryptString` dead/wrong key path | `encryption.ts:117-136` | Remove or fix |
| KYN-LOW-007 | Firebase engines want Node 24 | `npm warn EBADENGINE` | Pin or upgrade runtime |
| KYN-LOW-008 | Internal docs contradict (strict, versioning) | `docs/*` | Update after fixes |
| KYN-LOW-009 | `schema-complete.sql` drift risk | root SQL files | Deprecate in favor of Prisma |

---

## Suggested fix order (cross-reference)

See `docs/PRODUCTION_READINESS.md` for batched implementation plan aligned to these IDs.
