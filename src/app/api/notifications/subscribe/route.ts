import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import { requireAuthWithCsrf, jsonOk, jsonError } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

/**
 * Idempotent bootstrap — creates the push_subscriptions table if it's missing
 * (e.g. first deploy before migrations are applied in the DB). Safe: the SQL
 * is a fixed, non-destructive CREATE TABLE IF NOT EXISTS with no user input.
 */
async function ensurePushTable(): Promise<boolean> {
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "push_subscriptions" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "endpoint" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'webpush',
        "token" TEXT,
        "p256dh" TEXT NOT NULL,
        "auth" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
      );
    `)
    await db.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_userId_endpoint_type_key"
      ON "push_subscriptions"("userId", "endpoint", "type");
    `)
    await db.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_userId_type_token_key"
      ON "push_subscriptions"("userId", "type", "token");
    `)
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "push_subscriptions_userId_idx"
      ON "push_subscriptions"("userId");
    `)
    return true
  } catch {
    return false
  }
}

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
  if (!body?.endpoint) return jsonError('Missing subscription endpoint', 400)

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
    // Table missing (migration not yet applied) → bootstrap then retry once.
    const ok = await ensurePushTable()
    if (!ok) return jsonError('Failed to store subscription', 500)
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
