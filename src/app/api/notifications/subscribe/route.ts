import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import { requireAuthWithCsrf, jsonOk, jsonError } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notifications/subscribe — store a push subscription
 * for the authenticated user.  The browser's Service Worker calls this
 * after registering for push notifications.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!

  const body = await req.json().catch(() => null)
  if (typeof body?.endpoint !== 'string' || !body.endpoint || body.endpoint.length > 4096) {
    return jsonError('Invalid subscription endpoint', 400)
  }
  const previousEndpoint =
    typeof body.previousEndpoint === 'string' && body.previousEndpoint.length <= 4096
      ? body.previousEndpoint
      : null

  // Upsert: same endpoint for same user → update, else create
  try {
    await db.pushSubscription.upsert({
      where: { userId_endpoint_type: { userId: user.id, endpoint: body.endpoint, type: 'webpush' } },
      create: {
        userId: user.id,
        endpoint: body.endpoint,
        type: 'webpush',
        p256dh: body.keys?.p256dh ?? '',
        auth: body.keys?.auth ?? '',
      },
      update: {
        p256dh: body.keys?.p256dh ?? '',
        auth: body.keys?.auth ?? '',
      },
    })
  } catch {
    return jsonError('Failed to store subscription', 500)
  }

  if (previousEndpoint && previousEndpoint !== body.endpoint) {
    await db.pushSubscription.deleteMany({
      where: { userId: user.id, endpoint: previousEndpoint, type: 'webpush' },
    }).catch(() => {})
  }

  await logAudit(user.id, 'push.subscribe', body.endpoint.slice(0, 60))
  return jsonOk({ success: true })
}

/**
 * DELETE /api/notifications/subscribe — remove all push subscriptions
 * for the authenticated user (e.g. on logout or when push is disabled).
 */
export async function DELETE(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!

  try {
    const count = await db.pushSubscription.deleteMany({
      where: { userId: user.id },
    })
    await logAudit(user.id, 'push.unsubscribe', `${count.count} subscriptions removed`)
    return jsonOk({ success: true, removed: count.count })
  } catch {
    return jsonError('Failed to remove subscriptions', 500)
  }
}
