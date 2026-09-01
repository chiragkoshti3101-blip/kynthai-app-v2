import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { Notification } from '@parse/node-apn'
import webpush from 'web-push'

export type PushPayload = {
  title: string
  body: string
  tag?: string
  url?: string
  medName?: string
  time?: string
  dosage?: string
  reminderId?: string
  medicationId?: string
  /** Additional non-visible metadata delivered to the client on tap. */
  data?: Record<string, string | undefined>
  /** Medication dose signal; separate from clinical priority (appointments/labs are clinical too). */
  dose?: boolean
  /** Clinical dose / emergency — max priority, short TTL */
  clinical?: boolean
}

/**
 * Send via Firebase Cloud Messaging to a native device token.
 * firebase-admin is lazy-loaded; absent credentials are reported as a failed
 * FCM delivery while any configured Web Push subscriptions continue normally.
 */
let _fcmMessaging: unknown = null
let _fcmChecked = false
function getFcmMessaging(): { send: (m: unknown) => Promise<{ messageId?: string }> } | null {
  if (_fcmChecked) return _fcmMessaging as never
  _fcmChecked = true
  try {
    if (typeof window !== 'undefined') return null
    const projectId = process.env.FIREBASE_PROJECT_ID
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
    if (!projectId || !clientEmail || !privateKey) return null
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = require('firebase-admin')
    // firebase-admin v14 API: top-level `cert` + `getApps()`; messaging resolves
    // from the `firebase-admin/messaging` submodule's getMessaging(app).
    const cert = admin.cert
    const apps = admin.getApps || (() => admin.apps ?? [])
    if (!apps().length) {
      admin.initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      })
    }
    const app = (admin.getApps()[0] || admin.getApp()) as unknown as ReturnType<
      typeof admin.initializeApp
    >
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('firebase-admin/messaging')
    const getMessaging = m.getMessaging || m.default?.getMessaging
    _fcmMessaging = getMessaging ? getMessaging(app) : null
  } catch {
    _fcmMessaging = null
  }
  return _fcmMessaging as never
}

type StringData = Record<string, string>

function stringData(value: unknown): StringData {
  if (!value || typeof value !== 'object') return {}
  const output: StringData = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string') output[key] = item
  }
  return output
}

async function sendFcm(token: string, message: string, isClinical: boolean): Promise<string> {
  const messaging = getFcmMessaging()
  if (!messaging) throw new Error('FCM is not configured')
  let parsed: { title?: string; body?: string; data?: Record<string, unknown> }
  try {
    parsed = JSON.parse(message)
  } catch {
    parsed = { title: 'Kynthai', body: message }
  }
  const result = await messaging.send({
    token,
    notification: { title: parsed.title || 'Kynthai', body: parsed.body || '' },
    android: {
      priority: isClinical ? 'high' : 'normal',
      notification: {
        channelId: 'kynthai_dose_alarm',
        sound: isClinical ? 'med_chime' : 'default',
        priority: isClinical ? 'high' : 'default',
      },
    },
    apns: {
      headers: { 'apns-priority': isClinical ? '10' : '5', 'apns-push-type': 'alert' },
      payload: { aps: { sound: 'default', 'content-available': 1 } },
    },
    // FCM rejects undefined/non-string data values. The push payload contains
    // optional fields, so strip those values before sending.
    data: stringData(parsed.data),
  })
  return result.messageId || 'fcm:accepted'
}

type ApnsProvider = {
  send: (
    notification: unknown,
    recipients: string | string[],
  ) => Promise<{
    sent: Array<{ device: string }>
    failed: Array<{
      device: string
      status?: number
      response?: { reason?: string; timestamp?: string }
      error?: Error
    }>
  }>
}

let _apnsProvider: ApnsProvider | null = null
let _apnsChecked = false

function apnsPrivateKey(value: string): string {
  const normalised = value.replace(/\\n/g, '\n').trim()
  if (normalised.includes('BEGIN PRIVATE KEY')) return normalised
  try {
    const decoded = Buffer.from(normalised, 'base64').toString('utf8').trim()
    if (decoded.includes('BEGIN PRIVATE KEY')) return decoded
  } catch {
    /* use the original value; node-apn will report a useful configuration error */
  }
  return normalised
}

/**
 * Lazily create one APNs provider per server process. APNs uses HTTP/2 and a
 * provider-authentication .p8 key; the key is read only from server env vars,
 * never from the client bundle or a request body.
 */
function getApnsProvider(): ApnsProvider | null {
  if (_apnsChecked) return _apnsProvider
  _apnsChecked = true

  const key = process.env.APNS_AUTH_KEY
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  if (!key || !keyId || !teamId) return null

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const apn = require('@parse/node-apn') as {
      Provider: new (options: unknown) => ApnsProvider
    }
    _apnsProvider = new apn.Provider({
      token: {
        key: apnsPrivateKey(key),
        keyId,
        teamId,
      },
      production: process.env.APNS_PRODUCTION !== 'false',
      // Avoid holding a request open indefinitely if Apple or the network is unavailable.
      requestTimeout: 8000,
      connectionRetryLimit: 2,
    })
  } catch {
    _apnsProvider = null
  }
  return _apnsProvider
}

async function sendApns(token: string, message: string, isClinical: boolean): Promise<string> {
  const provider = getApnsProvider()
  if (!provider) throw new Error('APNs is not configured')

  let parsed: {
    title?: string
    body?: string
    type?: string
    tag?: string
    url?: string
    data?: Record<string, unknown>
  }
  try {
    parsed = JSON.parse(message)
  } catch {
    parsed = { title: 'Kynthai', body: message }
  }

  // node-apn accepts the hex APNs device token returned by Capacitor on iOS.
  const note = new Notification()
  note.topic = process.env.APNS_BUNDLE_ID || 'app.kynthai.health'
  note.alert = {
    title: parsed.title || 'Kynthai',
    body: parsed.body || '',
  }
  note.sound = 'default'
  note.badge = 1
  note.priority = 10
  note.pushType = 'alert'
  note.expiry = Math.floor(Date.now() / 1000) + (isClinical ? 1800 : 3600)
  note.threadId = (parsed.tag || parsed.type || 'kynthai-notification').slice(0, 64)
  note.aps['interruption-level'] = isClinical ? 'time-sensitive' : 'active'
  note.contentAvailable = true
  note.payload = {
    ...stringData(parsed.data),
    url: parsed.url || stringData(parsed.data).url || (isClinical ? '/patient?alarm=1' : '/'),
    type: parsed.type || 'kynthai',
  }

  const result = await provider.send(note, token)
  if (result.sent.length > 0) return 'apns:accepted'

  const failure = result.failed[0]
  const reason = failure?.response?.reason || failure?.error?.message || 'APNs rejected notification'
  const error = new Error(reason) as Error & { statusCode?: number; body?: string }
  error.statusCode = failure?.status
  error.body = failure?.response ? JSON.stringify(failure.response) : undefined
  throw error
}

/**
 * Return true only for a device registration that cannot deliver again.
 *
 * Apple uses 400 for both malformed requests and invalid device tokens. A
 * generic 400 must not delete every user's subscription when the real issue is
 * a global VAPID key, JWT, or payload configuration. Prune only the
 * endpoint-specific reasons that mean this registration must be recreated.
 */
export function shouldPrunePushSubscription(error: unknown): boolean {
  const e = (error || {}) as { statusCode?: unknown; code?: unknown; body?: unknown; message?: unknown }
  const statusCode = typeof e.statusCode === 'number' ? e.statusCode : undefined
  const providerCode = typeof e.code === 'string' ? e.code : ''
  const providerBody = typeof e.body === 'string' ? e.body : ''
  const message = typeof e.message === 'string' ? e.message : ''
  const reason = `${providerCode} ${providerBody} ${message}`.toLowerCase()

  if (statusCode === 404 || statusCode === 410) return true
  if (providerCode === 'messaging/registration-token-not-registered') return true
  if (providerCode === 'messaging/invalid-registration-token') return true

  // Apple endpoint-specific invalidation reasons. Do not include BadJwtToken,
  // BadVapidPublicKey, BadAuthorizationHeader, or PayloadTooLarge: those are
  // sender/payload problems and deleting registrations would make them worse.
  return (
    reason.includes('baddevicetoken') ||
    reason.includes('vapidpkhashmismatch') ||
    reason.includes('subscriptionexpired') ||
    reason.includes('invalidsubscription') ||
    reason.includes('subscriptionnotfound') ||
    reason.includes('unregistered')
  )
}

/**
 * Instant push to all of a user's devices.
 * Clinical (dose) uses Urgency: high + short TTL so carriers deliver immediately
 * (same class of signal messaging apps use for priority traffic).
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const webPushConfigured = Boolean(publicKey && privateKey)

  try {
    if (webPushConfigured) {
      webpush.setVapidDetails('mailto:hello@kynthai.app', publicKey!, privateKey!)
    }

    const subs = await db.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, type: true, token: true, p256dh: true, auth: true },
    })
    // FIX #9: Return explicit status when no subscriptions exist
    if (subs.length === 0) {
      logger.info('[push] No subscriptions found for user', { userId })
      return { sent: 0, failed: 0 }
    }

    const isDose =
      payload.dose === true ||
      payload.tag === 'reminder' ||
      payload.tag === 'missed_dose' ||
      payload.tag === 'reminder_escalation' ||
      !!payload.reminderId
    const isClinical = payload.clinical === true || isDose || payload.tag === 'emergency'

    const message = JSON.stringify({
      title: payload.title || 'Kynthai',
      body: payload.body || '',
      tag: payload.tag || (isClinical ? 'kynthai-dose' : 'kynthai-notification'),
      type: isDose ? 'dose' : payload.tag || 'kynthai',
      url: payload.url || (isClinical ? '/patient?alarm=1' : '/'),
      medName: payload.medName,
      time: payload.time,
      dosage: payload.dosage,
      reminderId: payload.reminderId,
      medicationId: payload.medicationId,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      silent: false,
      requireInteraction: false, // SW applies platform rules
      clinical: isClinical,
      data: {
        ...(payload.data || {}),
        url: payload.url || (isClinical ? '/patient?alarm=1' : '/'),
        type: isDose ? 'dose' : payload.tag || 'kynthai',
        medName: payload.medName,
        time: payload.time,
        dosage: payload.dosage,
        reminderId: payload.reminderId,
        medicationId: payload.medicationId,
        isDose: isDose ? '1' : '0',
        isClinical: isClinical ? '1' : '0',
      },
    })

    // Parallel fan-out — no sequential delay across devices.
    // FCM device tokens (native APK), APNs device tokens (native iPhone), and Web Push subscriptions are
    // both dispatched. FCM delivers to the OS even when the app process
    // is dead — the Zomato/Swiggy-class channel.
    const results = await Promise.all(
      subs.map(async (sub) => {
        try {
          if (sub.type === 'fcm') {
            if (!sub.token) throw new Error('FCM subscription has no token')
            await sendFcm(sub.token, message, isClinical)
            return { ok: true as const, id: sub.id }
          }
          if (sub.type === 'apns') {
            if (!sub.token) throw new Error('APNs subscription has no token')
            await sendApns(sub.token, message, isClinical)
            return { ok: true as const, id: sub.id }
          }
          if (!webPushConfigured) throw new Error('Web Push is not configured')
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            message,
            {
              // Clinical: short TTL, high urgency (push services prioritize)
              TTL: isClinical ? 1800 : 3600,
              urgency: 'high',
              topic: isClinical ? 'kynthai-dose' : 'kynthai',
              headers: {
                Urgency: 'high',
                Topic: isClinical ? 'kynthai-dose' : 'kynthai',
              },
            },
          )
          return { ok: true as const, id: sub.id }
        } catch (err: unknown) {
          if (shouldPrunePushSubscription(err)) {
            // Prune only endpoint-specific invalidations. Global VAPID/JWT or
            // payload errors stay visible and do not delete valid devices.
            await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
          } else {
            logger.phiSafeError(err, 'push.send')
          }
          return { ok: false as const, id: sub.id }
        }
      }),
    )

    const sent = results.filter((r) => r.ok).length
    const failed = results.length - sent
    return { sent, failed }
  } catch (err) {
    logger.phiSafeError(err, 'push.send')
    return { sent: 0, failed: 0 }
  }
}
