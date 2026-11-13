# Kynthai QA Test Plan

Automated and manual test catalog for local / ephemeral Postgres runs. **Never execute against production data or live payment capture.**

## Conventions

| Field | Meaning |
| --- | --- |
| **Priority** | `CRITICAL` · `HIGH` · `MEDIUM` · `LOW` |
| **Layer** | `E2E` (Playwright) · `API` (Vitest / probe) · `INT` (integration) |
| **Status** | Filled in `docs/QA_RESULTS.md` after each regression run |

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` / `DIRECT_URL` | Local Postgres (e.g. `kynthai_test`) |
| `ENCRYPTION_KEY` | 64 hex chars — required for PHI encryption tests |
| `SESSION_SIGNING_SECRET` | Local `kynthai-session` cookie signing |
| `ENABLE_DEMO=true` | Ensures demo bcrypt users on register/seed |
| `NEXT_PUBLIC_ENABLE_DEMO=false` | **Required for RBAC tests** — `true` bypasses auth on portal pages in dev |
| `CRON_SECRET` | Bearer for `/api/system/email-capture` in QA |
| `QA_LOCAL_DB=1` | Playwright `webServer` uses `npm run dev:qa` |

**Regression command:** `npm run test:qa` (see `scripts/qa-regression.sh`).

---

## 1. Authentication & session

| ID | Pri | Layer | Steps | Expected |
| --- | --- | --- | --- | --- |
| QA-AUTH-001 | CRITICAL | E2E | Register with valid payload + CSRF | `200/201` or explicit `503 PROVIDER_UNAVAILABLE` when Supabase unreachable; never `500` |
| QA-AUTH-002 | CRITICAL | E2E | Login demo patient `patient@demo.kynthai.app` / `Demo@2024` | `200`, `/api/auth/me` authenticated |
| QA-AUTH-003 | CRITICAL | E2E | Logout POST with session | Session cleared; `/api/auth/me` → `authenticated: false` |
| QA-AUTH-004 | HIGH | E2E | Forgot password → read token via `/api/system/email-capture` → reset → login | New password works; mock-email exposes token (local bcrypt users) |
| QA-AUTH-005 | HIGH | E2E | Reset-password without token / CSRF | `401` or `403`; no password change |
| QA-AUTH-006 | CRITICAL | E2E | Tampered `kynthai-session` cookie | `/api/auth/me` never returns a user (`scenarios-matrix S6`) |
| QA-AUTH-007 | HIGH | E2E | Session expiry / revoked admin (`S7`) | Non-admin `403` on `/api/admin/blocked` |
| QA-AUTH-008 | MEDIUM | API | `GET /api/auth/csrf` | Returns token + sets cookie |
| QA-AUTH-009 | HIGH | API | OAuth routes without provider | Graceful `503` / redirect, no stack trace |

---

## 2. Roles & IDOR

| ID | Pri | Layer | Steps | Expected |
| --- | --- | --- | --- | --- |
| QA-RBAC-001 | CRITICAL | E2E | Patient session → `/admin` | Redirect `/login` or portal guard deny |
| QA-RBAC-002 | CRITICAL | E2E | Doctor cannot read patient meds via `?userId=` (`S4`) | `400` or `403`; empty items |
| QA-RBAC-003 | HIGH | E2E | Lab portal APIs as patient | `403` on lab-dashboard write paths |
| QA-RBAC-004 | HIGH | E2E | Admin demo → `/api/admin/blocked` | Not `401` |
| QA-RBAC-005 | HIGH | API | Edge `portalRoleAllowed` unit tests | Patient blocked from `/admin` cookie role |

Demo accounts: `e2e/helpers.ts` (`patient`, `doctor`, `lab`, `caretaker`, `admin`).

---

## 3. Navigation (35 pages)

| ID | Pri | Layer | Steps | Expected |
| --- | --- | --- | --- | --- |
| QA-NAV-D-* | HIGH | E2E | GET each route desktop (`e2e/qa-routes-navigation.spec.ts`) | Public `200`; portals `307→/login` or `200` with session |
| QA-NAV-M-* | HIGH | E2E | Same subset at 390×844 | Body non-empty; no `5xx` |
| QA-NAV-LEGAL | MEDIUM | E2E | `/privacy`, `/terms`, `/ccpa`, `/cookies` | `200`, canonical content |
| QA-NAV-FAMILY | MEDIUM | E2E | `/family/members/{id}` with valid member id | `200` when authenticated; `307` when not |

**Page inventory:** `/`, `/about`, `/accessibility`, `/admin`, `/admin-login`, `/caretaker`, `/ccpa`, `/checkout`, `/contact`, `/cookies`, `/dashboard`, `/doctor`, `/download`, `/family`, `/faq`, `/features`, `/feedback`, `/forgot-password`, `/grievance`, `/invite`, `/lab`, `/legal`, `/login`, `/medical-disclaimer`, `/patient`, `/patient-rights`, `/pricing`, `/privacy`, `/privacy-practices`, `/refund-cancellation`, `/register`, `/reset-password`, `/settings`, `/terms`, plus dynamic `/family/members/[id]`.

---

## 4. API routes (~155 handlers)

| ID | Pri | Layer | Steps | Expected |
| --- | --- | --- | --- | --- |
| QA-API-001 | CRITICAL | API | `api-edge-auth.test.ts` — route count ≥ 155 | Catalog matches filesystem |
| QA-API-002 | CRITICAL | API | Unauthenticated GET on default-deny routes | `401`/`403`/`405`, not `200` with PHI (`scripts/qa-api-routes.mjs`) |
| QA-API-003 | HIGH | API | Public allowlist (`/api/health`, `/api/auth/login`, webhooks) | Not blocked at edge |
| QA-API-004 | HIGH | API | CSRF on state-changing POST without token | `403` |
| QA-API-005 | MEDIUM | API | Malformed JSON (`S8`) | `400`/`422`, never `5xx` |
| QA-API-006 | HIGH | API | Rate limit (`S9`) | `429` after burst on local runner |
| QA-API-007 | MEDIUM | INT | Each domain route happy path with demo session | Documented per-route in `full-flows.spec.ts` (manual gate extension) |

Full path list: see `src/app/api/**/route.ts` (155 modules). System paths (webhooks, cron) are CSRF-exempt per `api-edge-auth.ts`.

---

## 5. Database & encryption

| ID | Pri | Layer | Steps | Expected |
| --- | --- | --- | --- | --- |
| QA-DB-001 | CRITICAL | API | `prisma-encryption-write.test.ts` | Ciphertext written; plaintext column null |
| QA-DB-002 | HIGH | API | `qa-password-reset-local.test.ts` | Reset token stored encrypted + searchable hash |
| QA-DB-003 | HIGH | E2E | Create medication → reload list | Persists across requests |
| QA-DB-004 | CRITICAL | API | Missing `DATABASE_URL` | Structured `503`, not throw (`db-config.test.ts`) |
| QA-DB-005 | MEDIUM | API | `ensure-database.test.ts` | Handlers return 503 JSON when DB absent |

---

## 6. File uploads & ClamAV

| ID | Pri | Layer | Steps | Expected |
| --- | --- | --- | --- | --- |
| QA-UP-001 | HIGH | API | `documents-upload-scan.test.ts` | Scan hook invoked; reject when infected (mock) |
| QA-UP-002 | HIGH | API | Upload over size limit | `413` / validation error |
| QA-UP-003 | HIGH | API | Disallowed MIME | `400` |
| QA-UP-004 | MEDIUM | E2E | Authenticated upload happy path | File listed in `/api/documents/list` |

When ClamAV daemon absent, tests use mock scan path (`antivirus.test.ts`).

---

## 7. Notifications (mocked)

| ID | Pri | Layer | Steps | Expected |
| --- | --- | --- | --- | --- |
| QA-NOTIF-001 | HIGH | API | `push-payload-privacy.test.ts` | No PHI in push payload |
| QA-NOTIF-002 | MEDIUM | API | `demo-notifications.test.ts` | Deduped demo notifications |
| QA-NOTIF-003 | MEDIUM | API | Email via `sendEmailReal` without SendGrid | `provider: mock-email` |
| QA-NOTIF-004 | LOW | E2E | In-app notifications fetch with session | `200` + array shape |

---

## 8. Payments (Stripe)

| ID | Pri | Layer | Steps | Expected |
| --- | --- | --- | --- | --- |
| QA-PAY-001 | HIGH | E2E | `POST /api/stripe/webhook` no signature | `503` not configured **or** `400` missing signature |
| QA-PAY-002 | HIGH | E2E | Webhook with invalid signature | `400` (when keys present) |
| QA-PAY-003 | HIGH | E2E | `POST /api/payments` unauthenticated | `401`/`403` |
| QA-PAY-004 | HIGH | — | **NOT TESTED** | Full PaymentIntent / Checkout — blocked: no Stripe keys |
| QA-PAY-005 | HIGH | — | **NOT TESTED** | Subscription lifecycle — blocked: no Stripe keys |
| QA-PAY-006 | MEDIUM | API | Mock payments in dev | `mock_secret_*` when `STRIPE_SECRET_KEY` unset |

---

## 9. Error handling & resilience

| ID | Pri | Layer | Steps | Expected |
| --- | --- | --- | --- | --- |
| QA-ERR-001 | HIGH | E2E | Third-party CDN blocked (`S10`) | Core hero text still visible |
| QA-ERR-002 | HIGH | E2E | `ui-ux-sweep` public pages | No critical console errors |
| QA-ERR-003 | MEDIUM | API | AI routes without OpenAI key | Graceful degradation / `503`, not unhandled rejection |
| QA-ERR-004 | HIGH | PROBE | `security-probe.mjs` | No stack traces in API JSON errors |

---

## 10. Concurrency & abuse

| ID | Pri | Layer | Steps | Expected |
| --- | --- | --- | --- | --- |
| QA-CONC-001 | HIGH | API | Double-submit same POST (duplicate idempotency keys where implemented) | Single persisted row |
| QA-CONC-002 | MEDIUM | API | Parallel PATCH on same resource | Last-write wins without `500` |
| QA-CONC-003 | HIGH | E2E | Login brute force (`S9` / lockout) | `429` / `423` after threshold |
| QA-CONC-004 | MEDIUM | API | `rate-limit-distributed.test.ts` | Upstash fallback behavior |

---

## 11. Forms & primary actions

| ID | Pri | Layer | Steps | Expected |
| --- | --- | --- | --- | --- |
| QA-FORM-001 | HIGH | E2E | Login empty submit | Validation toast / `422` |
| QA-FORM-002 | HIGH | E2E | Register weak password | `400 WEAK_PASSWORD` |
| QA-FORM-003 | MEDIUM | E2E | Feedback form POST | `200` without auth |
| QA-FORM-004 | HIGH | E2E | Patient portal primary tabs load | Care, Meds, Journal visible after login (`patient.spec.ts`) |
| QA-FORM-005 | MEDIUM | E2E | Doctor prescribe flow | Guard rails when AI offline |

Extended coverage: `full-flows.spec.ts`, `appointment-booking.spec.ts`, `kynthai-comprehensive.spec.ts` (run locally; not all are CI-gated).

---

## Traceability

| Suite file | Covers |
| --- | --- |
| `e2e/ci-smoke.spec.ts` | Public/protected routes, health |
| `e2e/auth.spec.ts` | QA-AUTH-001/002 UI |
| `e2e/scenarios-matrix.spec.ts` | S1–S10 security matrix |
| `e2e/qa-auth-recovery.spec.ts` | QA-AUTH-004 |
| `e2e/qa-stripe.spec.ts` | QA-PAY-001–003 |
| `e2e/qa-routes-navigation.spec.ts` | QA-NAV-* |
| `src/lib/__tests__/api-edge-auth.test.ts` | QA-API-001/003 |
| `scripts/qa-api-routes.mjs` | QA-API-002 |
| Vitest `src/lib/__tests__/*` | Encryption, uploads, rate limits, notifications |

---

## Out of scope (this plan)

- Production canary (`ci.yml` `e2e-smoke` against `kynthai.app`) — read-only subset only.
- Vercel deploy / DNS / real SendGrid / Twilio / Firebase delivery.
- Stripe capture with live keys (explicit **NOT TESTED** above).
