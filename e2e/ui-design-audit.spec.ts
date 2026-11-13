/**
 * UI design audit — screenshots + axe + horizontal overflow at 375 / 768 / 1280.
 * Artifacts: artifacts/ui-audit/<phase>/<route>-<width>.png
 *
 * Run: UI_AUDIT_PHASE=before npx playwright test e2e/ui-design-audit.spec.ts --project=chromium-desktop
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as fs from 'fs';
import * as path from 'path';

const PHASE = process.env.UI_AUDIT_PHASE || 'before';
const ARTIFACT_ROOT = path.join(process.cwd(), 'artifacts', 'ui-audit', PHASE);

const VIEWPORTS = [
  { width: 375, height: 812, label: '375' },
  { width: 768, height: 1024, label: '768' },
  { width: 1280, height: 800, label: '1280' },
] as const;

const PUBLIC_ROUTES = [
  { path: '/', slug: 'landing' },
  { path: '/login', slug: 'login' },
  { path: '/register', slug: 'register' },
  { path: '/pricing', slug: 'pricing' },
  { path: '/features', slug: 'features' },
  { path: '/faq', slug: 'faq' },
  { path: '/about', slug: 'about' },
  { path: '/contact', slug: 'contact' },
  { path: '/download', slug: 'download' },
  { path: '/terms', slug: 'terms' },
  { path: '/privacy', slug: 'privacy' },
  { path: '/accessibility', slug: 'accessibility' },
  { path: '/feedback', slug: 'feedback' },
  { path: '/forgot-password', slug: 'forgot-password' },
  { path: '/legal', slug: 'legal' },
  { path: '/cookies', slug: 'cookies' },
  { path: '/ccpa', slug: 'ccpa' },
  { path: '/medical-disclaimer', slug: 'medical-disclaimer' },
  { path: '/patient-rights', slug: 'patient-rights' },
  { path: '/privacy-practices', slug: 'privacy-practices' },
  { path: '/refund-cancellation', slug: 'refund-cancellation' },
  { path: '/grievance', slug: 'grievance' },
];

interface AuditFinding {
  route: string;
  slug: string;
  viewport: string;
  kind: 'overflow' | 'axe';
  severity: string;
  detail: string;
}

const findings: AuditFinding[] = [];

function ensureDir() {
  fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
}

for (const route of PUBLIC_ROUTES) {
  for (const vp of VIEWPORTS) {
    test(`${route.slug} @ ${vp.label}px — screenshot + overflow`, async ({ page }) => {
      ensureDir();
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(route.path, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForTimeout(800);

      const shot = path.join(ARTIFACT_ROOT, `${route.slug}-${vp.label}.png`);
      await page.screenshot({ path: shot, fullPage: true });

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      if (scrollWidth > clientWidth + 1) {
        findings.push({
          route: route.path,
          slug: route.slug,
          viewport: vp.label,
          kind: 'overflow',
          severity: 'high',
          detail: `Horizontal overflow: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`,
        });
      }
      expect.soft(scrollWidth, `${route.path} @ ${vp.label}px horizontal scroll`).toBeLessThanOrEqual(
        clientWidth + 1,
      );
    });
  }
}

for (const route of PUBLIC_ROUTES) {
  test(`${route.slug} @ 1280px — axe WCAG 2.1 AA`, async ({ page }) => {
    ensureDir();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(route.path, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(500);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2aa', 'wcag21aa'])
      .analyze();

    const reportPath = path.join(ARTIFACT_ROOT, `${route.slug}-axe-1280.json`);
    fs.writeFileSync(reportPath, JSON.stringify(results.violations, null, 2));

    for (const v of results.violations) {
      findings.push({
        route: route.path,
        slug: route.slug,
        viewport: '1280',
        kind: 'axe',
        severity: v.impact || 'moderate',
        detail: `${v.id}: ${v.help} (${v.nodes.length} nodes)`,
      });
    }

    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    if (serious.length) {
      console.log(`[axe] ${route.path}: ${serious.map((v) => v.id).join(', ')}`);
    }
  });
}

test.afterAll(() => {
  ensureDir();
  fs.writeFileSync(path.join(ARTIFACT_ROOT, 'findings.json'), JSON.stringify(findings, null, 2));
  console.log(`\n[ui-design-audit] ${findings.length} findings written (${PHASE})`);
});
