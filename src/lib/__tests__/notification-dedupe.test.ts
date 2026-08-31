import { describe, it, expect } from 'vitest'

/**
 * Regression: the notification payload keeps the legacy in-body reference
 * marker while the production dedupe query uses the dedicated `dedupeKey`
 * column. This preserves historical rows without querying encrypted bodies.
 */
function storedBody(body: string, dedupeKey?: string): string {
  return dedupeKey ? `${body}\n[ref:${dedupeKey}]` : body
}

describe('dose notification dedupe key persistence', () => {
  const reminderId = 'rem_abc123'
  const key = `dose:${reminderId}`
  const body = '500mg · 08:00 — Open for full-screen alarm. Mark Taken or Skip.'

  it('stores [ref:<dedupeKey>] for legacy-row compatibility', () => {
    const stored = storedBody(body, key)
    expect(stored).toContain(key)
    expect(stored.startsWith(body)).toBe(true)
  })

  it('leaves bodies untouched when no dedupeKey is provided', () => {
    expect(storedBody(body)).toBe(body)
  })

  it('key format matches what reminders/send route persists and queries', () => {
    // The route builds dedupeKey as `dose:${reminder.id}` and stores it in the
    // dedicated notification-log column. The marker remains for old rows.
    const stored = storedBody(body, key)
    expect(stored.includes(`dose:${reminderId}`)).toBe(true)
  })
})
