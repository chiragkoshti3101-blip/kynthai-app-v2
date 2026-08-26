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
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
    await StatusBar.setBackgroundColor({ color: '#f9fdfb' }).catch(() => {})
  } catch {
    /* plugin optional */
  }

  try {
    const { App } = await import('@capacitor/app')
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        // Resume: web layer may re-check due doses / push subscription
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
