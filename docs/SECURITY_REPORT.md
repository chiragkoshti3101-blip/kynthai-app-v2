# Kynthai — Security Report (Initial)

**Phase:** 1 — discover and plan. **No penetration test** was performed. Findings are from static review, dependency audit, and limited dynamic probes on a dev server **without production secrets or database**.

**Disclaimer:** This report describes technical security posture for a US consumer health application. It does **not** determine HIPAA, state privacy law, or medical-device regulatory status.

---

## 1. Threat model (summary)

| Asset | Primary risks |
|-------|----------------|
| Medication / journal / lab / chat PHI | IDOR, excessive logging, weak encryption rollout, AI subprocessors |
| Doctor–patient records | Portal bypass, treatment-relationship gaps, lab share tokens |
| Payments | Webhook forgery (mitigated), mock provider in non-prod |
| Accounts | Credential stuffing (rate limits), demo/seed endpoints, session forgery |
| Admin | Email allowlist + role; demo admin blocked on Vercel production |

**Adversaries considered:** unauthenticated internet client, authenticated peer user (IDOR), leaked `CRON_SECRET` / bootstrap token, malicious file upload, XSS (CSP mitigations).

---

## 2. Controls observed (strengths)

| Control | Location | Notes |
|---------|----------|-------|
| Edge middleware | `src/middleware.ts` | CSRF (double-submit), CSP/HSTS (when TLS), rate limits (in-memory), sensitive query redaction in audit, Supabase JWT signature verification, `kynthai-session` HMAC |
| Handler auth | `src/lib/api-helpers.ts` | `requireAuth`, `requireAdmin`, `requireSystemToken` (prod fail-closed without `CRON_SECRET`), consent checks |
| Session cookies | Login routes, middleware | `httpOnly`, `sameSite: 'strict'`, `secure` when HTTPS |
| Stripe webhook | `api/stripe/webhook/route.ts` | Signature verification via `constructEvent` |
| Field encryption | `prisma-encryption-middleware.ts` | Broad model coverage; writes clear plaintext when encrypting |
| AI chat guardrails | `ai-guard.ts`, `ai-output-filter.ts`, `phi-filter.ts` | Scope guard, identifier redaction, NSAID/anticoagulant append |
| Production kills | `api/migrate`, `api/debug`, `api/auth/demo-login` | 404 in `NODE_ENV=production` |
| Document ACL | `canAccessDocument` in `src/lib/auth.ts` | Owner + doctor treatment relationship |
| Secret scanning | `.github/workflows/secret-scan.yml`, `.gitleaks.toml` | CI hygiene |
| CORS prod fail-closed | `api-helpers.ts` | Rejects if `CORS_ORIGIN` unset in production |

---

## 3. Findings by category

### 3.1 Authentication & session

| Risk | Severity | Detail |
|------|----------|--------|
| Dual auth stacks | Low | Supabase + HMAC cookie + unused NextAuth config (`auth.config.ts`) — maintenance hazard |
| Session signing fallback | Medium | `SESSION_SIGNING_SECRET` may fall back to `SUPABASE_SERVICE_ROLE_KEY` (`session-signing.ts`) |
| Portal role at edge | High | Session presence only; HTML for `/admin` loadable with wrong role (`middleware.ts` comments) |
| Demo accounts in prod DB | High | `seed-demo` can reset `Demo@2024` for well-known emails if `CRON_SECRET` compromised |

**IDOR (confirmed):**

- `GET /api/medications/[id]` — skips ownership when `med.userId` is falsy (`medications/[id]/route.ts:31-47`). POST always sets `userId`, so risk is **legacy rows** or bad data.

**Positive IDOR checks (sample):** family `members/[id]` `assertMemberOwned`, documents `canAccessDocument`, lab results patient/lab gates, appointments PATCH, prescriptions GET (treatment link), chat scoped to `userId`, refunds, payouts.

### 3.2 Authorization & admin

| Risk | Severity | Detail |
|------|----------|--------|
| Middleware prefix list incomplete | High | Many routes rely on handler-only `requireAuth` |
| `bootstrap-schema` | High (if weak token) | Bearer-only DDL (`admin/bootstrap-schema/route.ts`) |
| Demo admin | Mitigated | `isDemoAdminBlockedInProduction` for Vercel production |

### 3.3 Data protection & privacy (technical)

| Risk | Severity | Detail |
|------|----------|--------|
| Plaintext + `_enc` dual columns | Critical | Transitional read of plaintext when `_enc` empty |
| `User.email` plaintext | Expected | Login index — document in privacy notice |
| Unencrypted fields | Medium | Delivery address, document titles, video notes, templates JSON, etc. |
| Account erasure gaps | High | `MedicalDocument`, storage blobs, push subs, consult messages, etc. |
| Push `data` drug names | High | Notification privacy on device |
| Audit `details` titles | Medium | e.g. `Uploaded ${type}: ${title}` |
| Health report to LLM | High | Name, age, chat content in third-party prompt |

**Encryption algorithm:** AES-256-GCM, per-file scrypt-derived keys for blobs. See engineering audit for field inventory.

### 3.4 AI & medical safety (not legal advice)

| Route | Auth | PHI to vendor | Output controls |
|-------|------|---------------|-----------------|
| `/api/chat` | Yes + consent | De-identified context; full med list | Guards + filters |
| `/api/health-report` | Yes | **Identifiable bundle** | None observed |
| `/api/symptom-analyze` | Yes | Symptoms + allergies | Prompt-only disclaimer |
| `/api/interactions` | Yes | Meds + allergies | None |
| `/api/prescription-*` | Yes | Images/text + meds | Limited |
| Medicine DB fast path | N/A | Local DB | Static disclaimers |

**Capabilities:** Models can name drugs and doses by design (product requirement). Doctor chat mode suppresses patient-facing disclaimers in system prompt (`chat/route.ts` / `chat-system-prompt.ts`).

**Providers wired:** NVIDIA NIM, OpenAI, Cline (Gemini). Zenmux/Anthropic env vars **not used** in code.

**Missing keys:** Most routes return unavailable/null — **not** fabricated clinical text (except static medicine DB).

### 3.5 Input validation, XSS, injection

| Area | Posture |
|------|---------|
| API input | Widespread Zod schemas under `src/lib/schemas/` |
| SQL | Prisma parameterized queries; raw SQL limited to migrate/admin tooling |
| XSS | React default escaping; `react-markdown` in AI chat — review link/open allowlist if enabled |
| `dangerouslySetInnerHTML` | JSON-LD (`structured-data.tsx`), boot styles (`layout.tsx`), charts — static/trusted content |
| File upload | Magic-byte checks; AV on `/api/upload` only |
| CSRF | Enforced on mutating API except documented system/public paths |

### 3.6 Network & infrastructure

| Area | Posture |
|------|---------|
| CORS | Allow-list in production |
| CSP | Strict in prod middleware; `unsafe-inline` for Next.js |
| Rate limit | Per-IP in-memory at edge; Upstash optional with fallback |
| Dependencies | npm audit: 1 high (`fast-uri`), 13 moderate (see engineering audit) |
| RLS | Supabase RLS scripts exist; app path uses Prisma + service role storage — **app-layer ACL is primary** |

### 3.7 Secrets & supply chain

- Tracked templates: `.env.example` only (no live secrets observed in grep).
- CI: dependency audit gate, SBOM generation, Gitleaks workflow.
- **Lockfile drift** breaks reproducible `npm ci` (supply-chain hygiene issue).

---

## 4. Dynamic probe summary (dev, no DB)

| Endpoint | Result |
|----------|--------|
| `/api/health` | 503 degraded (expected without DB) |
| `/api/debug` | 200 in dev (404 in production by code) |
| `/api/doctors` | 500 when `DATABASE_URL` unset |
| `/api/auth/me` | 200 unauthenticated |
| `/api/system/seed-demo` | 403 without bearer |
| `/patient` | 307 → login |

---

## 5. Recommendations (priority)

1. **Ship KYN-CRIT-001/002** — restore build and document decryption.  
2. **Close IDOR KYN-HIGH-001** and extend middleware default-deny.  
3. **Align AI routes** with chat PHI policy (health-report first).  
4. **Complete erasure** and encryption backfill/strict mode.  
5. **Harden cron/bootstrap** endpoints; remove password from seed response.  
6. **Add API integration tests** for authZ on top 20 PHI routes.  
7. **Operational:** Upstash in production + alerting on rate-limit fallback.

---

## 6. Positive compliance-oriented signals (non-exhaustive)

- COPPA-style **parental consent** fields on minor family members (`family/members/route.ts`).  
- Privacy policy mentions children under 16 (`privacy-policy.tsx`) — align with API thresholds (issue KYN-MED-018).  
- Data export endpoint exists (`user/data-export`).  
- Legal markdown under `legal/` and extensive policy pages in app.

Further legal/compliance review is outside this technical report.
