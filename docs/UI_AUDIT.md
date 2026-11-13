# Kynthai UI Design Audit

**Branch:** `cursor/ui-audit-fixes-90ec`  
**Last updated:** 2026-11-13

---

## Design acceptance criteria

All pages and shared UI must meet the following before release.

| ID | Criterion | Pass condition |
|----|-----------|----------------|
| **C-01** | WCAG 2.1 AA contrast | Text and UI components meet 4.5:1 (normal) / 3:1 (large UI); no axe `color-contrast` serious/critical on audited routes |
| **C-02** | Visible focus states | Keyboard `:focus-visible` shows a clear ring (≥3px) on all interactive controls |
| **C-03** | Keyboard navigation | Logical tab order; skip link; no keyboard traps outside modals |
| **C-04** | Labelled form fields + inline errors | Inputs have visible label or `aria-label`; errors use `aria-describedby` / `aria-invalid` |
| **C-05** | Tap targets ≥44px | Primary actions and icon buttons meet 44×44px |
| **C-06** | No horizontal scroll | `scrollWidth ≤ clientWidth` at **375px**, **768px**, **1280px** |
| **C-07** | Type scale | Consistent heading steps; marketing pages use shared `Marketing*` components |
| **C-08** | Spacing scale | Tailwind 4px grid; section rhythm consistent |
| **C-09** | Colour tokens | Semantic tokens (`primary`, `foreground`, `muted-foreground`, `border`) over one-off slate/emerald hex |
| **C-10** | Button variants | Marketing CTAs use shared `Button` / `MarketingCtaLink` |
| **C-11** | Data views: loading / empty / error | Async panels show explicit states (portal scope — see Open) |
| **C-12** | Modals | Radix `Dialog`: focus trap, Esc close, 44px close control with `sr-only` label |

### Audit breakpoints

- Mobile: **375×812**
- Tablet: **768×1024**
- Desktop: **1280×800**

### Tooling

- `e2e/ui-design-audit.spec.ts` → `artifacts/ui-audit/{before|after}/`
- `viewport-probe.mjs` (375, 768, 1280)
- `@axe-core/playwright` (`wcag2aa`, `wcag21aa`)

---

## Issues found (before) and resolution

### Marketing routes — contrast & tokens

| Page | Breakpoint | Severity | Criteria | Issue | Status |
|------|------------|----------|----------|-------|--------|
| `/about` | 1280 | high | C-01, C-09, C-10 | `bg-emerald-600` Sign in link failed contrast (3.65:1); ad-hoc slate palette | **Fixed** — `MarketingCtaLink` + semantic tokens |
| `/features` | 1280 | high | C-01, C-09, C-10 | Same on Get started CTA | **Fixed** |
| `/download` | 1280 | high | C-01, C-09, C-10 | APK download anchor `bg-emerald-600` | **Fixed** — `MarketingCtaAnchor` |
| `/` (SEO fallback) | 375–1280 | medium | C-09, C-10 | Emerald CTA on server fallback | **Fixed** |
| `/contact`, `/faq` | 1280 | low | C-07–C-09 | Isolated `text-slate-*` / `text-emerald-*` | **Fixed** — `MarketingPage` shell |
| `layout` skip link | all | low | C-01, C-09 | `focus:bg-emerald-600` | **Fixed** — `focus:bg-primary` |

### Navigation

| Page | Breakpoint | Severity | Criteria | Issue | Status |
|------|------------|----------|----------|-------|--------|
| Landing nav | mobile | medium | C-03, C-05 | Portal nav buttons missing `type="button"`; mobile drawer links under 44px height | **Fixed** in `landing-nav.tsx` |

### Horizontal overflow

All **23 public routes** × **3 breakpoints**: **PASS** (Playwright + viewport probe on spot checks).

### Axe (public routes, 1280px)

| Phase | Serious/critical violations |
|-------|----------------------------|
| Before | **3** (all `color-contrast` on emerald CTAs) |
| After | **0** |

---

## Per-page summary (public audit pass)

| Route | Overflow 375/768/1280 | Axe @1280 | Notes |
|-------|----------------------|-----------|-------|
| `/` | Pass | Pass | SEO fallback CTAs tokenized |
| `/login` | Pass | Pass | — |
| `/register` | Pass | Pass | — |
| `/pricing` | Pass | Pass | — |
| `/features` | Pass | Pass | Card borders → `border-border` |
| `/faq` | Pass | Pass | `summary` focus ring → `ring-ring` |
| `/about` | Pass | Pass | — |
| `/contact` | Pass | Pass | — |
| `/download` | Pass | Pass | `bg-background` |
| Legal & policy pages (12) | Pass | Pass | No changes required |

---

## Shared components added

- `src/components/kynthai/marketing-ui.tsx` — `MarketingPage`, `MarketingCtaLink`, `MarketingSecondaryLink`, `MarketingTextLink`, `MarketingCtaAnchor`, typography helpers
- `e2e/ui-design-audit.spec.ts` — repeatable screenshot + axe matrix

---

## Open issues (not fixed in this PR)

| ID | Criteria | Reason |
|----|----------|--------|
| **O-01** | C-11 | **Portal data views** (`/patient`, `/doctor`, `/lab`, `/caretaker`, `/dashboard`) not audited end-to-end: local dev did not seed demo DB in this run; auth middleware + Prisma are out of scope (parallel API PRs). Spot-check from `docs/accessibility/aria-findings.md` suggests remaining portal-only button labelling. |
| **O-02** | C-09 | Residual `bg-emerald-600` inside **portal app shells** (patient/doctor/lab dashboards) — functional UI, not in public axe sweep; follow-up PR recommended without touching Stripe/checkout flows. |
| **O-03** | — | `npm run typecheck` / one **vitest** failure (`encryption-file-split.test.ts`) are **pre-existing on `main`** in API/lib code outside this PR scope. |

---

## Test results log

| Run | `eslint` | `vitest --run` | `next build` | Axe public @1280 | Viewport probe |
|-----|----------|----------------|--------------|------------------|----------------|
| After fixes | **Pass** | 191/192 pass (1 fail pre-existing lib) | **Pass** | **0 serious** | **12/12 pass** |
| `tsc --noEmit` | — | — | — | — | Errors in `src/app/api/*`, `src/lib/*` (pre-existing; not introduced here) |

Command log:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 UI_AUDIT_PHASE=after \
  npx playwright test e2e/ui-design-audit.spec.ts --project=chromium-desktop
# 88 passed

PROBE_URL=http://localhost:3000 PROBE_VIEWPORTS=375x812,768x1024,1280x800 \
  PROBE_ROUTES=/,/login,/pricing,/feedback node viewport-probe.mjs
# 12 passed

npm run lint          # pass
npm run test:ci       # 191 passed, 1 failed (encryption-file-split)
npm run build         # pass
```

Screenshots: `artifacts/ui-audit/before/` and `artifacts/ui-audit/after/` (full matrix); PR attaches representative before/after pairs.
