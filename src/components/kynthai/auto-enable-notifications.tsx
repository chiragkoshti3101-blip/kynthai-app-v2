'use client'

/**
 * Once per browser profile after sign-in: request system notification
 * permission and store a Web Push subscription so OLX/Zomato-style banners
 * (app name + message) work when the app is backgrounded or closed.
 */

import * as React from 'react'
import { enablePushDetailed, permissionState, pushSupported, isIosStandalone } from '@/lib/push'

const KEY = 'kynthai.push.auto-asked.v2'

export function AutoEnableNotifications() {
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    if (!pushSupported()) return
    try {
      if (localStorage.getItem(KEY) === '1') return
    } catch {
      return
    }

    const run = async () => {
      // Small delay so portal chrome is visible before the OS prompt
      await new Promise((r) => setTimeout(r, 1800))
      try {
        if (permissionState() === 'denied') {
          localStorage.setItem(KEY, '1')
          return
        }
        if (!isIosStandalone()) {
          // iPhone Safari tab: cannot get system push — skip prompt spam
          return
        }
        const result = await enablePushDetailed()
        if (result.ok || result.reason === 'denied' || result.reason === 'ios_needs_install') {
          localStorage.setItem(KEY, '1')
        }
      } catch {
        /* ignore */
      }
    }

    void run()
  }, [])

  return null
}
