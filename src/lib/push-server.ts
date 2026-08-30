import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
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
    data: (parsed.data || {}) as Record<string, string>,
  })
  return result.messageId || 'fcm:accepted'
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
    // FCM device tokens (native APK/iOS) and Web Push subscriptions are
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
          const statusCode = (err as { statusCode?: number })?.statusCode
          const fcmCode = (err as { code?: string })?.code || ''
          const deadToken =
            statusCode === 404 ||
            statusCode === 410 ||
            fcmCode === 'messaging/registration-token-not-registered' ||
            fcmCode === 'messaging/invalid-registration-token'
          if (deadToken) {
            // FIX #9 (FCM half): prune dead tokens so dashboards stop counting
            // undeliverable devices as reachable.
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
