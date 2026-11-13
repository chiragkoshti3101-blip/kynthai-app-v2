import { describe, expect, it } from 'vitest'
import {
  privacySafeEscalationPushData,
  privacySafeReminderPushData,
} from '@/lib/push-payload-privacy'

describe('push payload privacy (KYN-HIGH-008)', () => {
  it('omits medication names from reminder push data', () => {
    const data = privacySafeReminderPushData(
      { scheduledTime: '08:00', medName: 'Atorvastatin', dosage: '10mg' },
      { reminderId: 'r1', medicationId: 'm1' },
    )
    expect(JSON.stringify(data)).not.toMatch(/Atorvastatin|10mg/i)
    expect(data).toMatchObject({ reminderId: 'r1', medicationId: 'm1', type: 'reminder' })
    expect(String(data.url)).not.toMatch(/med=/i)
  })

  it('omits medication names from escalation push data', () => {
    const data = privacySafeEscalationPushData('user-2')
    expect(JSON.stringify(data)).not.toMatch(/mg|statin/i)
  })
})
