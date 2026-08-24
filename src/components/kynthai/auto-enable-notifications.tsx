'use client'

/**
 * After sign-in: ensure THIS device is subscribed for in-app system notifications
 * (doctor, lab, caretaker, patient — same path). Email is only a backup if push
 * cannot reach the device.
 */

import * as React from 'react'
import {
  enablePushDetailed,
  permissionState,
  pushSupported,
  isIosStandalone,
} from '@/lib/push'

const KEY = 'kynthai.push.auto-asked.v3'

export function AutoEnableNotifications() {
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    if (!pushSupported()) return

    const run = async () => {
      await new Promise((r) => setTimeout(r, 900))

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

        // Always re-subscribe when already granted so doctor/lab/caretaker
        // devices stay registered after login (fresh endpoint on server).
        if (permissionState() === 'granted') {
          await enablePushDetailed()
          return
        }

        try {
          if (localStorage.getItem(KEY) === '1') return
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
