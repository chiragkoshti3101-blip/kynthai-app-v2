import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import webpush from 'web-push'

/**
 * sendPushToUser — send a push notification to all devices subscribed by a user.
 * Best-effort: never throws; failures are logged and expired subs are removed.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; tag?: string; url?: string }
): Promise<{ sent: number; failed: number }> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    // Push not configured — never throw, the app still works in-app.
    return { sent: 0, failed: 0 }
  }

  try {
    webpush.setVapidDetails('mailto:hello@kynthai.app', publicKey, privateKey)

    const subs = await db.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    })
    if (subs.length === 0) return { sent: 0, failed: 0 }

    const message = JSON.stringify({
      title: payload.title || 'Kynthai',
      body: payload.body || '',
      tag: payload.tag || 'kynthai-notification',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: payload.url || '/', type: payload.tag || 'kynthai' },
    })

    let sent = 0
    let failed = 0
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message
        )
        sent++
      } catch (err: any) {
        failed++
        if (err.statusCode === 404 || err.statusCode === 410) {
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
        } else {
          logger.phiSafeError(err, 'push.send')
        }
      }
    }
    return { sent, failed }
  } catch (err) {
    logger.phiSafeError(err, 'push.send')
    return { sent: 0, failed: 0 }
  }
}
