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
  /** Clinical dose / emergency — max priority, short TTL */
  clinical?: boolean
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
  if (!publicKey || !privateKey) {
    return { sent: 0, failed: 0 }
  }

  try {
    webpush.setVapidDetails('mailto:hello@kynthai.app', publicKey, privateKey)

    const subs = await db.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    })
    if (subs.length === 0) return { sent: 0, failed: 0 }

    const isClinical =
      payload.clinical === true ||
      payload.tag === 'reminder' ||
      payload.tag === 'missed_dose' ||
      payload.tag === 'emergency' ||
      !!payload.reminderId

    const message = JSON.stringify({
      title: payload.title || 'Kynthai',
      body: payload.body || '',
      tag: payload.tag || (isClinical ? 'kynthai-dose' : 'kynthai-notification'),
      type: isClinical ? 'dose' : payload.tag || 'kynthai',
      url: payload.url || (isClinical ? '/patient?alarm=1' : '/'),
      medName: payload.medName,
      time: payload.time,
      dosage: payload.dosage,
      reminderId: payload.reminderId,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      silent: false,
      requireInteraction: false, // SW applies platform rules
      renotify: true,
      clinical: isClinical,
      data: {
        url: payload.url || (isClinical ? '/patient?alarm=1' : '/'),
        type: isClinical ? 'dose' : payload.tag || 'kynthai',
        medName: payload.medName,
        time: payload.time,
        dosage: payload.dosage,
        reminderId: payload.reminderId,
        isDose: isClinical,
        isClinical,
      },
    })

    // Parallel fan-out — no sequential delay across devices
    const results = await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            message,
            {
              // Clinical: short TTL, high urgency (push services prioritize)
              TTL: isClinical ? 120 : 3600,
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
          if (statusCode === 404 || statusCode === 410) {
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
