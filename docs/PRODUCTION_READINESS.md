# Kynthai — Production Readiness (Phase 1 Assessment)

**Product:** US-focused family health — AI medicine reminders, telehealth-style consults, labs, family coordination, payments.  
**Verdict:** **Not ready for unconditional production release** until **build/type safety**, **document decryption**, and **top-tier security/privacy** items are closed. Core feature surface is broad and many controls exist; gaps are **concentrated and fixable without rewrite**.

**This is not a legal compliance certification.**

---

## 1. Readiness scorecard

| Dimension | Status | Rationale |
|-----------|--------|-----------|
| Feature completeness | **Amber** | Core flows implemented; consult UI, video SFU, mock payments partial |
| Build & deploy | **Red** | `npm run build` fails TypeScript; `npm ci` may fail on lock drift |
| Automated tests | **Amber** | 191/192 unit tests pass; no API route tests; E2E not run in audit |
| Security | **Amber** | Strong middleware; IDOR, AI PHI, cron/demo, erasure gaps |
| Privacy / encryption | **Amber** | Middleware exists; dual-column + erasure + push metadata gaps |
| Medical AI safety | **Amber** | Chat guarded; other AI routes uneven |
| Performance at scale | **Amber** | Large client bundles; unbounded admin queries |
| Observability | **Green** | Sentry, request IDs, audit hooks |
| Mobile | **Amber** | Capacitor present; not validated in this pass |
| Documentation | **Red** | Conflicting “PRODUCTION READY” vs conditional reports |

---

## 2. Blockers (must fix before marketing “production ready”)

| ID | Item |
|----|------|
| KYN-CRIT-001 | TypeScript / production build green |
| KYN-CRIT-002 | Medical file decrypt API + tests |
| KYN-HIGH-001 | Medications GET IDOR |
| KYN-HIGH-002 | Health-report PHI to LLM |
| KYN-HIGH-006 | Complete account erasure |
| KYN-HIGH-013 | Lockfile sync for `npm ci` |
| KYN-HIGH-005 | Harden/remove seed-demo password leak |

---

## 3. Implementation plan (ordered batches)

Each batch is independently shippable; later batches assume earlier **build green**.

### Batch 0 — CI hygiene (1–2 PRs, low risk)

**Goal:** Reproducible installs and honest CI signal.

| Tasks | Issues |
|-------|--------|
| Regenerate `package-lock.json`; verify `npm ci` on CI | KYN-HIGH-013 |
| Fix `feedback/route.ts` Zod 4 enum | KYN-CRIT-001 |
| Add CI artifact: typecheck + vitest + eslint (already in workflow — ensure not skipped) | — |
| Update stale internal docs (`docs/PRODUCTION-READINESS-REPORT.md`, root report) | KYN-LOW-008 |

**Acceptance:** Green CI on PR; README states `npm ci` required.

---

### Batch 1 — Build blockers & PHI file path (1 PR)

**Goal:** Ship decrypt fix; restore provider trust in uploaded documents.

| Tasks | Issues |
|-------|--------|
| Implement `decryptFileParts` (or 4-arg overload) in `encryption.ts` | KYN-CRIT-001, KYN-CRIT-002 |
| Update download, storage, health-files call sites | KYN-CRIT-002 |
| Green `encryption-file-split.test.ts` | KYN-CRIT-002 |

**Acceptance:** `npm run build` passes; staging download E2E for encrypted PDF.

---

### Batch 2 — AuthZ hardening (1–2 PRs)

**Goal:** Close IDOR and edge gaps without rewriting auth.

| Tasks | Issues |
|-------|--------|
| Fix medications GET ownership | KYN-HIGH-001 |
| Extend `AUTH_REQUIRED_PREFIXES` or default-deny `/api/*` | KYN-HIGH-010 |
| Optional: role check at edge for portal paths | KYN-HIGH-011 |
| Add vitest/integration tests for 5 IDOR scenarios | KYN-MED-016 |

**Acceptance:** New tests fail on main, pass on branch; pen-test style checklist for medications/family/documents.

---

### Batch 3 — AI safety & PHI egress (1–2 PRs)

**Goal:** Align all LLM routes with chat privacy model.

| Tasks | Issues |
|-------|--------|
| De-identify health-report payload; drop raw chat text | KYN-HIGH-002 |
| Add output validation/disclaimer on symptom + interactions | KYN-HIGH-003, KYN-HIGH-004 |
| `isAiAvailable()` on parse-schedule + health-report | KYN-MED-010 |
| Fix prescription-intelligence multimodal | KYN-HIGH-012 |
| Product: remove false “web search” claim | KYN-HIGH-003 |

**Acceptance:** Staging prompt logging review shows no name/email; legal sign-off on disclaimer placement.

---

### Batch 4 — Privacy, erasure, notifications (2 PRs)

**Goal:** US consumer privacy expectations and COPPA-aligned family flows.

| Tasks | Issues |
|-------|--------|
| Complete `DELETE /api/user/account` + storage purge | KYN-HIGH-006 |
| Strip drug names from push `data` / URLs | KYN-HIGH-008 |
| ClamAV on documents upload | KYN-HIGH-007 |
| Encryption backfill script + `ENCRYPTION_TRANSITIONAL=false` in prod | KYN-CRIT-004 |
| Align minor age thresholds (legal + API) | KYN-MED-018 |

**Acceptance:** Erasure test script passes; push payload inspection clean; AV rejects EICAR on documents route.

---

### Batch 5 — Ops, abuse, demo surface (1 PR + config)

**Goal:** Reduce production attack surface.

| Tasks | Issues |
|-------|--------|
| Remove password from seed-demo response; disable in prod if not needed | KYN-HIGH-005 |
| Restrict `test-dose` email param | KYN-MED-003 |
| Disable or IP-limit `bootstrap-schema` after migrations | KYN-MED-004 |
| Configure Upstash; alert on rate-limit fallback | KYN-HIGH-014 |
| Require `SESSION_SIGNING_SECRET` in prod | KYN-MED-001 |

**Acceptance:** Security probe scripts (`probe:security`) pass in staging; no demo credentials in API responses.

---

### Batch 6 — UX trust & performance (ongoing)

**Goal:** No fake clinical data for real users; scale admin/doctor views.

| Tasks | Issues |
|-------|--------|
| Doctor dashboard: error/empty only, no `APPOINTMENTS` fallback for real users | KYN-HIGH-009 |
| Paginate admin overview | KYN-MED-014 |
| Code-split large portal components | KYN-MED-015 |
| Remove unused deps | KYN-MED-017 |
| Wire consult-messages UI or hide API | KYN-MED-012 |

**Acceptance:** Error injection test shows no sample patient names; Lighthouse budget on patient route.

---

## 4. Environment checklist (production)

Names only — configure in Vercel/host secrets manager:

**Required for core app**

- `DATABASE_URL`, `DIRECT_URL`
- `ENCRYPTION_KEY` (64 hex)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET` and/or `SUPABASE_JWT_ES256_PUBLIC_JWK`
- `SESSION_SIGNING_SECRET`, `CRON_SECRET`
- `CORS_ORIGIN`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PK`

**Strongly recommended**

- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- AI: `NVIDIA_API_KEY` and/or `OPENAI_API_KEY` / `CLINE_API_KEY`
- Email: `SENDGRID_API_KEY` or `RESEND_API_KEY`
- Push: `VAPID_*`, `FIREBASE_*` / `APNS_*` as needed
- `SENTRY_DSN`
- `KYNTHAI_CLAMSCAN` + `KYNTHAI_REQUIRE_AV=true` if AV mandatory

**Must NOT enable in production**

- `NEXT_PUBLIC_ENABLE_DEMO=true` (code forces off but avoid building with demo flags)
- Weak/default `CRON_SECRET` / bootstrap tokens
- `ALLOW_ADMIN_AS_SYSTEM` except break-glass

---

## 5. Test gates before release

| Gate | Command / action |
|------|------------------|
| Install | `npm ci` |
| Types | `npx tsc -b --noEmit` |
| Lint | `npx eslint src e2e scripts prisma --max-warnings=0` |
| Unit | `npx vitest --run` with `ENCRYPTION_KEY` set |
| Build | `npm run build` |
| E2E | `npx playwright test` (against staging with DB) |
| Security probes | `npm run probe:security` (staging URL) |
| Dependency audit | `node scripts/deps-audit-check.mjs` |

---

## 6. Post Phase 1 next steps

1. Execute **Batch 0 + 1** immediately (unblocks CI and clinical document trust).  
2. Parallel track: legal review of AI subprocessors and children's privacy copy.  
3. Phase 2 audit: run Playwright matrix + load-test against staging with realistic data volume.  
4. Re-score this document after Batch 2–3 merge.

---

## 7. References

- `docs/ENGINEERING_AUDIT.md` — architecture and command evidence  
- `docs/ISSUE_REGISTER.md` — full issue list (45 items)  
- `docs/SECURITY_REPORT.md` — threat-oriented detail  
- `docs/PERFORMANCE_REPORT.md` — scale and bundle notes  
