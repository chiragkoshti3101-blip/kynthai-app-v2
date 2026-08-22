'use client'

import * as React from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  enablePushDetailed,
  disablePush,
  permissionState,
  pushSupported,
  isIosStandalone,
} from '@/lib/push'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

/**
 * Enable / disable browser push for the current device.
 * Shows actionable errors (iOS install, denied, missing VAPID).
 */
export function PushNotificationToggle({ className }: { className?: string }) {
  const { toast } = useToast()
  const [enabled, setEnabled] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [hint, setHint] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!pushSupported()) {
      setHint('Not supported in this browser')
      return
    }
    if (!isIosStandalone()) {
      setHint('iPhone: Add to Home Screen, then open the app to enable push')
      return
    }
    setEnabled(permissionState() === 'granted')
  }, [])

  const onToggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (enabled) {
        await disablePush()
        setEnabled(false)
        setHint(null)
        toast({ title: 'Notifications off on this device' })
      } else {
        const result = await enablePushDetailed()
        if (result.ok) {
          setEnabled(true)
          setHint(null)
          toast({ title: 'Notifications enabled', description: 'You will get alerts on this device.' })
        } else {
          setHint(result.message)
          toast({
            title: 'Could not enable notifications',
            description: result.message,
            variant: 'destructive',
          })
        }
      }
    } finally {
      setBusy(false)
    }
  }

  if (!pushSupported()) {
    return (
      <p className={cn('text-xs text-muted-foreground', className)}>
        Push notifications are not available in this browser.
      </p>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Button
        type="button"
        variant={enabled ? 'default' : 'outline'}
        size="sm"
        className="min-h-11 w-full justify-center gap-2 sm:w-auto"
        disabled={busy}
        onClick={() => void onToggle()}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : enabled ? (
          <Bell className="h-4 w-4" />
        ) : (
          <BellOff className="h-4 w-4" />
        )}
        {enabled ? 'Notifications on' : 'Enable notifications'}
      </Button>
      {hint && <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>}
    </div>
  )
}
