export interface DemoNotification {
  id: string
  channel: 'app'
  type: string
  title: string
  body: string
  status: 'sent'
  createdAt: string
  read: boolean
}

/**
 * Deterministic, read-only notification data for seeded demo accounts.
 *
 * Keep this fixture independent of the database so the notification center
 * and /api/notifications expose the same role-specific rows and unread count.
 * The caller may provide a timestamp to keep tests and renders reproducible.
 */
export function getDemoNotifications(role: string | undefined, now = Date.now()): DemoNotification[] {
  const normalizedRole = (role || 'patient').toLowerCase()
  const at = (offsetMs: number) => new Date(now - offsetMs).toISOString()

  if (normalizedRole === 'doctor') {
    return [
      {
        id: 'demo-doctor-1',
        channel: 'app',
        type: 'appointment',
        title: 'New consultation request',
        body: 'A patient consultation request is available.',
        status: 'sent',
        createdAt: at(0),
        read: false,
      },
      {
        id: 'demo-doctor-2',
        channel: 'app',
        type: 'appointment',
        title: 'Patient cancelled',
        body: 'An appointment was cancelled.',
        status: 'sent',
        createdAt: at(60 * 60 * 1000),
        read: false,
      },
      {
        id: 'demo-doctor-3',
        channel: 'app',
        type: 'system',
        title: 'Welcome, Doctor',
        body: 'New consult requests appear here and as device alerts when enabled.',
        status: 'sent',
        createdAt: at(2 * 60 * 60 * 1000),
        read: true,
      },
    ]
  }

  if (normalizedRole === 'lab') {
    return [
      {
        id: 'demo-lab-1',
        channel: 'app',
        type: 'lab',
        title: 'New lab booking',
        body: 'A lab booking needs review.',
        status: 'sent',
        createdAt: at(0),
        read: false,
      },
      {
        id: 'demo-lab-2',
        channel: 'app',
        type: 'lab',
        title: 'Results ready to share',
        body: 'A lab result is ready to review.',
        status: 'sent',
        createdAt: at(60 * 60 * 1000),
        read: false,
      },
    ]
  }

  if (normalizedRole === 'admin') {
    return [
      {
        id: 'demo-admin-1',
        channel: 'app',
        type: 'system',
        title: 'Platform health check',
        body: 'Notification routing and delivery diagnostics are available in Admin.',
        status: 'sent',
        createdAt: at(0),
        read: false,
      },
      {
        id: 'demo-admin-2',
        channel: 'app',
        type: 'alert',
        title: 'Review queue update',
        body: 'High-priority operational items are ready for review.',
        status: 'sent',
        createdAt: at(60 * 60 * 1000),
        read: false,
      },
    ]
  }

  if (normalizedRole === 'caretaker' || normalizedRole === 'family') {
    return [
      {
        id: 'demo-caretaker-1',
        channel: 'app',
        type: 'family',
        title: 'Missed dose alert',
        body: 'A family member missed a scheduled dose.',
        status: 'sent',
        createdAt: at(0),
        read: false,
      },
      {
        id: 'demo-caretaker-2',
        channel: 'app',
        type: 'reminder',
        title: 'Upcoming reminder',
        body: 'A family medication reminder is scheduled.',
        status: 'sent',
        createdAt: at(30 * 60 * 1000),
        read: false,
      },
      {
        id: 'demo-caretaker-3',
        channel: 'app',
        type: 'family',
        title: 'Dose taken',
        body: 'A family member marked a scheduled dose as taken.',
        status: 'sent',
        createdAt: at(2 * 60 * 60 * 1000),
        read: true,
      },
    ]
  }

  return [
    {
      id: 'demo-patient-1',
      channel: 'app',
      type: 'reminder',
      title: 'Medication reminder',
      body: 'A scheduled medication reminder is available.',
      status: 'sent',
      createdAt: at(0),
      read: false,
    },
    {
      id: 'demo-patient-2',
      channel: 'app',
      type: 'appointment',
      title: 'Consultation confirmed',
      body: 'Your consultation was confirmed.',
      status: 'sent',
      createdAt: at(60 * 60 * 1000),
      read: false,
    },
    {
      id: 'demo-patient-3',
      channel: 'app',
      type: 'lab',
      title: 'Lab results ready',
      body: 'A lab result is ready to review.',
      status: 'sent',
      createdAt: at(2 * 60 * 60 * 1000),
      read: true,
    },
  ]
}
