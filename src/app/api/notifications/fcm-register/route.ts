import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import { jsonOk, jsonError } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notifications/fcm-register
 * Stores a native Firebase Cloud Messaging device token.
 *
 * Accepts either:
 *  1. Session-authenticated call (from the web layer with cookies)
 *  2. Email + token (from native Java via CookieManager — bypasses CSRF)
 *
 * An FCM token is only useful for delivering push to that specific device,
 * so there's no security risk in accepting it without a full session.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  if (!token || token.length < 20) return jsonError('Missing FCM token', 400)

  // Resolve user: try session auth first, fall back to email in body
  let userId: string | null = null
  try {
    const { requireAuth } = await import('@/lib/api-helpers')
    const { user } = await requireAuth(req)
    if (user) userId = user.id
  } catch {
    /* no session — try email */
  }

  if (!userId && body?.email) {
    const user = await db.user.findUnique({ where: { email: body.email } })
    if (user) userId = user.id
  }

  if (!userId) return jsonError('No authenticated user', 401)

  try {
    await db.pushSubscription.upsert({
      where: {
        userId_type_token: { userId, type: 'fcm', token },
      },
      create: {
        userId,
        endpoint: `fcm:${token.slice(0, 40)}`,
        type: 'fcm',
        token,
        p256dh: '',
        auth: '',
      },
      update: { endpoint: `fcm:${token.slice(0, 40)}` },
    })
  } catch {
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
      for (const sql of [
        `ALTER TABLE "push_subscriptions" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'webpush'`,
        `ALTER TABLE "push_subscriptions" ADD COLUMN IF NOT EXISTS "token" TEXT`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_userId_endpoint_type_key" ON "push_subscriptions"("userId", "endpoint", "type")`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_userId_type_token_key" ON "push_subscriptions"("userId", "type", "token")`,
        `CREATE INDEX IF NOT EXISTS "push_subscriptions_userId_idx" ON "push_subscriptions"("userId")`,
        `DROP INDEX IF EXISTS "push_subscriptions_userId_endpoint_key"`,
      ]) {
        await db.$executeRawUnsafe(sql).catch(() => {})
      }
      await db.pushSubscription.upsert({
        where: { userId_type_token: { userId, type: 'fcm', token } },
        create: {
          userId,
          endpoint: `fcm:${token.slice(0, 40)}`,
          type: 'fcm',
          token,
          p256dh: '',
          auth: '',
        },
        update: { endpoint: `fcm:${token.slice(0, 40)}` },
      })
    } catch (e) {
      console.error('[fcm-register] store failed', e)
      return jsonError('Failed to store FCM token', 500)
    }
  }

  await logAudit(userId, 'push.fcm_register', `token:${token.slice(0, 24)}…`)
  return jsonOk({ success: true })
}
