/**
 * Portal UI audit — authenticated routes + patient tabs at 375 / 768 / 1280.
 * Requires local Postgres seeded via scripts/local-ui-audit-db.sh
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { DEMO_ACCOUNTS, type DemoRole } from './helpers';
import type { Page } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

test.setTimeout(120_000);

async function loginPortal(page: Page, role: DemoRole) {
  const { email, password } = DEMO_ACCOUNTS[role];
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  const loginResult = await page.evaluate(
    async ({ em, pw }) => {
      const csrf = await fetch('/api/auth/csrf', { credentials: 'include' }).then((r) => r.json());
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.token as string },
        body: JSON.stringify({ email: em, password: pw }),
      });
      return { ok: res.ok, status: res.status, body: await res.text() };
    },
    { em: email, pw: password },
  );
  expect(loginResult.ok, loginResult.body).toBeTruthy();
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const me = await page.request.get(`${BASE}/api/auth/me`);
    const body = (await me.json().catch(() => ({}))) as { authenticated?: boolean };
    if (body.authenticated) return;
    await page.waitForTimeout(400);
  }
  throw new Error(`Session not established for ${email}`);
}
import * as fs from 'fs';
import * as path from 'path';

const PHASE = process.env.UI_AUDIT_PHASE || 'portal';
const ARTIFACT_ROOT = path.join(process.cwd(), 'artifacts', 'ui-audit', PHASE);

const VIEWPORTS = [
  { width: 375, height: 812, label: '375' },
  { width: 768, height: 1024, label: '768' },
  { width: 1280, height: 800, label: '1280' },
] as const;

const PORTALS: { role: DemoRole; path: string; slug: string; tabs?: string[] }[] = [
  { role: 'patient', path: '/patient', slug: 'patient', tabs: ['Home', 'Meds', 'Care', 'Journal', 'Labs'] },
  { role: 'doctor', path: '/doctor', slug: 'doctor', tabs: ['Dashboard', 'Patients', 'Appointments'] },
  { role: 'lab', path: '/lab', slug: 'lab', tabs: ['Dashboard', 'Bookings'] },
  { role: 'caretaker', path: '/caretaker', slug: 'caretaker', tabs: ['Home', 'Members'] },
  { role: 'admin', path: '/admin', slug: 'admin', tabs: ['Dashboard'] },
];

const EXTRA_ROUTES: { role: DemoRole; path: string; slug: string }[] = [
  { role: 'patient', path: '/dashboard', slug: 'dashboard' },
  { role: 'patient', path: '/settings', slug: 'settings' },
  { role: 'patient', path: '/family', slug: 'family' },
];

function ensureDir() {
  fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
}

async function auditViewport(
  page: import('@playwright/test').Page,
  slug: string,
  suffix: string,
  vp: (typeof VIEWPORTS)[number],
) {
  ensureDir();
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.waitForTimeout(600);
  const shot = path.join(ARTIFACT_ROOT, `${slug}${suffix}-${vp.label}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect.soft(scrollWidth, `${slug} @ ${vp.label}px overflow`).toBeLessThanOrEqual(clientWidth + 1);
}

async function runAxe(page: import('@playwright/test').Page, slug: string, suffix: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']).analyze();
  fs.writeFileSync(
    path.join(ARTIFACT_ROOT, `${slug}${suffix}-axe-1280.json`),
    JSON.stringify(results.violations, null, 2),
  );
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect.soft(serious, `${slug} axe serious:\n${serious.map((v) => v.id).join(', ')}`).toEqual([]);
}

for (const portal of PORTALS) {
  test.describe(`${portal.slug} portal`, () => {
    test.describe.configure({ mode: 'serial' });
    let authDone = false;

    test.beforeEach(async ({ page }) => {
      test.skip(!process.env.DATABASE_URL, 'Portal audit requires DATABASE_URL (local Postgres)');
      if (!authDone) {
        await loginPortal(page, portal.role);
        authDone = true;
      }
      await page.goto(`${BASE}${portal.path}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await page.waitForTimeout(1500);
    });

    for (const vp of VIEWPORTS) {
      test(`shell @ ${vp.label}px`, async ({ page }) => {
        await auditViewport(page, portal.slug, '-shell', vp);
      });
    }

    test('shell axe @ 1280', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await runAxe(page, portal.slug, '-shell');
    });

    for (const tab of portal.tabs ?? []) {
      test(`tab ${tab} @ 1280`, async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        const tabBtn = page.getByRole('button', { name: tab, exact: false }).first();
        if (await tabBtn.count()) {
          await tabBtn.click();
          await page.waitForTimeout(1200);
        }
        const slug = `${portal.slug}-tab-${tab.toLowerCase().replace(/\s+/g, '-')}`;
        await auditViewport(page, slug, '', { width: 1280, height: 800, label: '1280' });
        await runAxe(page, slug, '');
      });
    }
  });
}

test.describe('extra patient routes', () => {
  test.describe.configure({ mode: 'serial' });
  let authDone = false;

  for (const extra of EXTRA_ROUTES) {
    test(`${extra.slug} @ 1280`, async ({ page }) => {
      test.skip(!process.env.DATABASE_URL, 'Portal audit requires DATABASE_URL');
      if (!authDone) {
        await loginPortal(page, extra.role);
        authDone = true;
      }
      await page.goto(`${BASE}${extra.path}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await page.waitForTimeout(1500);
      await page.setViewportSize({ width: 1280, height: 800 });
      await auditViewport(page, extra.slug, '', { width: 1280, height: 800, label: '1280' });
      await runAxe(page, extra.slug, '');
    });
  }
});
