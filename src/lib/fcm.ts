/**
 * Native push registration for the Android/iPhone Capacitor shell.
 *
 * Android's Capacitor registration event contains an FCM token. iOS's
 * registration event contains an APNs device token (a 64-character hex
 * string), not an FCM token. Keep the transport type explicit so the server
 * never tries to send an APNs token through Firebase.
 *
 * The browser/PWA continues to use Web Push from src/lib/push.ts.
 */

'use client'

import { isNativeShell } from '@/lib/native-shell'

type NativePushType = 'fcm' | 'apns'
type NativePushPermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

type PushNotificationsPlugin = {
  checkPermissions: () => Promise<{ receive?: string }>
  requestPermissions: () => Promise<{ receive?: string }>
  register: () => Promise<void>
  addListener: (event: string, callback: (value: any) => void) => Promise<{ remove: () => Promise<void> }>
  unregister?: () => Promise<void>
  getToken?: () => Promise<{ value: string } | null>
}

let registrationInFlight: Promise<boolean> | null = null
let listenersAttached = false
let lastPostedToken = ''
let lastNativeToken = ''
let lastNativeType: NativePushType = 'fcm'

function nativePushType(): NativePushType {
  try {
    const capacitor = (window as Window & {
      Capacitor?: { getPlatform?: () => string }
    }).Capacitor
    return capacitor?.getPlatform?.() === 'ios' ? 'apns' : 'fcm'
  } catch {
    return 'fcm'
  }
}

function normaliseToken(token: string): string {
  return token.trim().replace(/\s+/g, '')
}

function safeInternalUrl(value: unknown): string {
  if (typeof value !== 'string' || !value) return '/patient'
  try {
    const parsed = new URL(value, window.location.origin)
    if (parsed.origin !== window.location.origin) return '/patient'
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/patient'
  } catch {
    return '/patient'
  }
}

/**
 * POST one native token to the authenticated session. The API intentionally
 * requires the WebView session; accepting an arbitrary email here would allow
 * anyone who knows that email to attach a device to the account.
 */
async function postTokenToServer(token: string, type: NativePushType): Promise<boolean> {
  const value = normaliseToken(token)
  if (!value || value.length < 20) return false

  const key = `${type}:${value}`

  try {
    const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' })
    const csrfData = await csrfRes.json().catch(() => ({}))
    const csrfToken = typeof csrfData.token === 'string' ? csrfData.token : ''
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken

    const res = await fetch('/api/notifications/fcm-register', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ token: value, type }),
    })
    if (!res.ok) return false
    lastPostedToken = key
    return true
  } catch {
    return false
  }
}

async function getStoredAndroidToken(): Promise<string | null> {
  try {
    const { registerPlugin } = await import('@capacitor/core')
    const DoseAlarm = registerPlugin<{
      getFcmToken: () => Promise<{ token: string | null; found: boolean }>
    }>('DoseAlarm')
    const result = await DoseAlarm.getFcmToken()
    return result.found && result.token ? result.token : null
  } catch {
    return null
  }
}

/** Used by the native settings UI without relying on browser Notification.permission. */
export async function nativePushPermission(): Promise<NativePushPermission> {
  if (typeof window === 'undefined' || !isNativeShell()) return 'unsupported'
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    const result = await (PushNotifications as unknown as PushNotificationsPlugin).checkPermissions()
    const state = String(result.receive || '').toLowerCase()
    if (state === 'granted') return 'granted'
    if (state === 'prompt') return 'prompt'
    return 'denied'
  } catch {
    return 'unsupported'
  }
}

function attachNativeListeners(
  PushNotifications: PushNotificationsPlugin,
  type: NativePushType,
): void {
  if (listenersAttached) return
  listenersAttached = true

  void PushNotifications.addListener('registration', (event: { value?: string }) => {
    if (event?.value) {
      lastNativeToken = normaliseToken(event.value)
      lastNativeType = type
      void postTokenToServer(event.value, type).then((ok) => {
        if (ok) console.log('[native-push] device registered')
      })
    }
  })

  void PushNotifications.addListener('registrationError', (event: { error?: string }) => {
    console.warn('[native-push] registration failed', event?.error || 'unknown error')
  })

  // The Capacitor plugin retains a tap event until this listener is consumed,
  // including a cold-start tap. Keep the URL internal before navigating.
  void PushNotifications.addListener('pushNotificationActionPerformed', (event: any) => {
    try {
      const data = (event?.notification?.data || {}) as Record<string, unknown>
      const url = safeInternalUrl(data.url)
      window.dispatchEvent(new CustomEvent('kynthai:push-open', { detail: { url } }))
      if (url && url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.location.assign(url)
      }
    } catch {
      /* notification taps must never crash the shell */
    }
  })
}

/**
 * Stop push on this native device and remove only this device's server record.
 * The server deliberately scopes deletion by the verified session and token;
 * disabling push on one phone must not disable a user's other phones.
 */
export async function unregisterNativePushDevice(): Promise<void> {
  if (typeof window === 'undefined' || !isNativeShell()) return
  const type = nativePushType()
  let token = lastNativeToken
  if (type === 'fcm' && !token) token = (await getStoredAndroidToken()) || ''

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    await (PushNotifications as unknown as PushNotificationsPlugin).unregister?.()
  } catch {
    /* best-effort; server deletion below keeps the account accurate */
  }

  if (token) {
    try {
      await fetch('/api/notifications/fcm-register', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, type: lastNativeType || type }),
      })
    } catch {
      /* best-effort; a later provider response will prune invalid tokens */
    }
  }
  lastPostedToken = ''
  lastNativeToken = ''
}

/**
 * Register the current native device. This is safe to call repeatedly: the
 * listener setup is one-time, while a failed pre-login request can retry after
 * the user signs in and receives a session cookie.
 */
export async function registerFcmDevice(): Promise<boolean> {
  if (typeof window === 'undefined' || !isNativeShell()) return false
  if (registrationInFlight) return registrationInFlight

  registrationInFlight = (async () => {
    const type = nativePushType()

    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      const plugin = PushNotifications as unknown as PushNotificationsPlugin
      attachNativeListeners(plugin, type)

      let permission = await plugin.checkPermissions()
      if (String(permission.receive || '').toLowerCase() !== 'granted') {
        permission = await plugin.requestPermissions().catch(() => ({ receive: 'denied' }))
        if (String(permission.receive || '').toLowerCase() !== 'granted') return false
      }

      await plugin.register()

      // A registration event may have arrived before the user signed in. Re-post
      // the cached token to bind this same physical device to the new session;
      // this also covers iOS, where there is no Java-side token fallback.
      if (lastNativeToken && lastNativeType === type) {
        await postTokenToServer(lastNativeToken, type)
      }

      // Android MainActivity persists the token if the remote page loaded before
      // the Capacitor bridge. Read it as a second path; iOS is delivered through
      // the APNs registration event above.
      if (type === 'fcm') {
        const stored = await getStoredAndroidToken()
        if (stored) {
          lastNativeToken = normaliseToken(stored)
          lastNativeType = type
          await postTokenToServer(stored, type)
        }
        const cached = await plugin.getToken?.()
        if (cached?.value) {
          lastNativeToken = normaliseToken(cached.value)
          lastNativeType = type
          await postTokenToServer(cached.value, type)
        }
      }

      // Registration events are delivered asynchronously after register(). A
      // granted permission plus successful register call is enough to report a
      // healthy native setup; the event handler performs the authenticated POST.
      return true
    } catch {
      // Android fallback for a bridge that exposes the custom plugin but not the
      // Capacitor push plugin yet. iOS has no safe token fallback here.
      if (type === 'fcm') {
        const stored = await getStoredAndroidToken()
        if (stored) {
          lastNativeToken = normaliseToken(stored)
          lastNativeType = type
          return postTokenToServer(stored, type)
        }
      }
      return false
    }
  })()

  try {
    return await registrationInFlight
  } finally {
    registrationInFlight = null
  }
}
