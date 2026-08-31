/**
 * User-facing notification preview policy.
 *
 * Clinical and family notifications may contain medication names, doses,
 * patient/member names, appointment times, or result details. Those details
 * must not appear in notification previews. The destination screen can load
 * authorized detail after the user opens the app.
 */

export interface NotificationPreviewInput {
  type?: unknown
  title?: unknown
  body?: unknown
}

export interface SafeNotificationPreview {
  title: string
  body: string
  isEmergency: boolean
}

function normalizedType(type: unknown, title: unknown, body: unknown): string {
  const value = `${String(type ?? '')} ${String(title ?? '')} ${String(body ?? '')}`.toLowerCase()
  if (/sos|emerg|safety|critical/.test(value)) return 'alert'
  if (/remind|medication|dose|medicine/.test(value)) return 'reminder'
  if (/appoint|consult/.test(value)) return 'appointment'
  if (/lab|booking|result|report/.test(value)) return 'lab'
  if (/family|invite|care|member/.test(value)) return 'family'
  if (/achieve|streak|milestone/.test(value)) return 'achievement'
  if (/system|account|security/.test(value)) return 'system'
  return 'system'
}

/**
 * Replace potentially identifying clinical/care details with a useful but
 * generic preview. This is intentionally applied at both API and UI layers
 * so old rows and demo fixtures receive the same protection.
 */
export function safeNotificationPreview(input: NotificationPreviewInput): SafeNotificationPreview {
  const kind = normalizedType(input.type, input.title, input.body)

  switch (kind) {
    case 'alert':
      return {
        title: 'Care safety alert',
        body: 'An important care alert needs your attention. Open Kynthai to review it.',
        isEmergency: /sos|emerg|escalat|safety|critical/i.test(
          `${String(input.type ?? '')} ${String(input.title ?? '')} ${String(input.body ?? '')}`,
        ),
      }
    case 'reminder':
      return {
        title: 'Medication reminder',
        body: 'A scheduled medication reminder is available. Open Meds to review it.',
        isEmergency: false,
      }
    case 'appointment':
      return {
        title: 'Appointment update',
        body: 'An appointment update is available. Open Care to review it.',
        isEmergency: false,
      }
    case 'lab':
      return {
        title: 'Lab update',
        body: 'A lab update is available. Open Lab to review it.',
        isEmergency: false,
      }
    case 'family':
      return {
        title: 'Family care update',
        body: 'A family care update is available. Open Care to review it.',
        isEmergency: false,
      }
    case 'achievement':
      return {
        title: 'Progress update',
        body: 'You have a new progress update in Kynthai.',
        isEmergency: false,
      }
    default:
      return {
        title: 'Kynthai update',
        body: 'There is an account or product update to review.',
        isEmergency: false,
      }
  }
}
