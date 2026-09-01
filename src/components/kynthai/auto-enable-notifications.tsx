'use client'

/**
 * After sign-in: ensure THIS device is subscribed for system notifications
 * (patient, family, doctor, lab). Email is only a backup if push cannot reach the device.
 *
 * Android APK: also relies on MainActivity POST_NOTIFICATIONS runtime prompt.
 */

import * as React from 'react'
import {
  enablePushDetailed,
  permissionState,
  pushSupported,
  isIosStandalone,
} from '@/lib/push'
import { isNativeShell } from '@/lib/native-shell'
import { registerFcmDevice } from '@/lib/fcm'

const KEY = 'kynthai.push.auto-asked.v4'

export function AutoEnableNotifications() {
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const native = isNativeShell()
    if (!native && !pushSupported()) return

    let disposed = false
    const onAuthReady = () => {
      if (native && !disposed) void registerFcmDevice()
    }
    if (native) window.addEventListener('kynthai:auth-ready', onAuthReady)

    const run = async () => {
      // Slight delay so UI mounts first; keep short so permission prompt appears early
      await new Promise((r) => setTimeout(r, 600))
      if (disposed) return

      // iPhone browser tab cannot get system push — only Home Screen app.
      // A native iPhone build uses APNs and is already a standalone app.
      if (!native && !isIosStandalone()) return

      try {
        if (native) {
          await registerFcmDevice()
          return
        }
        if (permissionState() === 'denied') {
          try {
            localStorage.setItem(KEY, '1')
          } catch {
            /* ignore */
          }
          return
        }

        // Already allowed → re-subscribe so doctor/lab/caretaker stay registered
        if (permissionState() === 'granted') {
          await enablePushDetailed()
          return
        }

        // Ask once per device. Native shells were handled above using the
        // platform push plugin; browser/PWA keeps the Web Push flow below.
        try {
          if (!native && localStorage.getItem(KEY) === '1') return
        } catch {
          /* ignore */
        }

        const result = await enablePushDetailed()
        if (result.ok || result.reason === 'denied' || result.reason === 'ios_needs_install') {
          try {
            localStorage.setItem(KEY, '1')
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    }

    void run()
    return () => {
      disposed = true
      if (native) window.removeEventListener('kynthai:auth-ready', onAuthReady)
    }
  }, [])

  return null
}
