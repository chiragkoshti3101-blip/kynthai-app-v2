/**
 * Native OS alarms + on-device notification inbox.
 * When running inside Capacitor Android/iOS:
 *  - schedules exact local notifications (high priority)
 *  - stores a persistent notification history on device
 * Web-only: no-ops safely.
 */

'use client'

export type NativeAlarmInput = {
  id: number
  title: string
  body: string
  at: Date
  medName?: string
  extra?: Record<string, string>
}

export type StoredNotification = {
  id: string
  title: string
  body: string
  createdAt: string
  read: boolean
  type: string
}

function isNative(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    return !!(w.Capacitor?.isNativePlatform?.() || w.Capacitor?.isNative === true)
  } catch {
    return false
  }
}

/** Request notification + exact-alarm permissions (Android 13+). */
export async function ensureNativeNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !isNative()) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const p = await Notification.requestPermission()
      return p === 'granted'
    }
    return typeof Notification !== 'undefined' && Notification.permission === 'granted'
  }
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const cur = await LocalNotifications.checkPermissions()
    if (cur.display === 'granted') return true
    const req = await LocalNotifications.requestPermissions()
    return req.display === 'granted'
  } catch {
    return false
  }
}

/**
 * Schedule a dose/emergency alarm at an absolute time.
 * On Android (native shell) this uses a high-importance channel so the OS
 * can show a full-screen intent style interrupt.
 */
export async function scheduleNativeAlarm(input: NativeAlarmInput): Promise<void> {
  await ensureNativeNotificationPermission()
  await appendStoredNotification({
    id: `sched-${input.id}`,
    title: input.title,
    body: input.body,
    createdAt: new Date().toISOString(),
    read: false,
    type: 'reminder',
  })

  if (!isNative()) return

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')

    // High-importance channel for dose alarms (Android)
    try {
      await LocalNotifications.createChannel({
        id: 'kynthai_dose_alarm',
        name: 'Medication alarms',
        description: 'Full-priority dose and emergency alarms',
        importance: 5, // IMPORTANCE_HIGH
        visibility: 1,
        sound: 'beep.wav',
        vibration: true,
      })
    } catch {
      /* channel may already exist */
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: input.id,
          title: input.title,
          body: input.body,
          schedule: { at: input.at, allowWhileIdle: true },
          channelId: 'kynthai_dose_alarm',
          extra: {
            medName: input.medName || '',
            alarm: '1',
            ...input.extra,
          },
          actionTypeId: 'DOSE_ALARM',
          sound: 'beep.wav',
          smallIcon: 'ic_stat_icon',
        },
      ],
    })
  } catch (e) {
    console.warn('[native-alarms] schedule failed', e)
  }
}

export async function cancelNativeAlarm(id: number): Promise<void> {
  if (!isNative()) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.cancel({ notifications: [{ id }] })
  } catch {
    /* ignore */
  }
}

export async function cancelAllNativeAlarms(): Promise<void> {
  if (!isNative()) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) })
    }
  } catch {
    /* ignore */
  }
}

const HISTORY_KEY = 'kynthai.device.notification.history'

/** Persist notification on device (survives app kill; local to phone). */
export async function appendStoredNotification(n: StoredNotification): Promise<void> {
  try {
    const list = await getStoredNotifications()
    const next = [n, ...list.filter((x) => x.id !== n.id)].slice(0, 100)
    if (isNative()) {
      const { Preferences } = await import('@capacitor/preferences')
      await Preferences.set({ key: HISTORY_KEY, value: JSON.stringify(next) })
    } else {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    }
  } catch {
    /* ignore */
  }
}

export async function getStoredNotifications(): Promise<StoredNotification[]> {
  try {
    if (isNative()) {
      const { Preferences } = await import('@capacitor/preferences')
      const { value } = await Preferences.get({ key: HISTORY_KEY })
      return value ? (JSON.parse(value) as StoredNotification[]) : []
    }
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? (JSON.parse(raw) as StoredNotification[]) : []
  } catch {
    return []
  }
}

export async function markStoredRead(id?: string): Promise<void> {
  const list = await getStoredNotifications()
  const next = list.map((n) => (id ? (n.id === id ? { ...n, read: true } : n) : { ...n, read: true }))
  try {
    if (isNative()) {
      const { Preferences } = await import('@capacitor/preferences')
      await Preferences.set({ key: HISTORY_KEY, value: JSON.stringify(next) })
    } else {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    }
  } catch {
    /* ignore */
  }
}

/** Listen for notification taps → open full-screen alarm route. */
export async function bindNativeNotificationOpen(
  onAlarm: (payload: { title?: string; body?: string; medName?: string }) => void,
): Promise<() => void> {
  if (!isNative()) return () => {}
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const sub = await LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
      const extra = (e.notification.extra || {}) as Record<string, string>
      onAlarm({
        title: e.notification.title,
        body: e.notification.body,
        medName: extra.medName || e.notification.title,
      })
      void appendStoredNotification({
        id: `tap-${e.notification.id}-${Date.now()}`,
        title: e.notification.title || 'Kynthai',
        body: e.notification.body || '',
        createdAt: new Date().toISOString(),
        read: false,
        type: 'reminder',
      })
    })
    return () => {
      void sub.remove()
    }
  } catch {
    return () => {}
  }
}

export function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false
  return isNative()
}
