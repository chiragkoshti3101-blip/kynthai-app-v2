import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { requireSystemToken, jsonOk, jsonError } from '@/lib/api-helpers'
import { sendNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notifications/push — send push notifications to users.
 *
 * Called by:
 *  - /api/reminders/schedule (cron, when a reminder is due)
 *  - Appointment booking flow (consultation alerts)
 *  - Lab result upload flow (result-ready alerts)
 *
 * Body: { title, body, type?, userId?, url?, dedupeKey? }
 * If userId is provided, sends to that user only.
 * If omitted, sends to all users with push subscriptions.
 */
export async function POST(req: NextRequest) {
  const { response } = await requireSystemToken(req)
  if (response) return response

  const body = await req.json().catch(() => null)
  if (!body?.title || !body?.body) {
    return jsonError('Missing title or body', 400)
  }

  const type = typeof body.type === 'string' && body.type.trim() ? body.type.trim() : 'general'
  try {
    const recipients = body.userId
      ? [String(body.userId)]
      : (await db.pushSubscription.findMany({
          select: { userId: true },
          distinct: ['userId'],
        })).map((row) => row.userId)

    let sent = 0
    let failed = 0
    for (const userId of recipients) {
      const result = await sendNotification(
        { userId },
        {
          title: String(body.title),
          body: String(body.body),
          type,
          data: { url: typeof body.url === 'string' ? body.url : '/' },
          ...(typeof body.dedupeKey === 'string' && body.dedupeKey.trim()
            ? { dedupeKey: body.dedupeKey.trim() + ':' + userId }
            : {}),
        },
      )
      if (result.delivered || result.notificationLogId) sent += 1
      else failed += 1
    }
    return jsonOk({ sent, failed, total: recipients.length })
  } catch (err) {
    logger.phiSafeError(err, 'push.send')
    return jsonError('Failed to send notifications', 500)
  }
}
