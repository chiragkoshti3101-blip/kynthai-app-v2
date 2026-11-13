# Kynthai — Architecture Audit (Phase 1)

**Date:** 2026-11-13  
**Base:** `main` after PR #78 (Batch 0–1 critical fixes)  
**Prior work:** `docs/ISSUE_REGISTER.md`, `docs/PRODUCTION_READINESS.md` — security/product findings are cross-referenced, not duplicated here.  
**Note:** `docs/ENGINEERING_AUDIT.md` is referenced by the issue register but not present in the repo; tool outputs in this document substitute for that evidence.

## Tooling summary (reproducible)

| Command | Result | Log / exit |
|---------|--------|------------|
| `npm ci` | Success | 1177 packages |
| `npm run typecheck` (`tsc --noEmit`) | **Pass** | exit 0 |
| `npm run lint` (`eslint .`) | **Pass** | exit 0 (warnings only pre-fix) |
| `npm run test:ci` (`vitest --run`) | **199/199** | exit 0 |
| `npm run build` | **Pass** | exit 0 |
| `npx madge --circular src` | **0 cycles** (after fix; was 1) | `analytics-consent ↔ analytics` |
| `npx depcheck` | Reported unused deps | see ARCH-MED-005 |
| `npx knip` | 132 unused files, unused exports | see ARCH-LOW-001 |

---

## Severity counts (architecture scope)

| Severity | Total | Fixed this PR | Deferred |
|----------|------:|--------------:|---------:|
| Critical | 2 | 0 | 2 |
| High | 6 | 2 | 4 |
| Medium | 12 | 4 | 8 |
| Low | 5 | 0 | 5 |
| **Total** | **25** | **6** | **19** |

*(Counts are architecture-layer items; overlaps with KYN-* IDs in `ISSUE_REGISTER.md` are intentional.)*

---

## Critical

### ARCH-CRIT-001 — Dual plaintext + encrypted PHI columns

| | |
|--|--|
| **Severity** | Critical |
| **Decision** | **Defer** (ops / Batch 4) |
| **Evidence** | `prisma/schema.prisma` — `Medication.name` + `name_enc`, `User.allergies` + `allergies_enc`, etc. |
| **Files** | `prisma/schema.prisma`, `src/lib/prisma-encryption-middleware.ts` |
| **Cross-ref** | KYN-CRIT-004 |
| **Fix** | Backfill + `ENCRYPTION_TRANSITIONAL=false` in prod; additive migration only after verify. No destructive migration in this pass. |

### ARCH-CRIT-002 — Production readiness depends on external secrets

| | |
|--|--|
| **Severity** | Critical (operational) |
| **Decision** | **Defer** (ops) |
| **Evidence** | Session signing now fails closed without `SESSION_SIGNING_SECRET` in prod (`session-signing.ts`). Upstash unset → per-instance rate limits (`rate-limit.ts`). |
| **Files** | `src/lib/session-signing.ts`, `src/lib/rate-limit.ts`, `src/middleware.ts` |
| **Fix** | Env checklist in deploy; alert on in-memory rate-limit warn logs. |

---

## High

### ARCH-HIGH-001 — Circular module dependency (client telemetry)

| | |
|--|--|
| **Severity** | High |
| **Decision** | **Fixed** |
| **Evidence** | `madge`: `lib/analytics-consent.ts > lib/analytics.ts`; unused import in `analytics.ts` |
| **Files** | `src/lib/analytics.ts`, `src/lib/analytics-consent.ts` |
| **Fix** | Removed dead import from `analytics.ts`. Post-fix `madge`: no cycles. |

### ARCH-HIGH-002 — Admin overview unbounded `findMany` (serverless scalability)

| | |
|--|--|
| **Severity** | High |
| **Decision** | **Fixed** (aggregates + bounded trend window) |
| **Evidence** | `src/app/api/admin/overview/route.ts` previously loaded all users, appointments, lab bookings, payments per request |
| **Files** | `src/app/api/admin/overview/route.ts` |
| **Cross-ref** | KYN-MED-014 |
| **Fix** | `groupBy` / `count` for rollups; 180-day window for trend series; capped at-risk user hydrate (100). Revenue totals use SQL aggregates, not in-memory full scans. |

### ARCH-HIGH-003 — Distributed rate limiting degrades to in-memory

| | |
|--|--|
| **Severity** | High |
| **Decision** | **Defer** (product/ops) |
| **Evidence** | `src/lib/rate-limit.ts:150-157`; edge middleware uses in-memory buckets |
| **Cross-ref** | KYN-HIGH-014 |
| **Fix** | Require `UPSTASH_*` in prod + monitoring; optional edge Redis limiter — needs ops budget/sign-off. |

### ARCH-HIGH-004 — Middleware auth prefix gaps (defense in depth)

| | |
|--|--|
| **Severity** | High |
| **Decision** | **Defer** (parallel security work) |
| **Evidence** | Incomplete `AUTH_REQUIRED_PREFIXES` vs growing `/api/*` surface |
| **Files** | `src/middleware.ts` |
| **Cross-ref** | KYN-HIGH-010, KYN-HIGH-011 |
| **Fix** | Default-deny `/api` or expand prefix list; edge role check for `/admin`. |

### ARCH-HIGH-005 — AI routes uneven PHI / output controls

| | |
|--|--|
| **Severity** | High |
| **Decision** | **Defer** (other agent: health-report, medications IDOR, uploads, etc.) |
| **Evidence** | `health-report`, `interactions`, `symptom-analyze` differ from `chat` de-identification patterns |
| **Cross-ref** | KYN-HIGH-002–004 |
| **Fix** | Shared PHI builder + `safeAIResponse`; **do not edit** those routes while security batch is in flight. |

### ARCH-HIGH-006 — Unused runtime dependencies (bundle / supply chain)

| | |
|--|--|
| **Severity** | High (attack surface) |
| **Decision** | **Defer** (separate dep PR) |
| **Evidence** | `depcheck` + `rg`: no `src` imports for `socket.io-client`, `@dnd-kit/*`, `@tanstack/react-query`, `@tanstack/react-table`, `next-intl` |
| **Files** | `package.json` |
| **Cross-ref** | KYN-MED-017 |
| **Fix** | Remove after `rg` repo-wide + CI green; Capacitor packages are false positives (native tooling). |

---

## Medium

### ARCH-MED-001 — Session signing reused Supabase service role key

| | |
|--|--|
| **Severity** | Medium |
| **Decision** | **Fixed** |
| **Evidence** | `getSigningSecret()` returned `SUPABASE_SERVICE_ROLE_KEY` in production |
| **Files** | `src/lib/session-signing.ts` |
| **Cross-ref** | KYN-MED-001 |
| **Fix** | Production accepts only `SESSION_SIGNING_SECRET`; service role fallback dev-only. |

### ARCH-MED-002 — Supabase storage client placeholder credentials

| | |
|--|--|
| **Severity** | Medium |
| **Decision** | **Fixed** |
| **Evidence** | `storage.ts` used `placeholder.supabase.co` / `'placeholder'` when env unset |
| **Files** | `src/lib/storage.ts` |
| **Cross-ref** | KYN-MED-008 |
| **Fix** | Throw in production when URL or service role key missing; placeholders dev-only. |

### ARCH-MED-003 — Server Supabase client could use anon/publishable key

| | |
|--|--|
| **Severity** | Medium |
| **Decision** | **Fixed** |
| **Evidence** | `getSupabaseServerKey()` fell through to `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **Files** | `src/lib/supabase/get-server-client.ts` |
| **Cross-ref** | KYN-MED-009 |
| **Fix** | Production requires service/secret key; anon key allowed only in non-production. |

### ARCH-MED-004 — `parse-schedule` missing `isAiAvailable()` guard

| | |
|--|--|
| **Severity** | Medium |
| **Decision** | **Fixed** |
| **Evidence** | Other AI routes call `isAiAvailable()`; parse-schedule could 500 without API key |
| **Files** | `src/app/api/parse-schedule/route.ts` |
| **Cross-ref** | KYN-MED-010 |
| **Fix** | Soft JSON response when AI unavailable (parity with `prescription-scan`, `insights`). |

### ARCH-MED-005 — Inconsistent API error shapes

| | |
|--|--|
| **Severity** | Medium |
| **Decision** | **Defer** |
| **Evidence** | Mix of `jsonError(msg, status, code)`, raw `NextResponse.json({ error })`, and success wrappers without `code` |
| **Files** | `src/lib/api-helpers.ts`, many `src/app/api/**/route.ts` |
| **Fix** | Standardize on `{ error, code?, details? }` + map in OpenAPI; large mechanical change. |

### ARCH-MED-006 — Orphan NextAuth module

| | |
|--|--|
| **Severity** | Medium |
| **Decision** | **Defer** |
| **Evidence** | `knip` unused file; `rg` shows no imports of `auth.config.ts` outside itself |
| **Files** | `src/lib/auth.config.ts` |
| **Cross-ref** | KYN-LOW-001 |
| **Fix** | Remove or wire; confirm Supabase auth is sole path. |

### ARCH-MED-007 — Dead `encryptString` / `decryptString` (broken decrypt path)

| | |
|--|--|
| **Severity** | Medium |
| **Decision** | **Defer** |
| **Evidence** | `ts-prune` / `rg`: no callers; `decryptString` uses `deriveFileKey(randomBytes)` inconsistent with `encryptString` |
| **Files** | `src/lib/encryption.ts:117-136` |
| **Cross-ref** | KYN-LOW-006 |
| **Fix** | Delete pair after final `rg` confirmation or repair + tests. |

### ARCH-MED-008 — Prisma schema: transitional PHI + index coverage

| | |
|--|--|
| **Severity** | Medium |
| **Decision** | **Defer** (additive indexes OK; no migration run) |
| **Evidence** | 65 `@@index` entries; heavy `userId`/`patientId` paths; no audit of missing FK indexes in this pass |
| **Files** | `prisma/schema.prisma` |
| **Fix** | Advisor pass on staging; add indexes via additive migrations only. |

### ARCH-MED-009 — Large god components (state + data fetching)

| | |
|--|--|
| **Severity** | Medium |
| **Decision** | **Defer** |
| **Evidence** | `patient-app.tsx`, `doctor-dashboard.tsx` multi-thousand LOC; no React Query usage despite dependency |
| **Cross-ref** | KYN-MED-015 |
| **Fix** | Route-level splits + shared data layer; out of scope for critical path. |

### ARCH-MED-010 — No automated API route tests

| | |
|--|--|
| **Severity** | Medium |
| **Decision** | **Defer** |
| **Evidence** | Vitest under `src/lib/__tests__` only |
| **Cross-ref** | KYN-MED-016 |
| **Fix** | Handler tests for auth, aggregates, AI guards. |

### ARCH-MED-011 — `health-report` AI guard (PHI)

| | |
|--|--|
| **Severity** | Medium |
| **Decision** | **Defer** (other agent) |
| **Cross-ref** | KYN-HIGH-002 |
| **Fix** | Do not modify in architecture PR. |

### ARCH-MED-012 — In-memory rate-limit buckets at edge

| | |
|--|--|
| **Severity** | Medium |
| **Decision** | **Defer** |
| **Evidence** | `middleware.ts` + `rate-limit.ts` module-level `Map` |
| **Fix** | Same as ARCH-HIGH-003. |

---

## Low

### ARCH-LOW-001 — Knip: 132 unused files (components, scripts, UI kit)

| | |
|--|--|
| **Severity** | Low |
| **Decision** | **Defer** |
| **Evidence** | `npx knip` unused file list |
| **Fix** | Product-led cleanup; many are shadcn stubs / future UI. |

### ARCH-LOW-002 — Duplicate / legacy component trees

| | |
|--|--|
| **Severity** | Low |
| **Decision** | **Defer** |
| **Evidence** | `src/components/documents/DocumentList.tsx` vs API-driven lists; unused `family-portal` variants |
| **Fix** | Consolidate when feature owners agree. |

### ARCH-LOW-003 — `schema-complete.sql` drift

| | |
|--|--|
| **Severity** | Low |
| **Decision** | **Defer** |
| **Cross-ref** | KYN-LOW-009 |

### ARCH-LOW-004 — Vitest config ESM warning

| | |
|--|--|
| **Severity** | Low |
| **Decision** | **Defer** |
| **Evidence** | `vitest.config.ts` CJS/ESM mismatch warning on CI |

### ARCH-LOW-005 — Firebase engines want Node 24

| | |
|--|--|
| **Severity** | Low |
| **Decision** | **Defer** |
| **Evidence** | `npm warn EBADENGINE` during `npm ci` |
| **Cross-ref** | KYN-LOW-007 |

---

## Fixes applied in this branch

1. **ARCH-HIGH-001** — Analytics circular dependency removed.  
2. **ARCH-HIGH-002** — Admin overview uses aggregates and bounded trend queries.  
3. **ARCH-MED-001** — Session signing secret isolation in production.  
4. **ARCH-MED-002** — Storage fail-closed without Supabase credentials in production.  
5. **ARCH-MED-003** — Server Supabase key no longer falls back to anon key in production.  
6. **ARCH-MED-004** — `parse-schedule` `isAiAvailable()` guard.

---

## Explicitly out of scope (parallel agent / ops)

- KYN-HIGH-001 medications IDOR  
- KYN-HIGH-002 health-report PHI  
- KYN-HIGH-005 seed-demo  
- KYN-HIGH-006 account deletion  
- KYN-HIGH-007 document upload AV  
- KYN-HIGH-009 doctor dashboard demo fallbacks  

---

## Suggested next architecture batch

1. Dependency pruning PR (`socket.io-client`, `@dnd-kit/*`, `@tanstack/*`, `next-intl`) after `rg` verification.  
2. Remove or integrate `auth.config.ts` / `next-auth`.  
3. API error envelope + OpenAPI alignment.  
4. Upstash mandatory in prod with alerts on fallback.  
5. Encrypt backfill + strict mode (KYN-CRIT-004).
