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
import { requestNativeNotificationPermission } from '@/lib/native-alarms'

const KEY = 'kynthai.push.auto-asked.v4'

export function AutoEnableNotifications() {
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    if (!pushSupported()) return

    const run = async () => {
      // Slight delay so UI mounts first; keep short so permission prompt appears early
      await new Promise((r) => setTimeout(r, 600))

      // iPhone browser tab cannot get system push — only Home Screen app
      if (!isIosStandalone()) return

      try {
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

        // Ask once per device (unless native shell — always try so APK users get the OS dialog)
        const native = isNativeShell()
        if (native) {
          try {
            await requestNativeNotificationPermission()
          } catch { /* ignore */ }
        }
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
  }, [])

  return null
}
