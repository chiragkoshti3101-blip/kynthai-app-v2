/**
 * Native FCM push registration for the Android/iOS shell.
 *
 * On native platforms this obtains a device push token via
 * Firebase Cloud Messaging and registers it with the Kynthai server,
 * so the server cron can deliver reminders straight to the OS even
 * when the app process is dead — the same channel Zomato,
 * Swiggy and Flipkart use.
 *
 * Safe no-op on pure web (which keeps using the existing Web Push path).
 */

'use client'

import { isNativeShell } from '@/lib/native-shell'
import { requestNativeNotificationPermission } from '@/lib/native-alarms'

let registered = false

/**
 * POST the FCM token to the server.
 * Called both by the PushNotifications listener AND by the native
 * DoseAlarm plugin's onMessage handler (which stores the token
 * in SharedPreferences when the web bridge hasn't loaded yet).
 */
async function postTokenToServer(token: string): Promise<boolean> {
  if (!token || token.length < 20) return false
  try {
    const res = await fetch('/api/notifications/fcm-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function registerFcmDevice(): Promise<boolean> {
  if (typeof window === 'undefined' || registered) return false
  if (!isNativeShell()) return false
  registered = true

  // Path 1: try the Capacitor PushNotifications plugin (works when bridge is ready)
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    const perm = await PushNotifications.checkPermissions()
    if (perm.receive !== 'granted') {
      const asked = await requestNativeNotificationPermission()
      if (!asked) {
        const req = await PushNotifications.requestPermissions().catch(() => null)
        if (!req || req.receive !== 'granted') {
          return false
        }
      }
    }

    await PushNotifications.register()

    const tokenHandler = async (e: { value: string }) => {
      const ok = await postTokenToServer(e.value)
      if (ok) console.log('[fcm] token registered')
    }
    PushNotifications.addListener('registration', tokenHandler)
    const cached = await (PushNotifications as unknown as {
      getToken?: () => Promise<{ value: string } | null>
    }).getToken?.()
    if (cached?.value) await postTokenToServer(cached.value)

    // Forward taps into the same alarm path as local notifications.
    PushNotifications.addListener('pushNotificationActionPerformed', (n) => {
      try {
        const extra = (n.notification?.data || {}) as Record<string, unknown>
        const url = (extra.url as string) || '/patient'
        window.dispatchEvent(
          new CustomEvent('kynthai:push-open', { detail: { url } }),
        )
      } catch {
        /* ignore */
      }
    })

    return true
  } catch {
    // Path 2: PushNotifications plugin failed — check if the native Java layer
    // stored a token in SharedPreferences via DoseAlarm plugin.
    // This handles the case where the web bridge isn't ready yet (remote URL load).
    try {
      const { registerPlugin } = await import('@capacitor/core')
      const DoseAlarm = registerPlugin<{ getFcmToken: () => Promise<{ token: string | null; found: boolean }> }>('DoseAlarm')
      const result = await DoseAlarm.getFcmToken()
      if (result.found && result.token) {
        const ok = await postTokenToServer(result.token)
        if (ok) console.log('[fcm] token registered via native fallback')
        return ok
      }
    } catch {
      /* ignore */
    }
    console.warn('[fcm] registration skipped — no bridge or token')
    return false
  }
}
