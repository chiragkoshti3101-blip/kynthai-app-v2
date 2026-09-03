'use client'

/**
 * Web Push client helpers.
 * - Reuses the existing service worker (do not re-register a second /sw.js)
 * - CSRF on subscribe + unsubscribe
 * - Clear failure modes (no VAPID, denied, iOS not installed as PWA)
 */

import { isNativeShell } from '@/lib/native-shell'
import { nativePushPermission, registerFcmDevice } from '@/lib/fcm'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const VAPID_SYNC_STORAGE_KEY = 'kynthai.push.vapid-key.v1'

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
  if (typeof window === 'undefined') return false
  // Capacitor apps use APNs (iPhone) or FCM (Android), not the browser
  // ServiceWorker/PushManager APIs. Treat the native plugin as the capability.
  if (isNativeShell()) return true
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** True when the current browser is an iPhone/iPad browser. */
export function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** iOS Safari only delivers web push for home-screen (standalone) PWAs. */
export function isIosStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (!isIosDevice()) return true // not iOS → treat as fine for this check
  const standalone =
    ('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true) ||
    window.matchMedia('(display-mode: standalone)').matches
  return standalone
}

export function permissionState(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied'
  return Notification.permission
}

/**
 * Return the browser's notification settings surface when it exposes one.
 * Internal browser URLs may still be blocked by the browser; callers should
 * always keep an in-app recovery message as the fallback.
 */
export function browserNotificationSettingsUrl(userAgent?: string): string | null {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  if (/Edg\//i.test(ua)) return 'edge://settings/content/notifications'
  if (/Firefox\//i.test(ua)) return 'about:preferences#privacy'
  if (/Chrome\//i.test(ua) || /CriOS\//i.test(ua)) return 'chrome://settings/content/notifications'
  return null
}

export function openBrowserNotificationSettings(): boolean {
  if (typeof window === 'undefined') return false
  const url = browserNotificationSettingsUrl()
  if (!url) return false
  try {
    return Boolean(window.open(url, '_blank', 'noopener,noreferrer'))
  } catch {
    return false
  }
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
      `/sw-v3.js?v=${encodeURIComponent(pageVersion)}`,
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

function needsVapidResubscribe(): boolean {
  if (!VAPID_PUBLIC_KEY) return false
  try {
    return localStorage.getItem(VAPID_SYNC_STORAGE_KEY) !== VAPID_PUBLIC_KEY
  } catch {
    // If storage is unavailable, prefer a fresh subscription over retaining a
    // registration that may have been created under an older VAPID key.
    return true
  }
}

function markVapidSynchronized(): void {
  if (!VAPID_PUBLIC_KEY) return
  try {
    localStorage.setItem(VAPID_SYNC_STORAGE_KEY, VAPID_PUBLIC_KEY)
  } catch {
    /* best-effort; the next authenticated visit will retry */
  }
}

async function serverSubscriptionIsRegistered(sub: PushSubscription): Promise<boolean | null> {
  try {
    const token = await csrfToken()
    const res = await fetch('/api/notifications/subscribe/status', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-CSRF-Token': token } : {}),
      },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    })
    const data = await res.json().catch(() => ({}))
    return typeof data.registered === 'boolean' ? data.registered : null
  } catch {
    // A failed health check should not interrupt a working browser
    // subscription; VAPID rotation still uses the local marker below.
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
  if (isNativeShell()) {
    const registered = await registerFcmDevice()
    if (registered) return { ok: true }
    const permission = await nativePushPermission()
    return {
      ok: false,
      reason: permission === 'denied' ? 'denied' : 'subscribe_failed',
      message:
        permission === 'denied'
          ? 'Notifications are blocked. Allow notifications for Kynthai in the phone settings, then try again.'
          : 'Kynthai could not register this phone for push notifications. Sign in and try again.',
    }
  }

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
    const currentKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    const serverRegistered = sub ? await serverSubscriptionIsRegistered(sub) : null
    const shouldResubscribe = Boolean(
      sub && (needsVapidResubscribe() || serverRegistered === false),
    )
    let previousEndpoint: string | undefined

    if (shouldResubscribe && sub) {
      // Browsers do not consistently expose the subscription's
      // applicationServerKey. A one-time per-device rotation is safer than
      // trusting that introspection: it replaces subscriptions created under
      // an older VAPID key without deleting other devices on the account.
      previousEndpoint = sub.endpoint
      try {
        await sub.unsubscribe()
      } catch {
        /* best-effort; a new subscription below may still succeed */
      }
      sub = null
    }

    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: currentKey as BufferSource,
        })
      } catch {
        return {
          ok: false,
          reason: 'subscribe_failed',
          message: shouldResubscribe
            ? 'Could not refresh your notification subscription. Try again while signed in.'
            : 'Browser could not create a push subscription.',
        }
      }
    }

    const stored = await storeSubscription(sub, previousEndpoint)
    if (!stored) {
      return {
        ok: false,
        reason: 'store_failed',
        message: 'Could not save the subscription to your account. Try again while signed in.',
      }
    }
    markVapidSynchronized()
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

async function storeSubscription(
  sub: PushSubscription,
  previousEndpoint?: string,
): Promise<boolean> {
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
        previousEndpoint: previousEndpoint ?? null,
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

