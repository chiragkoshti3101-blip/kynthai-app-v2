/**
 * QA: registration-adjacent flows — forgot / reset with mock-email token capture.
 * Requires local Postgres + seeded demo user with bcrypt password (prisma/seed.js).
 */
import { test, expect } from '@playwright/test'
import { DEMO_ACCOUNTS } from './helpers'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const IS_PROD = BASE.includes('kynthai.app')
const CRON = process.env.CRON_SECRET || ''

test.describe('QA auth recovery', () => {
  test.skip(IS_PROD, 'writes reset tokens — local ephemeral DB only')

  test('QA-AUTH-004 forgot → capture token → reset → login with new password', async ({
    request,
  }) => {
    test.skip(!CRON, 'CRON_SECRET required to read email-capture endpoint')

    const email = DEMO_ACCOUNTS.patient.email
    const newPassword = 'Qa-Reset-Pass9!'

    const csrfRes = await request.get(`${BASE}/api/auth/csrf`)
    const { token: csrf } = (await csrfRes.json()) as { token: string }

    const forgot = await request.post(`${BASE}/api/auth/forgot-password`, {
      data: { email },
      headers: { 'x-csrf-token': csrf, 'content-type': 'application/json' },
    })
    expect(forgot.status()).toBeLessThan(500)

    const capture = await request.get(`${BASE}/api/system/email-capture?to=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${CRON}` },
    })
    expect(capture.status()).toBe(200)
    const capBody = (await capture.json()) as {
      emails?: { resetToken?: string | null }[]
    }
    const resetToken = capBody.emails?.[capBody.emails.length - 1]?.resetToken
    expect(resetToken, 'mock email must expose reset token for QA').toBeTruthy()

    const csrf2 = await request.get(`${BASE}/api/auth/csrf`)
    const { token: csrfB } = (await csrf2.json()) as { token: string }
    const reset = await request.post(`${BASE}/api/auth/reset-password`, {
      data: { token: resetToken, password: newPassword },
      headers: { 'x-csrf-token': csrfB, 'content-type': 'application/json' },
    })
    expect(reset.status()).toBe(200)

    const login = await request.post(`${BASE}/api/auth/login`, {
      data: { email, password: newPassword, timezone: 'UTC' },
      headers: { 'x-csrf-token': csrfB, 'content-type': 'application/json' },
    })
    expect(login.status()).toBe(200)

    // Restore demo password so other specs keep working
    await request.post(`${BASE}/api/auth/forgot-password`, {
      data: { email },
      headers: { 'x-csrf-token': csrfB, 'content-type': 'application/json' },
    })
    const cap2 = await request.get(`${BASE}/api/system/email-capture?to=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${CRON}` },
    })
    const token2 = (
      (await cap2.json()) as { emails?: { resetToken?: string | null }[] }
    ).emails?.slice(-1)[0]?.resetToken
    const csrf3 = await request.get(`${BASE}/api/auth/csrf`)
    const { token: csrfC } = (await csrf3.json()) as { token: string }
    await request.post(`${BASE}/api/auth/reset-password`, {
      data: { token: token2, password: DEMO_ACCOUNTS.patient.password },
      headers: { 'x-csrf-token': csrfC, 'content-type': 'application/json' },
    })
  })
})
