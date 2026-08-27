import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import { requireAuthWithCsrf, jsonOk, jsonError } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notifications/fcm-register
 * Stores a native Firebase Cloud Messaging device token for the authenticated
 * user. The APK (via @capacitor/push-notifications) calls this after obtaining
 * a token, so the server cron can deliver reminders straight to the OS even
 * when the app process is dead (the Zomato/Swiggy-class channel).
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!

  const body = await req.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  if (!token || token.length < 20) return jsonError('Missing FCM token', 400)

  try {
    // Upsert by (userId, type, token) — one row per device token.
    await db.pushSubscription.upsert({
      where: {
        userId_type_token: { userId: user.id, type: 'fcm', token },
      },
      create: {
        userId: user.id,
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
      // Migration not yet applied → bootstrap the table, then retry once.
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
      // Idempotent upgrade for a pre-existing table (pre-FCM).
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
        where: { userId_type_token: { userId: user.id, type: 'fcm', token } },
        create: {
          userId: user.id,
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

  await logAudit(user.id, 'push.fcm_register', `token:${token.slice(0, 24)}…`)
  return jsonOk({ success: true })
}
