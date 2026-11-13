# Kynthai UI Design Audit

**Branch:** `cursor/ui-audit-fixes-90ec` | **PR:** #82  
**Last updated:** 2026-11-13 (rebased on `main` post #78–#80)

---

## Design acceptance criteria

| ID | Criterion | Pass condition |
|----|-----------|----------------|
| **C-01** | WCAG 2.1 AA contrast | No axe serious/critical `color-contrast` on audited routes |
| **C-02** | Visible focus states | `:focus-visible` ring on interactive controls |
| **C-03** | Keyboard navigation | Logical tab order; skip link; nav buttons `type="button"` |
| **C-04** | Labelled form fields + inline errors | Labels / `aria-*`; validation wired |
| **C-05** | Tap targets ≥44px | Primary controls `min-h-11` / Button sizes |
| **C-06** | No horizontal scroll | `scrollWidth ≤ clientWidth` at **375 / 768 / 1280** |
| **C-07–C-10** | Tokens, type, spacing, buttons | `primary` tokens + shared `Button` / `marketing-ui` |
| **C-11** | Loading / empty / error | Seeded portal data shows real content; empty copy where applicable |
| **C-12** | Modals | Radix `Dialog`: trap, Esc, 44px close |

**Tooling:** `e2e/ui-design-audit.spec.ts` (public), `e2e/ui-portal-audit.spec.ts` (authenticated), `e2e/local-ui-audit-db.sh`, `viewport-probe.mjs`.

**Local Postgres:** `e2e/local-ui-audit-db.sh` after `.env.local` includes `DATABASE_URL`, `SESSION_SECRET`, `SESSION_SIGNING_SECRET`, `ENCRYPTION_KEY`. Demo logins: `prisma/seed.js` (`Demo@2024`).

---

## Public routes (23 × 3 breakpoints)

| Check | Result |
|-------|--------|
| Horizontal overflow | **Pass** (Playwright + probe) |
| Axe @1280 serious/critical | **0** (after marketing token fixes) |

### Marketing fixes (prior pass)

- `marketing-ui.tsx` — shared CTAs (`primary` contrast vs `emerald-600`)
- About, Features, Download, Contact, FAQ, landing SEO fallback, skip link

---

## Portal audit (authenticated) — **O-01 closed**

**Method:** Local Postgres 16, `prisma db push`, `node prisma/seed.js`, `next start` + real `/api/auth/login` (Playwright `page.evaluate` + CSRF). `DATABASE_URL` required.

| Portal / route | 375 / 768 / 1280 overflow | Axe @1280 | UI fixes |
|----------------|---------------------------|-----------|----------|
| **/patient** (Home, Meds, Care, Journal, Labs tabs) | Pass | Pass | `Button` tokens: Join call, test alarm, today-view Take |
| **/doctor** (Dashboard, Patients, Appointments) | Pass | Pass | Accept/Complete → `variant="default"` |
| **/lab** (Dashboard, Bookings) | Pass | Pass | Save quote, status, upload → `Button` |
| **/caretaker** (Home, Members) | Pass | Pass | Member schedule Taken → `variant="default"` |
| **/admin** (Dashboard) | Pass | Pass | — |
| **/settings**, **/family** | Pass | Pass | — |
| **/dashboard** | Pass (redirects to role home) | Pass | Server redirect — audited via following navigation |

### Portal token consolidation — **O-02 closed**

Replaced ad-hoc `bg-emerald-600` actions with shared `Button` `variant="default"` (primary token) in:

- `patient-app.tsx`, `today-view.tsx`, `medication-alarm-host.tsx`
- `doctor-dashboard.tsx`, `lab-dashboard.tsx`, `caretaker/member-schedule.tsx`
- `login-page.tsx` (family invite Accept), `web-alerts-banner.tsx` (44px icon well)

---

## Open / justified

| ID | Notes |
|----|--------|
| **O-04** | **Supabase optional noise** in dev without `NEXT_PUBLIC_SUPABASE_*` — login falls back to Prisma; harmless server logs only. |
| **O-05** | **Stripe / checkout** — explicitly out of scope; not audited. |
| **O-06** | **Prisma migrate deploy** on empty local DB may fail mid-chain; UI audit uses `db push` + seed (documented in `local-ui-audit-db.sh`). Schema changes remain other agents’ ownership. |

---

## Test results (after rebase onto `main`)

| Gate | Result |
|------|--------|
| `tsc --noEmit` | **Pass** (O-03 resolved — stale base) |
| `eslint` | **Pass** |
| `vitest --run` | **231/231 pass** |
| `next build` | **Pass** |
| `e2e/ui-design-audit` | **88 passed**, 0 axe serious (public) |
| `e2e/ui-portal-audit` | **36 passed**, 0 axe serious (portals) |
| Viewport probe (spot) | **12/12** |

```bash
# Local portal audit
e2e/local-ui-audit-db.sh
CI=true PLAYWRIGHT_BASE_URL=http://localhost:3000 DATABASE_URL=... \\
  npx playwright test e2e/ui-portal-audit.spec.ts --project=chromium-desktop
```

Artifacts: `artifacts/ui-audit/{before,after,portal-after}/`
