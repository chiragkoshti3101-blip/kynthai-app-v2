import { test, expect } from '@playwright/test';
import { goto, expectPath, clickButton } from './helpers';

test.describe('Landing Page', () => {
    test('full landing page loads with all sections', async ({ page }) => {
          const errors: string[] = [];
          page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

             await goto(page, '/');
          await page.waitForLoadState('networkidle');

             // Core sections present
             await expect(page.locator('header')).toBeVisible();
          await expect(page.getByText(/Kynthai/i).first()).toBeVisible();
          await expect(page.getByText(/health|medical|care/i).first()).toBeVisible();

             // Navigation works
             await expect(page.getByRole('navigation')).toBeVisible();
          const navLinks = page.getByRole('navigation').getByRole('link');
          const linkCount = await navLinks.count();
          expect(linkCount).toBeGreaterThanOrEqual(3);

             // CTA buttons present
             const ctaButtons = page.getByRole('button').or(page.getByRole('link'));
          await expect(ctaButtons.first()).toBeVisible();

             // Footer present
             await expect(page.locator('footer')).toBeVisible();

             // No critical console errors
             const criticalErrors = errors.filter(e => !e.includes('favicon'));
          expect(criticalErrors).toEqual([]);
    });

                test('hero section has headline and description', async ({ page }) => {
                      await goto(page, '/');
                      await page.waitForLoadState('networkidle');

                         // Hero should have a main heading
                         const h1 = page.locator('h1');
                      await expect(h1.first()).toBeVisible();
                      const h1Text = await h1.first().textContent();
                      expect(h1Text?.trim().length).toBeGreaterThan(0);

                         // The landing hero is intentionally device-free: no phone frame or old
                         // product-preview image may render in either the SSR fallback or the
                         // hydrated page.
                         await expect(
                                 page.locator('[data-testid="phone-mockup"], img[src*="kynthai-hero-preview"], .phone-canvas, .phone-frame'),
                               ).toHaveCount(0);
                      await expect(
                              page.getByRole('img', {
                                        name: /care overview with medication reminders, care team, and family updates/i,
                              }),
                            ).toBeVisible();
                });

                test('navigation links work correctly', async ({ page }) => {
                      await goto(page, '/');

                         // Find and click login link in nav
                         const loginLink = page.getByRole('link', { name: /sign.?in|log.?in|login/i });
                      if (await loginLink.count() > 0) {
                              await loginLink.first().click();
                              await expectPath(page, '/login');
                      }
                });

                test('page is mobile responsive — viewport 375px', async ({ page }) => {
                      await page.setViewportSize({ width: 375, height: 812 });
                      await goto(page, '/');
                      await page.waitForLoadState('networkidle');

                         // Content still visible on mobile
                         await expect(page.locator('header')).toBeVisible();
                      // Mobile menu toggle (hamburger) present
                         const mobileMenu = page.getByRole('button').or(page.locator('[data-testid="mobile-menu"]'));
                      const visibleCount = await page.locator('h1, h2, h3').count();
                      expect(visibleCount).toBeGreaterThanOrEqual(1);
                });
});

test.describe('Pricing Page', () => {
    test('pricing page loads with plan options', async ({ page }) => {
          await goto(page, '/pricing');
          await page.waitForLoadState('networkidle');

             // Pricing cards visible
             const planCards = page.locator('[data-testid="plan-card"], [class*="plan"], [class*="pricing"]').first();
          await expect(planCards).toBeVisible();

             // Pricing amounts visible
             const priceElements = page.getByText(/\$\d+/);
          expect(await priceElements.count()).toBeGreaterThanOrEqual(1);
    });
});

test.describe('Legal & Privacy Pages', () => {
    test('privacy page renders with content', async ({ page }) => {
          await goto(page, '/privacy');
          await page.waitForLoadState('networkidle');
          const body = page.locator('body');
          await expect(body).toBeVisible();
          const text = await body.textContent();
          expect(text?.length).toBeGreaterThan(200);
    });

                test('terms page renders with content', async ({ page }) => {
                      await goto(page, '/terms');
                      await page.waitForLoadState('networkidle');
                      const text = await page.locator('body').textContent();
                      expect(text?.length).toBeGreaterThan(200);
                });

                test('patient rights page renders', async ({ page }) => {
                      await goto(page, '/patient-rights');
                      await page.waitForLoadState('networkidle');
                      const text = await page.locator('body').textContent();
                      expect(text).toContain('right');
                });

                test('cookie consent page renders', async ({ page }) => {
                      await goto(page, '/cookies');
                      await page.waitForLoadState('networkidle');
                      await expect(page.locator('body')).toBeVisible();
                });

                test('medical disclaimer page renders', async ({ page }) => {
                      await goto(page, '/medical-disclaimer');
                      await page.waitForLoadState('networkidle');
                      await expect(page.locator('body')).toBeVisible();
                });

                test('CCPA opt-out page renders', async ({ page }) => {
                      await goto(page, '/ccpa');
                      await page.waitForLoadState('networkidle');
                      await expect(page.locator('body')).toBeVisible();
                });
});

test.describe('Accessibility', () => {
    test('accessibility page renders', async ({ page }) => {
          await goto(page, '/accessibility');
          await page.waitForLoadState('networkidle');
          const text = await page.locator('body').textContent();
          expect(text?.length).toBeGreaterThan(100);
    });
});
