import { describe, expect, it } from 'vitest'
import { safeNotificationPreview } from '../notification-privacy'

describe('notification privacy previews', () => {
  it('removes medication names, doses, times, and member names from reminders', () => {
    const preview = safeNotificationPreview({
      type: 'reminder_escalation',
      title: 'Robert missed Atorvastatin',
      body: 'Atorvastatin 10mg at 8:00 AM',
    })

    expect(preview.title).toBe('Medication reminder')
    expect(preview.body).not.toMatch(/Robert|Atorvastatin|10mg|8:00/i)
    expect(preview.isEmergency).toBe(false)
  })

  it('keeps emergency classification without exposing SOS details', () => {
    const preview = safeNotificationPreview({
      type: 'emergency_sos',
      title: 'SOS for Emma Wilson',
      body: 'Fall reported at home; call +1 555 0100',
    })

    expect(preview.title).toBe('Care safety alert')
    expect(preview.body).not.toMatch(/Emma|555|fall/i)
    expect(preview.isEmergency).toBe(true)
  })

  it('sanitizes legacy appointment and lab rows as well', () => {
    const appointment = safeNotificationPreview({
      type: 'appointment',
      title: 'Jordan Lee cancelled',
      body: 'Tomorrow at 10:00 AM',
    })
    const lab = safeNotificationPreview({
      type: 'lab_results',
      title: 'Results ready for Alex Rivera',
      body: 'Metabolic panel attached',
    })

    expect(appointment.body).not.toMatch(/Jordan|10:00/i)
    expect(lab.body).not.toMatch(/Alex|metabolic|attached/i)
  })
})
