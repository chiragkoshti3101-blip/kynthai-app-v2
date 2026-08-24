/**
 * Native OS alarms + on-device notification history.
 * Android APK: DoseAlarm plugin → full-screen intent over other apps.
 * iOS: local notifications (time-sensitive); true full-screen takeover is not allowed by Apple.
 * Web: no-op for OS full-screen; uses Web Push + in-app overlay.
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

function getPlatform(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).Capacitor?.getPlatform?.() || 'web'
  } catch {
    return 'web'
  }
}

export async function ensureNativeNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!isNative()) {
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
 * Schedule a dose alarm at absolute time.
 * Android native: exact AlarmManager + full-screen intent (covers whole phone).
 * iOS native: high-priority local notification (Apple blocks full-screen over other apps).
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

  const platform = getPlatform()

  // Android: custom full-screen dose plugin
  if (platform === 'android') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Cap = (window as any).Capacitor
      const DoseAlarm = Cap?.Plugins?.DoseAlarm
      if (DoseAlarm?.schedule) {
        await DoseAlarm.schedule({
          id: input.id,
          title: input.title,
          body: input.body,
          atMs: input.at.getTime(),
        })
        return
      }
    } catch (e) {
      console.warn('[native-alarms] DoseAlarm plugin failed, falling back', e)
    }
  }

  // iOS (and Android fallback): Capacitor local notifications
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    try {
      await LocalNotifications.createChannel({
        id: 'kynthai_dose_alarm_v2',
        name: 'Medication reminders',
        description: 'Dose and emergency alarms with sound',
        importance: 5,
        visibility: 1,
        sound: platform === 'ios' ? undefined : 'beep.wav',
        vibration: true,
      } as any)
    } catch {
      /* exists */
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
          // iOS: omit custom name so system default alert plays (invalid file = silent)
          // Android: beep.wav in res/raw
          ...(platform === 'ios' ? {} : { sound: 'beep.wav' }),
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DoseAlarm = (window as any).Capacitor?.Plugins?.DoseAlarm
    if (DoseAlarm?.cancel) await DoseAlarm.cancel({ id })
  } catch {
    /* ignore */
  }
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
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      })
    }
  } catch {
    /* ignore */
  }
}

const HISTORY_KEY = 'kynthai.device.notification.history'

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

/** True only on Android native APK — OS may show full-screen over other apps. */
export function supportsOsFullScreenAlarm(): boolean {
  return isNative() && getPlatform() === 'android'
}
