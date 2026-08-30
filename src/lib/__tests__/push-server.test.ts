import { describe, expect, it } from 'vitest'
import { shouldPrunePushSubscription } from '../push-server'

describe('push subscription cleanup policy', () => {
  it('prunes expired or endpoint-invalid registrations', () => {
    expect(shouldPrunePushSubscription({ statusCode: 404 })).toBe(true)
    expect(shouldPrunePushSubscription({ statusCode: 410 })).toBe(true)
    expect(
      shouldPrunePushSubscription({
        statusCode: 400,
        body: JSON.stringify({ reason: 'BadDeviceToken' }),
      }),
    ).toBe(true)
    expect(
      shouldPrunePushSubscription({
        statusCode: 400,
        body: JSON.stringify({ reason: 'VapidPkHashMismatch' }),
      }),
    ).toBe(true)
    expect(
      shouldPrunePushSubscription({ code: 'messaging/registration-token-not-registered' }),
    ).toBe(true)
  })

  it('does not delete registrations for global sender or payload errors', () => {
    expect(
      shouldPrunePushSubscription({
        statusCode: 400,
        body: JSON.stringify({ reason: 'BadVapidPublicKey' }),
      }),
    ).toBe(false)
    expect(
      shouldPrunePushSubscription({
        statusCode: 403,
        body: JSON.stringify({ reason: 'BadJwtToken' }),
      }),
    ).toBe(false)
    expect(
      shouldPrunePushSubscription({
        statusCode: 400,
        body: JSON.stringify({ reason: 'BadAuthorizationHeader' }),
      }),
    ).toBe(false)
    expect(
      shouldPrunePushSubscription({
        statusCode: 413,
        body: JSON.stringify({ reason: 'PayloadTooLarge' }),
      }),
    ).toBe(false)
    expect(shouldPrunePushSubscription({ statusCode: 400 })).toBe(false)
  })
})
