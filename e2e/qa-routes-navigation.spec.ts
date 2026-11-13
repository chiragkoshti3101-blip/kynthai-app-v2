import { test, expect } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

/** All app router pages (35). */
const ALL_PAGES = [
  '/',
  '/about',
  '/accessibility',
  '/admin',
  '/admin-login',
  '/caretaker',
  '/ccpa',
  '/checkout',
  '/contact',
  '/cookies',
  '/dashboard',
  '/doctor',
  '/download',
  '/family',
  '/faq',
  '/features',
  '/feedback',
  '/forgot-password',
  '/grievance',
  '/invite',
  '/lab',
  '/legal',
  '/login',
  '/medical-disclaimer',
  '/patient',
  '/patient-rights',
  '/pricing',
  '/privacy',
  '/privacy-practices',
  '/refund-cancellation',
  '/register',
  '/reset-password',
  '/settings',
  '/terms',
].filter(p => p !== '/page')

const PORTALS = ['/patient', '/doctor', '/lab', '/admin', '/caretaker', '/dashboard', '/family']

test.describe('QA navigation — desktop', () => {
  for (const path of ALL_PAGES) {
    test(`QA-NAV-D-${path}: loads without 5xx`, async ({ request }) => {
      const expected = PORTALS.includes(path) ? [302, 307, 200] : [200]
      const res = await request.get(`${BASE}${path}`, { maxRedirects: 0 })
      if (PORTALS.includes(path)) {
        expect([302, 307, 200]).toContain(res.status())
      } else {
        expect(res.status(), `${path} status`).toBeLessThan(500)
        if (expected.includes(200)) expect(res.status()).toBe(200)
      }
    })
  }
})

test.describe('QA navigation — mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  for (const path of ['/', '/login', '/patient', '/doctor', '/pricing']) {
    test(`QA-NAV-M-${path}: mobile shell renders`, async ({ page }) => {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
      expect(res?.status() ?? 0).toBeLessThan(500)
      await expect(page.locator('body')).not.toBeEmpty()
    })
  }
})
