import { describe, expect, it } from 'vitest'
import { getDemoNotifications } from '../demo-notifications'

describe('demo notification fixtures', () => {
  it.each([
    ['patient', 3, 2],
    ['caretaker', 3, 2],
    ['doctor', 3, 2],
    ['lab', 2, 2],
    ['admin', 2, 2],
  ])('%s has the expected rows and unread count', (role, rowCount, unreadCount) => {
    const rows = getDemoNotifications(role, Date.UTC(2026, 0, 1))

    expect(rows).toHaveLength(rowCount)
    expect(rows.filter((row) => !row.read)).toHaveLength(unreadCount)
    expect(new Set(rows.map((row) => row.id)).size).toBe(rowCount)
    expect(rows.every((row) => row.channel === 'app' && row.status === 'sent')).toBe(true)
  })

  it('falls back to the patient fixture for unknown roles', () => {
    expect(getDemoNotifications('unknown', 0).map((row) => row.id)).toEqual([
      'demo-patient-1',
      'demo-patient-2',
      'demo-patient-3',
    ])
  })
})
