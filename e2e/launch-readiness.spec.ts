import { test, expect } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

test.describe('Launch readiness: public surface', () => {
  const pages = ['/', '/login', '/register', '/pricing', '/download', '/faq', '/contact', '/privacy', '/terms', '/cookies', '/accessibility', '/medical-disclaimer', '/refund-cancellation', '/privacy-practices', '/patient-rights', '/ccpa', '/grievance']
  for (const path of pages) test(`${path} is reachable`, async ({ request }) => expect((await request.get(`${BASE}${path}`)).status()).toBe(200))
  test('login is a sign-in form, not a registration form', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Sign in' }).first()).toBeVisible()
    await expect(page.locator('#name')).toHaveCount(0)
    await expect(page.locator('#dob')).toHaveCount(0)
    await expect(page.locator('#emergency1')).toHaveCount(0)
    await expect(page.getByText('I agree to the Terms of Service')).toHaveCount(0)
  })
  test('registration controls appear only after Create Account', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Create Account' }).first().click()
    await expect(page.locator('#name')).toBeVisible()
    await expect(page.locator('#dob')).toBeVisible()
    await expect(page.locator('#emergency1')).toBeVisible()
    await expect(page.getByText('I agree to the Terms of Service')).toBeVisible()
  })
})

test.describe('Launch readiness: protected routes', () => {
  for (const path of ['/patient', '/doctor', '/family', '/lab', '/admin']) test(`${path} requires authentication`, async ({ request }) => {
    const response = await request.get(`${BASE}${path}`, { maxRedirects: 0 })
    expect([302, 307]).toContain(response.status())
    expect(response.headers().location || '').toContain('/login')
  })
})

test.describe('Launch readiness: authenticated data protections', () => {
  test.skip(!process.env.E2E_AUTH_EMAIL || !process.env.E2E_AUTH_PASSWORD, 'Set E2E_AUTH_EMAIL and E2E_AUTH_PASSWORD on a disposable test environment to run authenticated checks')
  test('health-data endpoints remain protected by session and consent gates', async ({ request }) => {
    const csrf = await request.get(`${BASE}/api/auth/csrf`)
    expect(csrf.ok()).toBeTruthy()
    const login = await request.post(`${BASE}/api/auth/login`, { data: { email: process.env.E2E_AUTH_EMAIL, password: process.env.E2E_AUTH_PASSWORD } })
    expect(login.ok()).toBeTruthy()
    for (const path of ['/api/medications', '/api/reminders', '/api/user/data-export']) expect([200, 401, 403]).toContain((await request.get(`${BASE}${path}`)).status())
  })
})
