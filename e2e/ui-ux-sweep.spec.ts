/**
 * UI/UX QA sweep — verifies that every page renders without console errors,
 * failing subresources, or stuck/empty UI.
 *
 * Runs in two tiers:
 *  - PUBLIC: safe against live production (no auth, no writes).
 *  - PORTAL: demo-login pages — only valid on the CI disposable-DB runner
 *    (guarded by IS_PROD flag so a live run skips them instead of failing).
 */
import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const IS_PROD = BASE.includes('kynthai.app');

interface ConsoleTracker {
  errors: string[];
  failed: { url: string; status: number }[];
}

function trackPage(page: Page): ConsoleTracker {
  const t: ConsoleTracker = { errors: [], failed: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') t.errors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && r.status() !== 410) {
      // CSP violation reports and probe 404s on optional assets are expected.
      if (!/csp-report|\/manifest\.json/.test(r.url())) {
        t.failed.push({ url: r.url(), status: r.status() });
      }
    }
  });
  return t;
}

function criticalConsoleErrors(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      !e.includes('favicon') &&
      !e.includes('Failed to load resource') &&
      !/404|400/.test(e.slice(0, 80)),
  );
}

const PUBLIC_PAGES = [
  { path: '/', name: 'Landing' },
  { path: '/login', name: 'Login' },
  { path: '/pricing', name: 'Pricing' },
  { path: '/privacy', name: 'Privacy' },
  { path: '/terms', name: 'Terms' },
  { path: '/download', name: 'Download' },
];

for (const p of PUBLIC_PAGES) {
  test(`UI/UX: ${p.name} (${p.path}) renders cleanly`, async ({ page }) => {
    const t = trackPage(page);
    await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Main content actually rendered (not a stuck loader / empty shell).
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length, 'page rendered non-empty content').toBeGreaterThan(50);

    expect(criticalConsoleErrors(t.errors), `no uncaught console errors:\n${t.errors.join('\n')}`).toEqual([]);
    const realFailures = t.failed.filter((f) => f.status >= 500);
    expect(realFailures, `no 5xx subresources:\n${JSON.stringify(t.failed)}`).toEqual([]);
  });
}

test('UI/UX: mobile viewport has no horizontal overflow on landing', async ({ context }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, 'no horizontal scroll at 375px').toBeLessThanOrEqual(clientWidth);
});

// ── PORTAL tier (DB-backed CI runner only) ─────────────────────────────
for (const role of ['patient', 'doctor', 'lab'] as const) {
  test(`UI/UX: ${role} portal loads with clean console after demo login`, async ({ context }) => {
    test.skip(IS_PROD, 'demo logins only exist on the disposable-DB CI runner');
    const page = await context.newPage();
    const t = trackPage(page);
    await loginAs(page, role);
    await page.waitForTimeout(1500);
    expect(criticalConsoleErrors(t.errors), `no uncaught console errors:\n${t.errors.join('\n')}`).toEqual([]);
    const h1 = await page.locator('h1, h2').first().count();
    expect(h1, 'portal has a visible heading').toBeGreaterThan(0);
  });
}

// ── WCAG 2.2 AA (axe-core) ────────────────────────────────────────────
// The axe gate hard-fails serious/critical violations on the DETERMINISTIC
// local build (deploy E2E job, PLAYWRIGHT_BASE_URL=localhost:3000) — that is
// the reproducible a11y regression guard. On the live prod-smoke run it is
// log-only: kynthai.app may be mid-deploy at test time, so a strict assertive
// gate there would flakily block merges for a stale deploy.
test('A11y: landing + login + pricing — WCAG 2.x AA (hard on local build, log on prod)', async ({ page }) => {
  for (const path of ['/', '/login', '/pricing']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    const detail = serious
      .map((v) => `  - ${v.id} (${v.impact}): ${v.help} on ${v.nodes.length} node(s)`)
      .join('\n');
    if (IS_PROD) {
      if (serious.length) {
        console.warn(`[a11y:prod log] ${serious.length} serious/critical on ${path}:\n${detail}`);
      }
      continue;
    }
    expect(serious, `WCAG serious/critical violations on ${path}:\n${detail}`).toEqual([]);
  }
});
