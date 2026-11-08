/**
 * Performance baseline — measures LCP, navigation timing, and JS/CSS payload
 * size on public pages and compares against a budget.
 *
 * Thresholds gate catastrophic regressions, not SLOs:
 *   - LCP <= 6000ms (desktop, fresh context)
 *   - TTFB <= 2500ms
 *   - Total JS+CSS transfer <= 3.5 MB
 * Every run logs exact numbers so trends are visible in CI artifacts.
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

function trackBytes(page: Page) {
  let jsBytes = 0;
  let cssBytes = 0;
  page.on('response', (r) => {
    const ct = r.headers()['content-type'] || '';
    const len = Number(r.headers()['content-length'] || 0);
    if (ct.includes('javascript') && len > 0) jsBytes += len;
    if (ct.includes('css') && len > 0) cssBytes += len;
  });
  return { bytes: () => ({ jsBytes, cssBytes }) };
}

function readLcp(): Promise<number> {
  return new Promise((resolve) => {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length) resolve(entries[entries.length - 1].startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    setTimeout(() => {
      const entries = performance.getEntriesByType('largest-contentful-paint');
      resolve(entries.length ? entries[entries.length - 1].startTime : 99999);
    }, 8000);
  });
}

async function sample(page: Page, path: string) {
  const tracker = trackBytes(page);
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  const lcp = await page.evaluate(readLcp);
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return { ttfb: n.responseStart, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd };
  });
  const { jsBytes, cssBytes } = tracker.bytes();
  return { lcp, ...nav, jsBytes, cssBytes };
}

test('Performance: landing page stays within budget', async ({ context }) => {
  const page = await context.newPage();
  const s = await sample(page, '/');
  console.log(
    `[perf] / LCP=${Math.round(s.lcp)}ms TTFB=${Math.round(s.ttfb)}ms DCL=${Math.round(s.dcl)}ms load=${Math.round(s.load)}ms JS=${(s.jsBytes / 1024 / 1024).toFixed(2)}MB CSS=${(s.cssBytes / 1024 / 1024).toFixed(2)}MB`,
  );
  expect(s.lcp, 'LCP within 6s budget').toBeLessThanOrEqual(6000);
  expect(s.ttfb, 'TTFB within 2.5s budget').toBeLessThanOrEqual(2500);
  const totalMb = (s.jsBytes + s.cssBytes) / 1024 / 1024;
  expect(totalMb, `JS+CSS payload (${totalMb.toFixed(2)}MB) within 3.5MB budget`).toBeLessThanOrEqual(3.5);
});

test('Performance: login page LCP within budget', async ({ context }) => {
  const page = await context.newPage();
  const s = await sample(page, '/login');
  console.log(`[perf] /login LCP=${Math.round(s.lcp)}ms TTFB=${Math.round(s.ttfb)}ms`);
  expect(s.lcp, 'login LCP within 5s budget').toBeLessThanOrEqual(5000);
});

test('Performance: doctor portal shell loads within budget (public landing only on live)', async ({ context }) => {
  // /doctor without auth redirects to /login — measure that it resolves fast,
  // not that it renders the portal (portal content is covered by the CI smoke).
  const page = await context.newPage();
  const t0 = Date.now();
  const resp = await page.goto(`${BASE}/doctor`, { waitUntil: 'load' });
  const total = Date.now() - t0;
  console.log(`[perf] /doctor -> ${resp?.url()} in ${total}ms`);
  expect(total, 'auth-redirect round trip under 8s').toBeLessThanOrEqual(8000);
});
