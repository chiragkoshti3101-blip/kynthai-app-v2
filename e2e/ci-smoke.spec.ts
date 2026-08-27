/**
 * CI Smoke Tests — lightweight checks of public pages, protected redirects and
 * API health. Run against the target passed via PLAYWRIGHT_BASE_URL (the
 * deploy e2e job points it at the freshly built local server on :3000; the
 * PR/push job in ci.yml points it at the live kynthai.app). Defaults to the
 * local dev server so an unset variable fails fast against localhost instead
 * of silently testing a stale remote deployment.
 *
 * Run: PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test e2e/ci-smoke.spec.ts
 */
import { test, expect, type APIRequestContext } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

// ── Utility ─────────────────────────────────────────────────────────────────
/** Run a batch of URL checks using the Playwright request context (no browser). */
async function checkPages(
  request: APIRequestContext,
  pages: { path: string; expectedStatus: number; locationContains?: string }[],
) {
  for (const { path, expectedStatus, locationContains } of pages) {
    await test.step(`GET ${path} → ${expectedStatus}`, async () => {
      const response = await request.get(`${BASE}${path}`, {
        maxRedirects: locationContains ? 0 : undefined,
      });
      expect(response.status()).toBe(expectedStatus);

      if (locationContains) {
        const location = response.headers()['location'] || '';
        expect(location).toContain(locationContains);
      }
    });
  }
}

// ── Public pages that should return 200 ─────────────────────────────────────
test.describe('Public pages — all return 200', () => {
  const PUBLIC_PAGES = [
    '/', '/login', '/register', '/pricing', '/privacy', '/terms',
    '/cookies', '/accessibility', '/medical-disclaimer', '/patient-rights',
    '/ccpa', '/refund-cancellation', '/privacy-practices', '/forgot-password',
    '/feedback', '/grievance', '/checkout', '/settings',
  ];

  test(`all ${PUBLIC_PAGES.length} public pages return 200`, async ({ request }) => {
    await checkPages(
      request,
      PUBLIC_PAGES.map((path) => ({ path, expectedStatus: 200 })),
    );
  });

  // Also verify each individually for clearer error messages
  for (const path of PUBLIC_PAGES) {
    test(`${path} returns 200`, async ({ request }) => {
      const response = await request.get(`${BASE}${path}`);
      expect(response.status()).toBe(200);
    });
  }
});

// ── Protected routes — should redirect to /login ────────────────────────────
test.describe('Protected routes — redirect unauthenticated to /login', () => {
  const PROTECTED = ['/patient', '/doctor', '/family', '/lab', '/admin'];

  test(`all ${PROTECTED.length} protected routes redirect to /login`, async ({ request }) => {
    await checkPages(
      request,
      PROTECTED.map((path) => ({ path, expectedStatus: 307, locationContains: '/login' })),
    );
  });

  for (const route of PROTECTED) {
    test(`${route} redirects to /login`, async ({ request }) => {
      const response = await request.get(`${BASE}${route}`, { maxRedirects: 0 });
      expect([302, 307]).toContain(response.status());
      const location = response.headers()['location'] || '';
      expect(location).toContain('/login');
    });
  }
});

// ── API endpoints ───────────────────────────────────────────────────────────
test.describe('API endpoints', () => {
  test('/api/health returns 200 with status ok', async ({ request }) => {
    const response = await request.get(`${BASE}/api/health`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });

  test('/api/emergency-sos returns 401 (auth required)', async ({ request }) => {
    const response = await request.get(`${BASE}/api/emergency-sos`);
    expect(response.status()).toBe(401);
  });

  test('/api/emergency returns 401 (auth required)', async ({ request }) => {
    const response = await request.get(`${BASE}/api/emergency`);
    expect(response.status()).toBe(401);
  });
});

// ── Landing page structure (requires browser — only runs in full E2E) ───────
test.describe('Landing page structure', () => {
  test('footer has all three nav columns', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('nav[aria-label="Product"]')).toBeVisible();
    await expect(page.locator('nav[aria-label="AI Features"]')).toBeVisible();
    await expect(page.locator('nav[aria-label="Company"]')).toBeVisible();
  });

  test('login page has input fields', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.locator('body')).toBeVisible();
    const count = await page.locator('input').count();
    expect(count).toBeGreaterThan(0);
  });

  test('404 page renders correctly', async ({ page }) => {
    await page.goto(`${BASE}/nonexistent-page-xyz`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
  });
});

// ── Mobile viewport (requires browser — only runs in full E2E) ──────────────
test.describe('Mobile responsive', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('landing page renders without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const ourErrors = errors.filter((e) => !e.includes('favicon') && !e.includes('livekit.kynthai.app'));
    expect(ourErrors.length).toBe(0);
  });

  test('login page is usable on mobile', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await expect(page.locator('button').first()).toBeVisible();
  });
});
