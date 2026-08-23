'use client'

/**
 * CEO rule: a pure web user must never be silent.
 * Push may be unavailable (desktop Safari, denied permission, not installed).
 * This banner explains the stack: system push when possible + email always for doses.
 */

import * as React from 'react'
import { Bell, Mail, Smartphone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { enablePushDetailed, permissionState, pushSupported } from '@/lib/push'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'kynthai.web-alerts-banner.dismissed'

export function WebAlertsBanner({ className }: { className?: string }) {
  const { toast } = useToast()
  const [visible, setVisible] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return
      const perm = permissionState()
      // Show when push is missing or denied — email is still the safety net
      if (!pushSupported() || perm !== 'granted') {
        setVisible(true)
      }
    } catch {
      setVisible(true)
    }
  }, [])

  if (!visible) return null

  const onEnable = async () => {
    setBusy(true)
    try {
      const result = await enablePushDetailed()
      if (result.ok) {
        setVisible(false)
        toast({
          title: 'Alerts enabled',
          description: 'You will get dose reminders on this device and by email.',
        })
      } else {
        toast({
          title: 'Could not enable device alerts',
          description:
            result.message ||
            'Email reminders still run for due doses. Add Kynthai to your home screen on iPhone for system push.',
          variant: 'destructive',
        })
      }
    } finally {
      setBusy(false)
    }
  }

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setVisible(false)
  }

  return (
    <div
      className={cn(
        'mx-3 mb-2 rounded-xl border border-emerald-500/30 bg-emerald-50/90 dark:bg-emerald-950/40 p-3 shadow-sm',
        className,
      )}
      role="status"
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <Bell className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-foreground">Never miss a dose — even in the browser</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <Mail className="h-3 w-3" /> Email
            </span>{' '}
            is always used for due medications when the app is closed.
            Device push works best if you enable notifications
            {pushSupported() ? '' : ' (not supported in this browser)'}. On iPhone, add Kynthai to your{' '}
            <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
              <Smartphone className="h-3 w-3" /> Home Screen
            </span>
            .
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {pushSupported() && permissionState() !== 'granted' && (
              <Button size="sm" className="h-9" disabled={busy} onClick={() => void onEnable()}>
                Enable device alerts
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-9" onClick={dismiss}>
              Got it
            </Button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          onClick={dismiss}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
