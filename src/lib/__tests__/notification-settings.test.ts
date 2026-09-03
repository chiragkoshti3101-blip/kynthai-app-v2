import { describe, expect, it } from 'vitest'
import { browserNotificationSettingsUrl } from '../push'

describe('browser notification settings recovery', () => {
  it.each([
    ['Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36', 'chrome://settings/content/notifications'],
    ['Mozilla/5.0 Edg/140.0.0.0 Chrome/140.0.0.0 Safari/537.36', 'edge://settings/content/notifications'],
    ['Mozilla/5.0 Firefox/142.0', 'about:preferences#privacy'],
    ['Mozilla/5.0 Safari/605.1.15', null],
  ])('maps %s to the correct recovery surface', (userAgent, expected) => {
    expect(browserNotificationSettingsUrl(userAgent)).toBe(expected)
  })

  it('returns null when no browser user agent is available', () => {
    expect(browserNotificationSettingsUrl('')).toBeNull()
  })
})
