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
  try {
    const { registerFcmDevice } = await import('@/lib/fcm')
    void registerFcmDevice()
  } catch {
    /* FCM not configured yet — existing Web Push + native alarm path stays */
  }

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
