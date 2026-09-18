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
  openBrowserNotificationSettings,
} from '@/lib/push'
import { isNativeShell } from '@/lib/native-shell'
import {
  openNativeNotificationSettings,
  canScheduleExactAlarms,
  openExactAlarmSettings,
  canUseFullScreenIntent,
  openFullScreenIntentSettings,
} from '@/lib/native-alarms'
import { nativePushPermission } from '@/lib/fcm'

const DISMISS = 'kynthai.notif-banner.dismiss.v1'

export function NotificationPermissionBanner() {
  const [show, setShow] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)
  const [alarmActive, setAlarmActive] = React.useState(false)
  // Android special accesses that decide whether a dose alarm fires exactly
  // and can take over the lock screen. They are granted outside the app, so
  // the only useful action is to deep-link the user to the right screen.
  const [capIssue, setCapIssue] = React.useState<'exact' | 'fullscreen' | null>(null)

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const update = (event?: Event) => {
      const activeFromEvent = (event as CustomEvent<{ active?: unknown }> | undefined)?.detail?.active
      setAlarmActive(
        typeof activeFromEvent === 'boolean'
          ? activeFromEvent
          : document.documentElement.dataset.kynthaiAlarmActive === 'true',
      )
    }
    update()
    window.addEventListener('kynthai:alarm-state', update)
    return () => window.removeEventListener('kynthai:alarm-state', update)
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const native = isNativeShell()
    if (!native && !pushSupported()) return
    // Session dismiss applies to EVERY variant (incl. the iOS hint below) —
    // "Later" must silence the strip for the whole session.
    try {
      if (sessionStorage.getItem(DISMISS) === '1') return
    } catch {
      /* ignore */
    }
    if (!native && !isIosStandalone()) {
      setShow(true)
      setMsg('iPhone: Share → Add to Home Screen, open from the icon, then allow notifications.')
      return
    }
    if (native) {
      void nativePushPermission().then(async (perm) => {
        if (perm !== 'granted') {
          setMsg(
            perm === 'denied'
              ? 'Notifications are blocked. Open phone settings for Kynthai and turn Notifications on.'
              : 'Allow notifications so medication, doctor, and lab alerts reach this phone even when Kynthai is closed.',
          )
          setShow(true)
          return
        }
        // Permission is granted — but on Android a dose alarm can still be
        // silently degraded. Android 12/12L needs "Alarms & reminders" for an
        // exact alarm (otherwise Doze delays it); Android 14+ needs full-screen
        // notifications for the alarm to take over a locked phone.
        if (!(await canScheduleExactAlarms())) {
          setCapIssue('exact')
          setMsg(
            'Turn on Alarms & reminders for Kynthai so dose reminders arrive on time instead of being delayed.',
          )
          setShow(true)
          return
        }
        if (!(await canUseFullScreenIntent())) {
          setCapIssue('fullscreen')
          setMsg(
            'Turn on full-screen notifications for Kynthai so a dose alarm can wake the screen when the phone is locked.',
          )
          setShow(true)
        }
      })
      return
    }
    const perm = permissionState()
    if (perm === 'granted') return
    if (perm === 'denied') {
      setMsg(
        'Notifications are blocked for this site. Open site settings, allow notifications for kynthai.app, then return here.',
      )
      setShow(true)
      return
    }
    setMsg('Allow notifications so medication, doctor, and lab alerts reach this phone — even when the app is closed.')
    setShow(true)
  }, [])

  if (!show || alarmActive) return null

  const onEnable = async () => {
    setBusy(true)
    try {
      // A degraded Android capability is fixed in a system settings screen,
      // not by re-requesting the notification permission.
      if (capIssue === 'exact') {
        const opened = await openExactAlarmSettings()
        setMsg(
          opened
            ? 'Turn on Alarms & reminders for Kynthai, then return here.'
            : 'Open Settings, choose Apps, Kynthai, Alarms & reminders, and allow it.',
        )
        return
      }
      if (capIssue === 'fullscreen') {
        const opened = await openFullScreenIntentSettings()
        setMsg(
          opened
            ? 'Turn on full-screen notifications for Kynthai, then return here.'
            : 'Open Settings, choose Apps, Kynthai, Full-screen notifications, and allow it.',
        )
        return
      }
      // A denied browser permission cannot be repaired by another prompt. Open
      // the browser settings surface instead of pretending the request worked.
      if (!isNativeShell() && permissionState() === 'denied') {
        const opened = openBrowserNotificationSettings()
        setMsg(
          opened
            ? 'Allow notifications for kynthai.app in the browser settings, then return here and try again.'
            : 'Use the site controls icon beside the address bar to allow notifications for kynthai.app, then try again.',
        )
        return
      }
      // If already denied on a native build, open system settings (a denied
      // OS permission cannot be fixed by a browser prompt).
      if (isNativeShell() && (await nativePushPermission()) === 'denied') {
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
              {busy
                ? 'Requesting…'
                : capIssue
                  ? 'Open settings'
                  : !isNativeShell() && permissionState() === 'denied'
                    ? 'Open site settings'
                    : 'Allow notifications'}
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
