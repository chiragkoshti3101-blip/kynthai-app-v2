'use client'

/**
 * Capacitor community plugin bootstrap for the APK / iOS shell.
 * Safe no-op on pure web.
 */

import { isNativeShell } from '@/lib/native-shell'

let bootstrapped = false

export async function bootstrapNativeShell(): Promise<void> {
  if (typeof window === 'undefined' || bootstrapped) return
  if (!isNativeShell()) return
  bootstrapped = true

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    // Match the status bar + system UI to the active theme so there is
    // never a light strip above dark content (or vice-versa) in the shell.
    const dark =
      (typeof window !== 'undefined' &&
        document.documentElement.classList.contains('dark')) ||
      (typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-color-scheme: dark)').matches)
    const bg = dark ? '#070f0c' : '#f9fdfb'
    await StatusBar.setStyle({ style: dark ? Style.Light : Style.Dark }).catch(() => {})
    await StatusBar.setBackgroundColor({ color: bg }).catch(() => {})
  } catch {
    /* plugin optional */
  }

  try {
    const { App } = await import('@capacitor/app')
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        // Resume: re-arm native alarms (Android cancels them on force-stop)
        // and notify the web layer to re-check due doses / push subscription.
        try {
          import('@/lib/native-alarms').then(m => m.restoreNativeAlarms()).catch(() => {})
        } catch { /* ignore */ }
        try {
          window.dispatchEvent(new CustomEvent('kynthai:app-resume'))
        } catch {
          /* ignore */
        }
      }
    })
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back()
      }
    })
  } catch {
    /* plugin optional */
  }

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') {
      const after = await LocalNotifications.requestPermissions()
      if (after.display !== 'granted') {
        try {
          window.dispatchEvent(new CustomEvent('kynthai:notifications-denied'))
        } catch { /* ignore */ }
      }
    }
    // Android notification channel for clinical alerts
    await LocalNotifications.createChannel({
      id: 'kynthai_clinical',
      name: 'Clinical alerts',
      description: 'Medication, doctor, and lab alerts',
      importance: 5,
      visibility: 1,
      sound: 'med_chime',
      vibration: true,
    }).catch(() => {})
  } catch {
    /* plugin optional */
  }

  // Native FCM device token registration — delivers reminders straight to the
  // OS even when the app process is dead (Zomato/Swiggy-class channel).
  // Retry with delays: the Capacitor bridge takes a few seconds to inject
  // into a remote-loaded page (server.url mode).
  const attemptFcm = async (attempt: number): Promise<void> => {
    try {
      const { registerFcmDevice } = await import('@/lib/fcm')
      const ok = await registerFcmDevice()
      if (ok) {
        console.log('[native-shell] FCM registered on attempt', attempt)
        return
      }
    } catch {
      // module not available
    }
    if (attempt < 5) {
      await new Promise((r) => setTimeout(r, 3000)) // 3s between retries
      return attemptFcm(attempt + 1)
    }
  }
  // Fire and forget — first attempt at 5s (after bridge init), retries at 8s, 11s, 14s, 17s
  new Promise((r) => setTimeout(r, 5000)).then(() => attemptFcm(1))

  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    // Expose light haptic for Taken / Skip without importing everywhere
    ;(window as unknown as { __kynthaiHaptic?: () => void }).__kynthaiHaptic = () => {
      void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
    }
  } catch {
    /* optional */
  }
}
