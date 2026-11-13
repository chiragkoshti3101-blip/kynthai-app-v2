import { test, expect } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

test.describe('QA payments (Stripe keys absent)', () => {
  test('QA-PAY-001 webhook rejects missing signature with 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/stripe/webhook`, {
      data: '{}',
      headers: { 'content-type': 'application/json' },
    })
    if (res.status() === 503) {
      expect(await res.json()).toMatchObject({ error: expect.stringMatching(/not configured/i) })
      return
    }
    expect(res.status()).toBe(400)
  })

  test('QA-PAY-002 webhook rejects bad signature with 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/stripe/webhook`, {
      data: '{"id":"evt_test"}',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=fake',
      },
    })
    if (res.status() === 503) {
      test.info().annotations.push({
        type: 'not-tested',
        description: 'Stripe not configured — signature path blocked',
      })
      return
    }
    expect(res.status()).toBe(400)
  })

  test('QA-PAY-003 POST /api/payments unauthenticated → 401', async ({ request }) => {
    const res = await request.post(`${BASE}/api/payments`, {
      data: { amount: 100 },
      headers: { 'content-type': 'application/json' },
    })
    expect([401, 403]).toContain(res.status())
  })
})
