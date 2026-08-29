'use client'

/**
 * Visible prompt when notification permission is still "default".
 * Complements AutoEnableNotifications (which may fail silently in WebView).
 */

import * as React from 'react'
import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  enablePushDetailed,
  permissionState,
  pushSupported,
  isIosStandalone,
} from '@/lib/push'
import { isNativeShell } from '@/lib/native-shell'
import { openNativeNotificationSettings } from '@/lib/native-alarms'

const DISMISS = 'kynthai.notif-banner.dismiss.v1'

export function NotificationPermissionBanner() {
  const [show, setShow] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    if (!pushSupported()) return
    // Session dismiss applies to EVERY variant (incl. the iOS hint below) —
    // "Later" must silence the strip for the whole session.
    try {
      if (sessionStorage.getItem(DISMISS) === '1') return
    } catch {
      /* ignore */
    }
    if (!isIosStandalone()) {
      setShow(true)
      setMsg('iPhone: Share → Add to Home Screen, open from the icon, then allow notifications.')
      return
    }
    const perm = permissionState()
    if (perm === 'granted') return
    if (perm === 'denied') {
      setMsg(
        isNativeShell()
          ? 'Notifications are blocked. Settings → Apps → Kynthai → Notifications → Allow, then reopen the app.'
          : 'Notifications are blocked for this site. Enable them in browser site settings, then tap again.',
      )
      setShow(true)
      return
    }
    setMsg('Allow notifications so medication, doctor, and lab alerts reach this phone — even when the app is closed.')
    setShow(true)
  }, [])

  if (!show) return null

  const onEnable = async () => {
    setBusy(true)
    try {
      // If already denied on Android native, open system settings (allowNoti=false cannot be fixed by prompt alone)
      if (permissionState() === 'denied' && isNativeShell()) {
        const opened = await openNativeNotificationSettings()
        if (opened) {
          setMsg('Turn Notifications ON for Kynthai, then return here.')
          return
        }
      }
      const result = await enablePushDetailed()
      if (result.ok) {
        setShow(false)
        return
      }
      if (isNativeShell()) {
        await openNativeNotificationSettings()
        setMsg(result.message || 'Enable notifications in system settings, then reopen the app.')
        return
      }
      setMsg(result.message)
    } finally {
      setBusy(false)
    }
  }

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS, '1')
    } catch {
      /* ignore */
    }
    setShow(false)
  }

  return (
    <div
      className="mx-3 mb-2 rounded-xl border border-amber-500/40 bg-amber-50/95 p-3 shadow-sm dark:bg-amber-950/40"
      role="status"
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-600 text-white">
          <Bell className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-foreground">Turn on notifications</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{msg}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="min-h-11 gap-1.5" disabled={busy} onClick={() => void onEnable()}>
              <Bell className="h-3.5 w-3.5" />
              {busy ? 'Requesting…' : 'Allow notifications'}
            </Button>
            <Button size="sm" variant="ghost" className="min-h-11" onClick={dismiss}>
              Later
            </Button>
          </div>
        </div>
        <button type="button" aria-label="Dismiss" className="rounded-md p-1 text-muted-foreground" onClick={dismiss}>
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
