'use client'

/**
 * Install path:
 * - Android: Download official APK (native shell → better closed-app notifications)
 * - iOS: Add to Home Screen (App Store path comes later)
 * - Also supports Chrome beforeinstallprompt when available
 */

import * as React from 'react'
import { Download, Share, Smartphone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'kynthai.install-banner.dismissed'
const APK_URL = '/downloads/kynthai-android.apk'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return true
  const mq = window.matchMedia('(display-mode: standalone)').matches
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true
  // Capacitor native shell
  const cap =
    typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
      ?.isNativePlatform === 'function' &&
    (window as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor.isNativePlatform()
  return mq || ios || !!cap
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallAppBanner({ className }: { className?: string }) {
  const [visible, setVisible] = React.useState(false)
  const [ios, setIos] = React.useState(false)
  const [android, setAndroid] = React.useState(false)
  const deferred = React.useRef<BeforeInstallPromptEvent | null>(null)

  React.useEffect(() => {
    try {
      if (isStandalone()) return
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return
      setIos(isIos())
      setAndroid(isAndroid())
      setVisible(true)
    } catch {
      /* ignore */
    }

    const onBip = (e: Event) => {
      e.preventDefault()
      deferred.current = e as BeforeInstallPromptEvent
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  if (!visible) return null

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setVisible(false)
  }

  const installPwa = async () => {
    const ev = deferred.current
    if (!ev) return
    try {
      await ev.prompt()
      await ev.userChoice
      setVisible(false)
    } catch {
      /* dismissed */
    }
  }

  return (
    <div
      className={cn(
        'mx-3 mb-2 rounded-xl border border-teal-500/30 bg-teal-50/95 dark:bg-teal-950/50 p-3 shadow-sm',
        className,
      )}
      role="status"
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white">
          <Smartphone className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold">
            {android ? 'Download Kynthai for Android' : 'Install Kynthai on your phone'}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {android
              ? 'Official APK for reliable dose alerts, sound, and notifications when the app is closed.'
              : 'Best experience for dose alerts — install on your home screen and enable notifications.'}
          </p>

          {ios ? (
            <>
              <p className="text-xs text-foreground/90 leading-relaxed pt-0.5">
                Tap <Share className="inline h-3 w-3" /> <strong>Share</strong> →{' '}
                <strong>Add to Home Screen</strong> → Add. Open from the icon and allow notifications.
              </p>
              <Button size="sm" variant="ghost" className="h-9 mt-1" onClick={dismiss}>
                Got it
              </Button>
            </>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              {(android || !ios) && (
                <Button size="sm" className="h-9 gap-1.5" asChild>
                  <a href={APK_URL} download="Kynthai.apk">
                    <Download className="h-3.5 w-3.5" />
                    Download APK
                  </a>
                </Button>
              )}
              {deferred.current && (
                <Button size="sm" variant="secondary" className="h-9 gap-1.5" onClick={() => void installPwa()}>
                  Install (Chrome)
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-9" onClick={dismiss}>
                Later
              </Button>
            </div>
          )}
          {android && (
            <p className="text-[11px] text-muted-foreground pt-1 leading-relaxed">
              After download: open the file → Install → Allow notifications. If blocked, enable
              “Install unknown apps” for your browser.
            </p>
          )}
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
