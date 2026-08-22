'use client'

/**
 * Web Push client helpers.
 * - Reuses the existing service worker (do not re-register a second /sw.js)
 * - CSRF on subscribe + unsubscribe
 * - Clear failure modes (no VAPID, denied, iOS not installed as PWA)
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

export type PushEnableResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'unsupported'
        | 'no_vapid'
        | 'denied'
        | 'ios_needs_install'
        | 'subscribe_failed'
        | 'store_failed'
        | 'unknown'
      message: string
    }

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** iOS Safari only delivers web push for home-screen (standalone) PWAs. */
export function isIosStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (!isIOS) return true // not iOS → treat as fine for this check
  const standalone =
    ('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true) ||
    window.matchMedia('(display-mode: standalone)').matches
  return standalone
}

export function permissionState(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied'
  return Notification.permission
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    // Prefer an existing registration (from ServiceWorkerRegister)
    const existing = await navigator.serviceWorker.getRegistration('/')
    if (existing) {
      await navigator.serviceWorker.ready
      return existing
    }
    const pageVersion =
      typeof document !== 'undefined'
        ? document.documentElement.dataset.deployVersion || '1'
        : '1'
    const reg = await navigator.serviceWorker.register(
      `/sw.js?v=${encodeURIComponent(pageVersion)}`,
      { scope: '/', updateViaCache: 'none' },
    )
    await navigator.serviceWorker.ready
    return reg
  } catch {
    return null
  }
}

async function csrfToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/csrf', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    return typeof data.token === 'string' ? data.token : null
  } catch {
    return null
  }
}

/**
 * Register SW (if needed), request permission, subscribe, store on server.
 */
export async function enablePush(): Promise<boolean> {
  const result = await enablePushDetailed()
  return result.ok
}

export async function enablePushDetailed(): Promise<PushEnableResult> {
  if (!pushSupported()) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Push notifications are not supported in this browser.',
    }
  }
  if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.length < 20) {
    return {
      ok: false,
      reason: 'no_vapid',
      message: 'Push is not configured on the server yet (missing VAPID keys).',
    }
  }
  if (!isIosStandalone()) {
    return {
      ok: false,
      reason: 'ios_needs_install',
      message:
        'On iPhone, add Kynthai to your Home Screen first, then open it from there and enable notifications.',
    }
  }

  try {
    const reg = await getRegistration()
    if (!reg) {
      return {
        ok: false,
        reason: 'subscribe_failed',
        message: 'Could not register the service worker.',
      }
    }

    let perm = Notification.permission
    if (perm === 'default') {
      perm = await Notification.requestPermission()
    }
    if (perm !== 'granted') {
      return {
        ok: false,
        reason: 'denied',
        message:
          perm === 'denied'
            ? 'Notifications are blocked. Enable them in your browser or phone settings for kynthai.app.'
            : 'Permission was not granted.',
      }
    }

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        })
      } catch {
        return {
          ok: false,
          reason: 'subscribe_failed',
          message: 'Browser could not create a push subscription.',
        }
      }
    }

    const stored = await storeSubscription(sub)
    if (!stored) {
      return {
        ok: false,
        reason: 'store_failed',
        message: 'Could not save the subscription to your account. Try again while signed in.',
      }
    }
    return { ok: true }
  } catch {
    return {
      ok: false,
      reason: 'unknown',
      message: 'Something went wrong enabling notifications.',
    }
  }
}

/** Unsubscribe locally + remove server records (CSRF required). */
export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/')
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      try {
        await sub.unsubscribe()
      } catch {
        /* best-effort */
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const token = await csrfToken()
    await fetch('/api/notifications/subscribe', {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-CSRF-Token': token } : {}),
      },
    })
  } catch {
    /* best-effort */
  }
}

async function storeSubscription(sub: PushSubscription): Promise<boolean> {
  try {
    const token = await csrfToken()
    const json = sub.toJSON()
    const res = await fetch('/api/notifications/subscribe', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-CSRF-Token': token } : {}),
      },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
        expirationTime: json.expirationTime ?? null,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
