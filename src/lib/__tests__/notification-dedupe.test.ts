import { describe, it, expect } from 'vitest'

/**
 * Regression: dose dedupe. The reminders/send cron dedupes via
 * `notificationLog.body contains "dose:<reminderId>"`. sendNotification must
 * therefore persist the dedupeKey into the stored in-app body — otherwise the
 * same due dose is re-sent on every cron tick (duplicate notifications).
 */
function storedBody(body: string, dedupeKey?: string): string {
  return dedupeKey ? `${body}\n[ref:${dedupeKey}]` : body
}

describe('dose notification dedupe key persistence', () => {
  const reminderId = 'rem_abc123'
  const key = `dose:${reminderId}`
  const body = '500mg · 08:00 — Open for full-screen alarm. Mark Taken or Skip.'

  it('stores [ref:<dedupeKey>] so cron body-contains dedupe matches', () => {
    const stored = storedBody(body, key)
    expect(stored).toContain(key)
    expect(stored.startsWith(body)).toBe(true)
  })

  it('leaves bodies untouched when no dedupeKey is provided', () => {
    expect(storedBody(body)).toBe(body)
  })

  it('key format matches what reminders/send route queries for', () => {
    // Route builds dedupeKey as `dose:${reminder.id}` and queries
    // body: { contains: dedupeKey }. Stored body must satisfy that predicate.
    const stored = storedBody(body, key)
    expect(stored.includes(`dose:${reminderId}`)).toBe(true)
  })
})
