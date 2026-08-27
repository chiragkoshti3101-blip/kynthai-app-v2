/**
 * Native FCM push registration for the Android/iOS shell.
 *
 * On native platforms this obtains a device push token via
 * @capacitor/push-notifications (Firebase Cloud Messaging) and registers it
 * with the Kynthai server, so the server cron can deliver reminders straight
 * to the OS even when the app process is dead — the same channel Zomato,
 * Swiggy and Flipkart use.
 *
 * Safe no-op on pure web (which keeps using the existing Web Push path).
 */

'use client'

import { isNativeShell } from '@/lib/native-shell'
import { requestNativeNotificationPermission } from '@/lib/native-alarms'

let registered = false

export async function registerFcmDevice(): Promise<boolean> {
  if (typeof window === 'undefined' || registered) return false
  if (!isNativeShell()) return false
  registered = true

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    const perm = await PushNotifications.checkPermissions()
    if (perm.receive !== 'granted') {
      // Android 13+ requires the notification permission before FCM can deliver.
      const asked = await requestNativeNotificationPermission()
      if (!asked) {
        const req = await PushNotifications.requestPermissions().catch(() => null)
        if (!req || req.receive !== 'granted') {
          // Permission denied — FCM tokens cannot be minted. Web layer will
          // surface the in-app "enable notifications" prompt instead.
          return false
        }
      }
    }

    await PushNotifications.register()

    const tokenHandler = (e: { value: string }) => {
      const token = e.value
      if (!token) return
      void fetch('/api/notifications/fcm-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => {})
    }
    PushNotifications.addListener('registration', tokenHandler)
    const cached = await (PushNotifications as unknown as {
      getToken?: () => Promise<{ value: string } | null>
    }).getToken?.()
    if (cached?.value) tokenHandler(cached)

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
  } catch (e) {
    // FCM not configured yet (missing google-services.json) — keep the app
    // fully functional on the existing Web Push + native alarm path.
    console.warn('[fcm] registration skipped', e)
    return false
  }
}
