# Kynthai US — Master Release Checklist & Sprint Plan
**Lead:** Release Master | **Scope:** US Public Launch | **Status:** 🔴 NOT READY — 18 blockers
**Last Updated:** 2026-07-12 | **Target:** Zero-error US production release

---

## TABLE OF CONTENTS
1. [Current Blockers — All Domains](#1-current-blockers)
2. [UI/UX Domain](#2-uiux-domain)
3. [Security Domain](#3-security-domain)
4. [Legal Domain](#4-legal-domain)
5. [Review Domain (QA/E2E)](#5-review-domain)
6. [Medical AI Domain](#6-medical-ai-domain)
7. [48-Hour Sprint Plan](#7-48-hour-sprint-plan)
8. [Acceptance Criteria Per Domain](#8-acceptance-criteria-per-domain)
9. [Verification Steps & Commands](#9-verification-steps--commands)
10. [Release Gate Check](#10-release-gate-check)
---

## 1. CURRENT BLOCKERS

| # | Blocker | Domain | Severity | Owner |
|---|---------|--------|----------|-------|
| B01 | All 25 Playwright E2E tests fail: ERR_CONNECTION_REFUSED localhost:3000. Dev server runs on 8000, tests hardcode 3000. | Review | BLOCKER | QA Eng |
| B02 | team-agents-us.md referenced in README-US.md:48 does not exist. | Release Mgmt | BLOCKER | Release Master |
| B03 | Placeholder address 100 Disorderly Dr in structured-data.tsx, portal-footer.tsx, pricing-page.tsx, landing-footer.tsx, page.tsx. | Legal/UI | BLOCKER | Legal + UI/UX |
| B04 | HIPAA Privacy Officer email mismatch: HIPAANPP.md uses privacy@kynthai.app; privacy-policy.tsx, terms, cookies, grievance, portal-footer use hello@kynthai.app (non-designated). | Legal | BLOCKER | Legal |
| B05 | HIPAANPP.md exists only as markdown — no navigable page component or /privacy-practices route. NPP acknowledgment references a 404 URL. | Legal/UI | BLOCKER | Legal + UI/UX |
| B06 | HIPAANPP.md has no mailing address for written complaints (requires one under 45 CFR 164.530). Effective date is Jan 1 2026 (future). | Legal | BLOCKER | Legal |
| B07 | PATIENT-RIGHTS.md truncated at 4 of 8+ required rights and has no navigable page route. | Legal/UI | BLOCKER | Legal + UI/UX |
| B08 | No CCPA opt-out link, no VCDPA/CDPA/UCPA/CTDPA state privacy law mentions anywhere in UI. | Legal/UI | BLOCKER | Legal + UI/UX |
| B09 | src/lib/env.ts defaults NEXT_PUBLIC_API_URL to http://localhost:3000. In production this causes all client-side API calls to hit wrong origin. | Security | BLOCKER | Security |
| B10 | .env.production has 12 REPLACE_WITH_* placeholders. App will crash on startup in prod without real values. | Security | BLOCKER | Security/DevOps |
| B11 | encryption-middleware.ts is claimed in HIPAA-COMPLIANCE.md but src/lib/prisma-encryption-middleware.ts does not exist as a separate file (only src/lib/encryption.ts exists). | Security | BLOCKER | Security |
| B12 | HIPAA checklist has 6 unchecked items at bottom (schema migration, data backfill, transitional mode off, backup encryption, access log review, penetration test). | Security | BLOCKER | Security |
| B13 | Account deletion UI button is hidden behind a window.prompt('Type DELETE...') in profile-hub.tsx; primary UI path is unclear. | Legal/UI | HIGH | UI/UX |
| B14 | billing@kynthai.com email on refund page — wrong domain (should be @kynthai.app). | Legal | HIGH | Legal |
| B15 | Future-dated legal docs: HIPAANPP (Jan 1 2026), refund page (June 2026), ToS (June 2026). Not yet legally operative. | Legal | HIGH | Legal |
| B16 | MaxListenersExceededWarning (SIGINT/SIGTERM) in dev.log — possible memory leak in hot-reload cycle. | Review | MEDIUM | Review |
| B17 | e2e/quick-test.mjs and playwright.config.ts both hardcode localhost:3000 while package.json dev script uses port 8000. | Review | MEDIUM | QA Eng |
| B18 | Missing /health API route verification — docker-compose healthcheck depends on it but no explicit confirmation it exists. | Security | MEDIUM | Security |
---

## 2. UI/UX DOMAIN

### 2.A Team: UI/UX Lead

#### FAKE ADDRESS — MUST FIX BEFORE LAUNCH (B03)

| Item | File | Line | Current Value | Required Value |
|------|------|------|---------------|----------------|
| Fake street address | src/components/structured-data.tsx | 13 | 100 Disorderly Dr | Real registered office address |
| Fake street address | src/components/kynthai/portal-footer.tsx | 21 | 100 Disorderly Dr, Wilmington, DE 19801 | Real registered office address |
| Fake street address | src/components/kynthai/pricing-page.tsx | 757 | 100 Disorderly Dr... | Real registered office address |
| Fake street address | src/components/kynthai/landing-footer.tsx | 102 | 100 Disorderly Dr... | Real registered office address |
| Fake street address | src/app/page.tsx | 34 | 100 Disorderly Dr | Real registered office address |

Action: Replace KYNTHHA_REGISTERED_OFFICE in all 5 locations with the real Delaware registered agent address before any production deploy.

#### ACCOUNT DELETION UI (B13)
Current: profile-hub.tsx:159 uses window.prompt('Type DELETE to confirm') — no visual button.
Required: Visible Delete My Account button in Profile - Account Settings with modal confirmation dialog (not prompt), link to privacy policy section on right to erasure, after confirmation redirect to /login with success message.
Owner: UI/UX Lead | Sprint: Hour 0-8

#### MISSING HIPAA NPP PAGE (B05)
Current: legal/HIPAANPP.md is markdown only. No /privacy-practices route.
Required: Create src/app/privacy-practices/page.tsx as Server Component rendering HIPAANPP.md content with LegalLayout wrapper. Link from portal-footer.tsx LEGAL_LINKS array.
Owner: UI/UX Lead + Legal | Sprint: Hour 4-12

#### MISSING PATIENT RIGHTS PAGE (B07)
Current: legal/PATIENT-RIGHTS.md truncated at 4 rights. No route.
Required: Complete PATIENT-RIGHTS.md (add: grievance procedure, advance directives, consent refusal, interpreter services, research participation opt-out). Publish at /patient-rights. Link from portal footer.
Owner: Legal (content) + UI/UX (page) | Sprint: Hour 4-16

#### CCPA / STATE PRIVACY UI (B08)
Current: No CCPA opt-out link, no state privacy mentions.
Required:
  - Add Do Not Sell or Share My Personal Information link in footer and privacy policy (CCPA 1798.120)
  - Add state law subsection in privacy policy: VCDPA (VA), CDPA (CO), UCPA (UT), CTDPA (CT)
  - Add minor consent notice (COPPA 16+) where missing
Owner: UI/UX Lead + Legal | Sprint: Hour 8-20

#### LEGAL FOOTER NAVIGATION AUDIT
Verify all legal pages reachable from portal-footer.tsx LEGAL_LINKS:
  - /privacy          ✅ exists
  - /terms            ✅ exists
  - /cookies          ✅ exists
  - /refund-cancellation ✅ exists
  - /grievance        ✅ exists
  - /medical-disclaimer ✅ exists
  - /privacy-practices ❌ MISSING — create
  - /patient-rights   ❌ MISSING — create

#### A11Y CHECKLIST
  - Skip link present         ✅ layout.tsx:102
  - lang="en" on html       ✅ layout.tsx:97
  - aria-label on legal nav  ✅ portal-footer.tsx:28
  - force-ssr viewport       ✅ layout.tsx:89

---

## 3. SECURITY DOMAIN

### 3.A Team: Security Lead

#### BLOCKER B09: NEXT_PUBLIC_API_URL defaults to localhost:3000
File: src/lib/env.ts:34
Current: NEXT_PUBLIC_API_URL: 'http://localhost:3000'
Fix: Change default to '' (empty string) or derive from NEXT_PUBLIC_APP_URL. Ensure client code uses relative URLs or construct from window.location.origin.
Verification:
  grep -n NEXT_PUBLIC_API_URL src/lib/env.ts
  # Must NOT output localhost:3000 as default

#### BLOCKER B10: Production placeholders
File: .env.production
12 REPLACE_WITH_* values must be filled before first prod deploy.
Critical required vars (from src/lib/env.ts REQUIRED_IN_PROD):
  DATABASE_URL, DIRECT_URL, SESSION_SECRET, ENCRYPTION_KEY,
  ADMIN_EMAILS, CRON_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
  UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, SENTRY_DSN, NEXTAUTH_SECRET
Non-critical but needed for features:
  OPENAI_API_KEY, ANTHROPIC_API_KEY, RESEND_API_KEY, SENDGRID_API_KEY,
  NEXT_PUBLIC_GOOGLE_ANALYTICS, NEXT_PUBLIC_MIXPANEL_TOKEN
NOTE: DATABASE_URL and DIRECT_URL MUST include sslmode=require.
Owner: Security / DevOps | Sprint: Hour 0-4 (pre-production)

#### BLOCKER B11: Missing prisma-encryption-middleware.ts — ✅ RESOLVED
File: HIPAA-COMPLIANCE.md:17 references src/lib/prisma-encryption-middleware.ts
Actual: `src/lib/prisma-encryption-middleware.ts` EXISTS (AES-256-GCM query extension with per-field map).
Current status (tracked in HIPAA-COMPLIANCE.md): the middleware is installed and new ORM writes use `_enc` columns, but existing rows are not yet backfilled and strict mode remains disabled. Completion requires: apply the additive schema migration → run the controlled backfill → verify reads and empty plaintext columns → set `ENCRYPTION_TRANSITIONAL=false`. Until then, transitional fallback remains active; uploads/prescription images are encrypted today.
Owner: Security | Sprint: Hour 0-24

#### BLOCKER B12: HIPAA Production Checklist Items
From HIPAA-COMPLIANCE.md section 10 (all currently unchecked):

| Item | Action | Verification Command |
|------|--------|----------------------|
| Schema migration executed | Run pnpm prisma migrate deploy on prod DB | Check deploy logs for Applied X migrations |
| Existing data backfilled | Run scripts/encrypt-existing-data.ts | Verify _enc columns non-null for existing rows |
| Transitional mode disabled | Set ENCRYPTION_TRANSITIONAL=false after verification | grep ENCRYPTION_TRANSITIONAL .env.production |
| Database backups encrypted | Enable AWS RDS encryption OR disk-level + S3 SSE | AWS console / infra-as-code review |
| Access logs reviewed | Run src/lib/audit-compliance-report.ts | Review PHI exposure report output |
| Penetration test completed | Complete internal/external pentest | Retain signed report in compliance folder |
Owner: Security + DevOps | Sprint: Hour 4-48

#### CSRF TOKEN CONFIGURATION
File: src/lib/csrf.ts
- httpOnly: false (correct — double-submit cookie) ✅
- sameSite: lax (documented exception for WebView; acceptable if noted in audit) ⚠️
- Verify ALL mutating API routes checkCsrf() — spot-check 10 routes
Owner: Security | Sprint: Hour 0-4

#### SESSION SECURITY VERIFICATION
File: src/lib/auth.ts
- httpOnly: true ✅
- secure: production-only ✅
- sameSite: strict ✅
- HMAC-SHA256 token hashing ✅
- Session TTL 30 days, auto-refresh at <=7 days ✅
Owner: Security | Sprint: Hour 0-4

#### SENTRY CONFIGURATION
File: src/lib/sentry.ts
- PHI sanitization: 40+ sensitive keys stripped ✅
- Stack traces capped at 300 chars ✅
- String values capped at 200 chars ✅
- Raw cause objects stripped ✅
CONFLICT: src/lib/env.ts marks SENTRY_DSN as REQUIRED_IN_PROD but src/lib/sentry.ts gracefully handles missing DSN. Make SENTRY_DSN optional in env validation so staging tests don't crash.
Owner: Security | Sprint: Hour 0-2

#### TLS / SSL VERIFICATION
- DATABASE_URL includes sslmode=require (enforced at startup) ✅
- HSTS header: max-age=63072000 in next.config.js vs max-age=31536000 in proxy.ts — ALIGN BOTH to 63072000
- CORS: CORS_ORIGIN=https://kynthai.app,https://www.kynthai.app (no wildcard) ✅
- verify /api/health endpoint exists (docker-compose.yml line 13 healthcheck depends on it)
Owner: Security | Sprint: Hour 0-8

#### RATE LIMITING
- Verify UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set in .env.production
- Without Redis, falls back to in-memory (document as accepted single-instance risk)
- /api/emergency limit = 100/min (high tolerance, correct for emergency SOS) ✅
Owner: Security | Sprint: Hour 0-4

---

## 4. LEGAL DOMAIN

### 4.A Team: Legal Counsel

#### BLOCKER B04: Privacy Officer Email Mismatch
PROBLEM: HIPAANPP.md designates privacy@kynthai.app as the HIPAA Privacy Officer contact. But privacy-policy.tsx, terms, cookies, grievance, and portal-footer.tsx all use hello@kynthai.app for privacy complaints, access requests, and NPP correspondence. Under 45 CFR 164.530, complaints to an un-designated contact do not count toward the 180-day HHS OCR filing window.

AFFECTED FILES AND LINE REFERENCES:
- src/components/kynthai/legal/privacy-policy.tsx: lines 388, 389, 370, 376, 383 — uses hello@kynthai.app for revocation, complaints, access requests
- src/app/terms/page.tsx — uses hello@kynthai.app
- src/app/cookies/page.tsx — uses hello@kynthai.app
- src/components/kynthai/portal-footer.tsx: lines 49, 56 — uses hello@kynthai.app for grievance and support
- src/app/grievance/page.tsx:3 — uses hello@kynthai.app

REQUIRED FIX: Replace ALL privacy-related hello@kynthai.app references with privacy@kynthai.app in the above files. Reserve hello@kynthai.app for general support only.

#### BLOCKER B03 / B06: Placeholder Address + HIPAANPP Issues
- Replace 100 Disorderly Dr with real Delaware registered agent address in:
  src/components/structured-data.tsx, src/components/kynthai/portal-footer.tsx,
  src/components/kynthai/pricing-page.tsx, src/components/kynthai/landing-footer.tsx, src/app/page.tsx
- Add specific mailing address to HIPAANPP.md Complaints section (45 CFR 164.530 requires this)
- Change future-dated Jan 1 2026 effective date to today or past date

#### BLOCKER B05: HIPAA NPP Missing as Web Page
- Create src/app/privacy-practices/page.tsx rendering HIPAANPP.md with LegalLayout wrapper
- Add acknowledgment checkbox in registration flow referencing /privacy-practices
- Add hyperlink from footer: /privacy-practices as HIPAA Notice of Privacy Practices

#### BLOCKER B07: PATIENT-RIGHTS.md Truncated
Current content (28 lines, 4 sections):
1. Nondiscrimination
2. Information About Your Rights
3. Participation in Care Decisions
4. Privacy and Confidentiality

MISSING REQUIRED RIGHTS:
5. Grievance and appeals procedure (with timeline)
6. Advance directives / healthcare proxy recognition
7. Right to refuse treatment / informed consent
8. Interpreter / language access services (Title VI)
9. Research participation opt-out
10. Organ and tissue donation opt-out
11. Mental health parity disclosure
12. Surprise billing protection (No Surprises Act, 45 CFR 149.400-149.680)

ACTION: Expand PATIENT-RIGHTS.md, create /patient-rights route, link from portal footer.

#### BLOCKER B08: CCPA / State Privacy Laws
MISSING UI ELEMENTS:
- Do Not Sell or Share My Personal Information link (CCPA 1798.120 / CPRA) — required in footer and privacy policy
- State privacy subsection in privacy policy: VCDPA (VA), CDPA (CO), UCPA (UT), CTDPA (CT)
- Minors: 16+ age gate + verifiable parental consent flow (COPPA 15 USC 6501-6506)
- Cookie consent with granular opt-out before non-essential cookies load — verify cookie-consent.tsx implementation

#### BLOCKER B14: Wrong Email Domain on Refund Page
File: src/app/refund-cancellation/page.tsx — billing@kynthai.com must change to billing@kynthai.app or billing@privacy.kynthai.app

#### BLOCKER B15: Future-Dated Legal Documents
- legal/HIPAANPP.md: Effective Jan 1 2026 — change to current date
- src/app/refund-cancellation/page.tsx: Last updated June 2026 — update
- privacy-policy.tsx ToS section: June 2026 — update

#### LEGAL PAGES INVENTORY (ALL MUST EXIST AND BE LINKED):
| Page | Route | Status |
|------|-------|--------|
| Privacy Policy | /privacy | ✅ |
| Terms of Service | /terms | ✅ |
| Cookie Policy | /cookies | ✅ |
| Refund & Cancellation | /refund-cancellation | ✅ |
| Grievance | /grievance | ✅ |
| Medical Disclaimer | /medical-disclaimer | ✅ |
| HIPAA NPP | /privacy-practices | ❌ MISSING |
| Patient Rights | /patient-rights | ❌ MISSING |
| Do Not Sell/Share | /ccpa-optout (new) | ❌ MISSING |

#### FDA / MEDICAL DISCLAIMER CHECK
Files to verify have advisory-only language:
- src/components/kynthai/medical-disclaimer.tsx ✅ has disclaimer
- src/app/api/chat/route.ts:15 ✅ SYSTEM_PROMPT says not medical advice
- src/app/api/symptom-analyze/route.ts:139 ✅ disclaimer field
- All landing page AI feature claims have informational only / not medical advice ✅

Ensure NO diagnostic claims appear in marketing copy (FDA 21 CFR 801.109 / 21 CFR 202.1(e)(5)).

---

## 5. REVIEW DOMAIN (QA / E2E)

### 5.A Team: QA Engineering Lead

#### BLOCKER B01 / B17: ALL PLAYWRIGHT TESTS FAIL — Port Mismatch

ROOT CAUSE: The dev server runs on port 8000 (package.json: next dev -p 8000) but both test files target localhost:3000.

AFFECTED FILES:
- e2e/appointment-booking.spec.ts — baseURL controlled by playwright.config.ts
- e2e/quick-test.mjs:9 — hardcodes http://localhost:3000/
- playwright.config.ts:14 — baseURL: 'http://localhost:3000'

FAILURE COUNT: 25/25 tests fail with net::ERR_CONNECTION_REFUSED

REQUIRED FIX (pick ONE approach, be consistent):
Option A (recommended for dev): Change package.json dev script to port 3000
  Change: next dev -p 8000  →  next dev -p 3000

Option B (recommended for prod parity): Change all tests to port 8000
  playwright.config.ts: baseURL = 'http://localhost:8000'
  e2e/quick-test.mjs:9 → http://localhost:8000/

VERIFICATION COMMAND:
  pnpm run dev &
  sleep 5
  pnpm test:e2e -- --grep="Scenario" --reporter=list
  # All 25 tests should pass or have real logic failures, not connection refused

#### TEST INFRASTRUCTURE AUDIT
- playwright.config.ts baseURL must match actual dev server port
- All e2e tests should use requireAuth with a seeded demo user (patient@demo.kynthai.app / Demo@2024)
- Verify /api/health endpoint returns 200 for healthcheck
- Verify test database seed script populates demo accounts

#### BUILD VERIFICATION
- pnpm run build must complete without errors
- pnpm run lint must pass (0 errors)
- pnpm test:ci must pass (unit tests green)

#### DEV.LOG WARNING (B16)
MaxListenersExceededWarning for SIGINT/SIGTERM — investigate hot-reload cycle. Not a prod blocker but fix before staging deploy to avoid instability.

---

## 6. MEDICAL AI DOMAIN

### 6.A Team: Medical AI Lead

#### FDA / AI ADVISORY DISCLAIMER COMPLIANCE
All AI-generated content must carry: This is informational only — not medical advice. Always consult a qualified healthcare professional licensed in your jurisdiction.

FILES TO AUDIT:
| File | Line | Component | Status |
|------|------|-----------|--------|
| src/app/api/chat/route.ts | 15 | SYSTEM_PROMPT | ✅ Not medical advice disclaimer |
| src/app/api/symptom-analyze/route.ts | 110,139 | Symptom analyzer | ✅ Educational only, no diagnosis |
| src/components/kynthai/medical-disclaimer.tsx | 27,42 | Global disclaimer component | ✅ Present |
| src/components/kynthai/phone-mockup.tsx | 232 | Phone mockup label | ✅ Informational only |
| src/components/kynthai/landing-page.tsx | 248,559,575,1045 | Marketing copy | ✅ disclaimers present |
| src/components/kynthai/hero-section.tsx | 85 | Hero tagline | ✅ AI-guided information |
| src/app/api/interactions/route.ts | 129 | Interaction checker | ✅ General note reminder |

REQUIRED ACTIONS:
1. Verify NO page makes diagnostic claims (e.g., This could be X condition — replace with Common causes include...)
2. Ensure every AI API response has a response-level disclaimer when N=first message in session
3. Add AI disclaimer consent checkbox at registration (user acknowledges outputs are not medical advice)

#### AI CONSENT FLOW
- Verify NE AI features require explicit opt-in (GDPR Article 22 style for healthcare AI)
- AI features: medicine ID, symptom analysis, drug interactions, AI chat, prescription scan
- Consent stored in user.consentAccepted / user.dataProcessingConsent / user.aiTrainingConsent

#### ZAI MODEL CONFIGURATION
File: src/lib/zai.ts / src/app/api/chat/route.ts
- Verify ZAI_MODEL is set (default: step-2-16k from src/lib/env.ts:32)
- Verify AI API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY) are set in .env.production
- AI timeout wrappers must exist for all AI routes (src/lib/ai-timeout.ts)

REQUIRED ACTIONS:
1. Add timeout error handling for all AI routes — users should see AI service unavailable, not a raw 500
2. Log AI token usage for cost monitoring (opt-in via user consent)
3. Verify no raw user health data is sent to external AI APIs without user explicit consent

---
---

## 7. 48-HOUR SPRINT PLAN

### Sprint Zero (Hour 0-4) — P0: Unblock Everything

| Task | Owner | Deliverable |
|------|-------|------------|
| B09: Fix NEXT_PUBLIC_API_URL default | Security | git commit removing localhost:3000 default |
| B01/B17: Align E2E tests to port 8000 or change dev to 3000 | QA Eng | git commit + pnpm test:e2e green |
| B10: Identify who will fill .env.production placeholders | DevOps | .env.production filled (dev/staging) |
| B02: Create team-agents-us.md | Release Master | File exists, linked from README-US.md |
| B04: First pass — replace privacy@kynthai.app for all privacy contacts | Legal | Files updated, team review scheduled |

### Sprint One (Hour 4-16) — P1: Legal Content

| Task | Owner | Deliverable |
|------|-------|------------|
| B03: Replace 100 Disorderly Dr with real address in 5 files | Legal + UI/UX | Real address in structured-data, footer, pricing, landing |
| B06: HIPAANPP.md — add mailing address, fix effective date | Legal | Updated HIPAANPP.md |
| B05: Create /privacy-practices page | UI/UX + Legal | LegalPrivacyPractices.tsx + route |
| B07: Complete PATIENT-RIGHTS.md + create /patient-rights | Legal + UI/UX | 8+ rights, route, footer link |
| B08: CCPA opt-out page + footer link + state privacy in policy | Legal + UI/UX | /ccpa-optout + privacy-policy updates |
| B14: billing@kynthai.com → billing@kynthai.app | Legal | refund-cancellation/page.tsx |
| B15: Fix future dates in legal docs | Legal | All dates updated to current |

### Sprint Two (Hour 16-32) — P2: Security Hardening

| Task | Owner | Deliverable |
|------|-------|------------|
| B11: Create/Audit prisma-encryption-middleware.ts | Security | Middleware exists OR HIPAA doc updated |
| B12: Run production migration + backfill | Security + DevOps | Encryption migration applied to staging |
| Transitional mode test on staging | Security | ENCRYPTION_TRANSITIONAL=false verified |
| Backup encryption test | DevOps | Encrypted backup restored successfully |
| Audit compliance report run | Security | Report reviewed, no PHI exposure |
| HSTS header align (next.config.js vs proxy.ts) | Security | Both set to max-age=63072000 |
| SENTRY_DSN optional or filled | Security | No crash on missing DSN in staging |

### Sprint Three (Hour 32-48) — P3: Final Verification

| Task | Owner | Deliverable |
|------|-------|------------|
| Full E2E suite green on staging | QA Eng | 25/25 passing |
| Pentest completed | Security | Signed report |
| Data export UI verified | UI/UX | /api/user/data-export returns full JSON, downloadable |
| Account deletion UI verified | UI/UX | Profile → Delete Account with modal (not prompt) |
| AI disclaimer consent at registration | Medical AI | Checkbox present, stored in DB |
| All email addresses audited for domain consistency | Legal | zero @kynthai.com references remain |
| team-agents-us.md finalized | Release Master | Complete agent roster |
| Final release gate check | Release Master | All ✓ in Section 10 |

---
---

## 8. ACCEPTANCE CRITERIA PER DOMAIN

### UI/UX — GO criteria (NO EXCEPTIONS)

- [ ] **AC-UI-01:** Zero occurrences of 100 Disorderly Dr in src/ and public/ files (grep confirms)
- [ ] **AC-UI-02:** All 8 legal pages linked from portal-footer.tsx LEGAL_LINKS (including /privacy-practices and /patient-rights)
- [ ] **AC-UI-03:** Profile → Delete Account is a visible button, not hidden behind window.prompt
- [ ] **AC-UI-04:** CCPA Do Not Sell or Share My Personal Information link present in footer and privacy policy
- [ ] **AC-UI-05:** State privacy subsection (VCDPA, CDPA, UCPA, CTDPA) present in privacy policy
- [ ] **AC-UI-06:** All legal docs show current date (not future)
- [ ] **AC-UI-07:** Skip link, lang attribute, and aria-labels verified in layout.tsx
- [ ] **AC-UI-08:** Mobile responsive test passes at 375px, 768px, 1024px breakpoints

### SECURITY — GO criteria (NO EXCEPTIONS)

- [ ] **AC-SEC-01:** grep src/lib/env.ts confirms NEXT_PUBLIC_API_URL default is NOT localhost:3000
- [ ] **AC-SEC-02:** .env.production has ZERO REPLACE_WITH_* placeholders
- [ ] **AC-SEC-03:** DATABASE_URL and DIRECT_URL both include sslmode=require
- [ ] **AC-SEC-04:** ENCRYPTION_KEY is 64 hex chars, ENCRYPTION_TRANSITIONAL=false
- [ ] **AC-SEC-05:** All _enc columns in prisma/schema.prisma match HIPAA-COMPLIANCE.md 1.A field list
- [ ] **AC-SEC-06:** Prisma encryption middleware is active on all reads/writes (verify in code review)
- [ ] **AC-SEC-07:** All mutating API routes call checkCsrf() (spot-check 10, document full list)
- [ ] **AC-SEC-08:** Session cookies: httpOnly=true, secure=true (prod), sameSite=strict
- [ ] **AC-SEC-09:** Rate limiting active on all /api/* routes (Redis in prod acceptable)
- [ ] **AC-SEC-10:** HSTS header value consistent across next.config.js and proxy.ts (max-age=63072000)
- [ ] **AC-SEC-11:** SENTRY_DSN either set OR env validation makes it optional
- [ ] **AC-SEC-12:** HIPAA checklist section 10: all 6 previously-unchecked items now checked
- [ ] **AC-SEC-13:** Backup encryption verified (encrypted at rest + in transit)
- [ ] **AC-SEC-14:** /api/health endpoint returns 200 and is used by docker-compose healthcheck

### LEGAL — GO criteria (NO EXCEPTIONS)

- [ ] **AC-LGL-01:** All privacy-related contact emails use privacy@kynthai.app (not hello@kynthai.app)
- [ ] **AC-LGL-02:** All support/non-privacy emails use hello@kynthai.app or support@kynthai.app (no @gmail/@yahoo)
- [ ] **AC-LGL-03:** Zero occurrences of 100 Disorderly Dr in any user-facing file
- [ ] **AC-LGL-04:** /privacy-practices route exists and renders HIPAANPP.md content
- [ ] **AC-LGL-05:** /patient-rights route exists with 8+ rights sections
- [ ] **AC-LGL-06:** /ccpa-optout route exists (CCPA/CPRA do not sell/share)
- [ ] **AC-LGL-07:** HIPAANPP.md has valid mailing address and past effective date
- [ ] **AC-LGL-08:** All legal docs show current effective dates (not future)
- [ ] **AC-LGL-09:** billing@kynthai.com on refund page changed to billing@kynthai.app
- [ ] **AC-LGL-10:** No diagnostic language in marketing copy (no This is X condition / You have Y)
- [ ] **AC-LGL-11:** Medical disclaimer present on every page with AI interaction
- [ ] **AC-LGL-12:** FDA advisory compliance: no treatment/prescription/diagnosis claims
- [ ] **AC-LGL-13:** No Surprises Act disclosure present for lab/doctor booking flows
- [ ] **AC-LGL-14:** Grievance resolution timeline stated in patient rights (<=30 days or regulatory standard)

### REVIEW (QA/E2E) — GO criteria (NO EXCEPTIONS)

- [ ] **AC-REV-01:** All 25 Playwright E2E tests pass: pnpm test:e2e returns exit 0
- [ ] **AC-REV-02:** pnpm run build completes without errors
- [ ] **AC-REV-03:** pnpm run lint returns 0 errors
- [ ] **AC-REV-04:** pnpm test:ci returns all green
- [ ] **AC-REV-05:** Dev server starts on configured port without MaxListenersExceededWarning recurring
- [ ] **AC-REV-06:** Staging deploy completes and / loads in <3s on 3G simulation
- [ ] **AC-REV-07:** No ERR_CONNECTION_REFUSED or 5xx errors in staging logs after 30-minute soak
- [ ] **AC-REV-08:** Web app manifest.json loads and PWA install prompt fires on mobile Chrome

### MEDICAL AI — GO criteria (NO EXCEPTIONS)

- [ ] **AC-AI-01:** Every AI API route has a disclaimer returned in response headers or body
- [ ] **AC-AI-02:** Chat SYSTEM_PROMPT contains not medical advice / advisory only language
- [ ] **AC-AI-03:** Symptom analyzer uses educational language only (never could be X condition)
- [ ] **AC-AI-04:** Drug interaction checker includes educational disclaimer per response
- [ ] **AC-AI-05:** AI consent checkbox present at registration, stored in DB
- [ ] **AC-AI-06:** AI features are disabled when user withdraws consent
- [ ] **AC-AI-07:** All AI timeouts handled gracefully (no raw 500, no crash)
- [ ] **AC-AI-08:** No raw user health data leaked to external AI API (opt-in required)
- [ ] **AC-AI-09:** AI token usage logged for cost monitoring (opt-in)
- [ ] **AC-AI-10:** prescription-scan route handles image uploads safely (5MB cap, allowlisted types)

---
---

## 9. VERIFICATION STEPS & COMMANDS

### Pre-Deploy Verification (run in order)

```bash
# 1. Environment check
pnpm install --frozen-lockfile
# Verify no REPLACE_WITH or localhost:3000 in source
grep -rn 'REPLACE_WITH' src/ .env.production || true
# Should show NO results in src/

# 2. Build verification
pnpm run build
# Must exit 0

# 3. Lint verification
pnpm run lint
# Must exit 0

# 4. Unit test verification
pnpm test:ci
# Must exit 0

# 5. E2E verification (ensure server on same port as tests)
pnpm run dev &  # port 8000 OR change tests to 3000
sleep 10
pnpm test:e2e
# Must exit 0 (all 25 tests pass)

# 6. HIPAA encryption verification
# Verify _enc columns exist and transitional mode off
grep -r '_enc' prisma/schema.prisma | wc -l  # Should be > 40
grep 'ENCRYPTION_TRANSITIONAL' .env.production   # Should be false or absent

# 7. Address placeholder verification
grep -rn '100 Disorderly' src/ public/ || echo 'CLEAN — no fake addresses'

# 8. Email domain verification
grep -rn '@kynthai.com\|@gmail\|@yahoo' src/ legal/ || echo 'CLEAN — no wrong domains'

# 9. Privacy officer email verification
grep -rn 'hello@kynthai.app' src/components/kynthai/legal/ src/app/grievance/
# Should ONLY appear for non-privacy support queries

# 10. Sentry / error tracking config
node -e "console.log('SENTRY_DSN set:', !!process.env.SENTRY_DSN)"
# Must be true OR env validation must NOT require it

# 11. CORS / security headers (use curl against running server)
curl -I http://localhost:8000/
# Must include: X-Frame-Options: DENY, Strict-Transport-Security, X-Content-Type-Options: nosniff
curl -I http://localhost:8000/api/health
# Must include Cache-Control: no-store

# 12. Database connection SSL
node -e "console.log('SSL mode:', process.env.DATABASE_URL?.includes('sslmode='))
# Must be true
```

### Staging Verification Checklist

- [ ] Deploy to staging environment with production .env.production values (seeded secrets)
- [ ] Verify /api/health returns 200 within 10s of deploy
- [ ] Run pnpm test:e2e against staging URL (not localhost)
- [ ] Verify Sentry is receiving events (check Sentry dashboard for staging project)
- [ ] Verify rate limiting is active (send 101 requests to /api/auth/me in 60s — expect 429 on 101st)
- [ ] Verify CSRF protection (POST without X-CSRF-Token returns 403)
- [ ] Verify session cookie flags in browser devtools: HttpOnly, Secure, SameSite=Strict
- [ ] Verify HSTS header in browser devtools Network tab
- [ ] Verify AI disclaimer visible in chat UI before first message
- [ ] Verify account deletion flow end-to-end on staging test user
- [ ] Verify data-export endpoint returns valid JSON with all user data
- [ ] Verify CCPA opt-out page accessible from footer and returns 200

---
---

## 10. RELEASE GATE CHECK

### Sign-Off Required From (ALL MUST APPROVE before ship):

| Role | Name | Signature | Date | GO / NO-GO |
|------|------|-----------|------|------------|
| Release Master | ___________ | __________ | _____ | __________ |
| UI/UX Lead | ___________ | __________ | _____ | __________ |
| Security Lead | ___________ | __________ | _____ | __________ |
| Legal Counsel | ___________ | __________ | _____ | __________ |
| QA Lead | ___________ | __________ | _____ | __________ |
| Medical AI Lead | ___________ | __________ | _____ | __________ |

### Go/No-Go Criteria (ALL must be YES):

| # | Question | Yes / No |
|---|----------|----------|
| 1 | Do all 25 E2E tests pass on staging? | ____ |
| 2 | Is build green, lint clean, unit tests passing? | ____ |
| 3 | Are all .env.production placeholders filled? | ____ |
| 4 | Is the fake address (100 Disorderly Dr) removed from all files? | ____ |
| 5 | Do all privacy complaints route to privacy@kynthai.app? | ____ |
| 6 | Does /privacy-practices render the HIPAA NPP? | ____ |
| 7 | Does /patient-rights have 8+ rights sections? | ____ |
| 8 | Is CCPA do-not-sell link present in footer? | ____ |
| 9 | Is ENCRYPTION_TRANSITIONAL=false in .env.production? | ____ |
| 10 | Are database backups encrypted at rest? | ____ |
| 11 | Has penetration test been completed? | ____ |
| 12 | Is account deletion accessible via UI (not prompt)? | ____ |
| 13 | Does every AI response carry an advisory disclaimer? | ____ |
| 14 | Is AI consent required before first AI feature use? | ____ |
| 15 | Are all legal docs dated to current/past dates? | ____ |
| 16 | Is NEXT_PUBLIC_API_URL default NOT localhost:3000? | ____ |
| 17 | Is DATABASE_URL sslmode=require confirmed? | ____ |
| 18 | Is billing email on refund page billing@kynthai.app? | ____ |

If ANY answer is NO: RELEASE IS BLOCKED. Return to Sprint Plan, Section 7.
If ALL answers are YES: RELEASE IS CLEARED. Proceed to production deploy.

---

## APPENDIX: DOMAIN CONTACT CARD

| Domain | Lead | Escalation | Status |
|--------|------|------------|--------|
| UI/UX | UI/UX Lead | Release Master | Pending |
| Security | Security Lead | Release Master | Pending |
| Legal | Legal Counsel | Release Master | Pending |
| Review | QA Engineering Lead | Release Master | Pending |
| Medical AI | Medical AI Lead | Release Master | Pending |

---

*This document is the single source of truth for Kynthai US launch readiness.
No external override supersedes the Release Gate Check (Section 10).*
