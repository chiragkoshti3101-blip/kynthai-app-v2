# Kynthai — Performance Report (Initial)

**Phase:** 1 discovery. No Lighthouse lab run, no production RUM, and no load test execution in this audit (see `load-test/` — not run: requires live API + credentials).

---

## 1. Build & delivery

| Signal | Evidence | Impact |
|--------|----------|--------|
| Next.js 16 + Turbopack dev | Dev ready ~283ms | Fast local iteration |
| `optimizePackageImports` | `next.config.mjs` — lucide, framer-motion, radix, recharts, date-fns | Smaller client chunks |
| `experimental.cpus: 2` | `next.config.mjs` | Limits static generation parallelism (Vercel OOM mitigation) |
| `productionBrowserSourceMaps: false` | `next.config.mjs` | Smaller deploy artifact |
| Standalone Docker output | When not `VERCEL` | Self-hosted image size |
| Image optimization | AVIF/WebP, 60-day `minimumCacheTTL` | CDN-friendly assets |
| Middleware on all non-static routes | `middleware.ts` matcher | Small per-request edge cost; necessary for security |
| Sentry + Reticle wrappers | `next.config.mjs` | Build-time overhead; tracing in prod |

**Build failure (types):** Production build stops at typecheck (~14s compile then fail). See `docs/ENGINEERING_AUDIT.md` — blocks perf benchmarking of production bundle in CI until fixed.

---

## 2. Client/runtime performance smells

### 2.1 Large monolithic client components

| File | Lines (approx.) | Concern |
|------|----------------:|---------|
| `doctor-dashboard.tsx` | 2425 | Many tabs, parallel fetches, demo fallbacks |
| `patient-app.tsx` | 1872 | 17+ `fetch()` calls in one module (grep count) |
| `admin-dashboard.tsx` | 1870 | Heavy tables without virtualisation |
| `login-page.tsx` | 1511 | Registration wizard + CAPTCHA |
| `caretaker-app.tsx` | 1483 | Family pulse + reminders |
| `medicine-db-cache.ts` | 2215 | Large static cache loaded in bundle |

**Recommendation:** Tab-level `dynamic()`, split dashboards per route segment, centralise data with TanStack Query (already dependency) to dedupe requests.

### 2.2 Data fetching patterns

- Doctor dashboard: parallel dashboard fetch (`doctor-dashboard.tsx` ~525+); server returns up to 200 appointments (`doctors/dashboard/route.ts`).
- Patient home: multiple independent `fetch` calls with silent `catch` — risk of **waterfall** and stale UI (`patient-app.tsx` ~506-519).
- Admin overview: full-table `findMany` across users, doctors, labs, payments (`admin/overview/route.ts`) — **O(n) memory** at scale.

### 2.3 Caching

- Middleware sets `Cache-Control: no-store` on `/api/*` — correct for PHI.
- Static marketing pages: `max-age=60` + SWR in middleware.
- Service workers: `public/sw.js`, `sw-v3.js` (cache bust via `scripts/cache-bust.js` on build).

### 2.4 Animation & motion

- Framer Motion used widely (celebrations, family UI). Respect `prefers-reduced-motion` in some components; verify globally for a11y/perf (`motion-system.test.ts` exists).

---

## 3. Server & database

| Area | Observation |
|------|-------------|
| Prisma | Encryption middleware adds CPU on read/write for encrypted fields |
| Connection | `DATABASE_URL` / pooler `DIRECT_URL` pattern for serverless |
| N+1 risk | Not systematically audited; large dashboards eager-load relations |
| Cron | Reminder send/schedule routes designed for GitHub Actions cron |
| File crypto | Per-upload scrypt — CPU cost acceptable; batch uploads need limit |

**Missing DB in audit:** Query plans and index usage not validated. Prisma migrations include FK indexes (`20270103000000_add_fk_indexes`).

---

## 4. Edge rate limiting & scalability

- Middleware uses **in-memory** `rateLimitWithInfo` — limits are **per server instance**, not global.
- `rateLimitProduction` can use Upstash but auth path may still hit memory fallback (`rate-limit.ts`).
- **Impact:** Abuse/brute-force budgets multiply with autoscale count until Redis wired.

---

## 5. Mobile (Capacitor)

- Native plugins: local notifications, push, preferences — good for reminder reliability vs web-only.
- APK build workflows in CI — binary size and startup not measured here.

---

## 6. Recommended measurements (Phase 2)

| Test | Tool | Target |
|------|------|--------|
| LCP/INP on `/`, `/login`, `/patient` | Playwright `e2e/performance.spec.ts` or Lighthouse CI | LCP < 2.5s on 4G throttling |
| API p95 admin overview | `autocannon` / `load-test/test-api.js` | p95 < 500ms at 50 RPS with pagination fix |
| Bundle analysis | `@next/bundle-analyzer` (devDep) | Top chunks < 250KB gzip each for portals |
| DB | `EXPLAIN ANALYZE` on dashboard queries | No seq scans on `appointments`, `medications` |

---

## 7. Quick wins (no rewrite)

1. Paginate admin overview + doctor dashboard lists (cursor already on medications GET).  
2. Lazy-load `market-view`, `ai-chat`, `video-call` on patient/doctor routes.  
3. Ensure `optimizePackageImports` covers `lucide-react` icon subsets (named imports only).  
4. Alert when Upstash fallback active in production (metric + log).  
5. Fix build/typecheck to enable bundle size CI regression gates.

See issue IDs **KYN-MED-014**, **KYN-MED-015**, **KYN-HIGH-014** in `docs/ISSUE_REGISTER.md`.
