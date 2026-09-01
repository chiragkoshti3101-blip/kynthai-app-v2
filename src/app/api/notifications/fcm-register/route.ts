import { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import { jsonOk, jsonError, requireAuth } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notifications/fcm-register
 * Store one authenticated native device registration.
 *
 * Android sends an FCM token; iPhone sends the APNs token emitted by
 * @capacitor/push-notifications. The type is explicit because an APNs token
 * cannot be delivered through Firebase Admin and an FCM token cannot be sent
 * directly to Apple.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const requestedType = typeof body?.type === 'string' ? body.type.trim().toLowerCase() : 'fcm'
  if (requestedType !== 'fcm' && requestedType !== 'apns') {
    return jsonError('Unsupported native push token type', 400)
  }
  if (!token || token.length < 20 || token.length > 4096) {
    return jsonError(`Invalid ${requestedType.toUpperCase()} token`, 400)
  }
  if (requestedType === 'apns' && !/^[0-9a-f]{64}$/i.test(token)) {
    return jsonError('Invalid APNs device token', 400)
  }

  // Resolve the user from the verified session. Never accept an email in the
  // request body: that could attach an attacker-controlled device to another
  // account. Native Java uses the WebView session cookie; the web layer sends
  // the same cookie plus its normal CSRF token.
  const { response, user: sessionUser } = await requireAuth(req)
  if (response || !sessionUser) return response || jsonError('Unauthorized', 401)
  const user = await db.user.findUnique({ where: { id: sessionUser.id } })
  if (!user) return jsonError('Sign in to register this device for push', 401)

  const tokenFingerprint = createHash('sha256').update(token).digest('hex').slice(0, 40)
  const endpoint = `${requestedType}:${tokenFingerprint}`

  try {
    await db.pushSubscription.upsert({
      where: {
        userId_type_token: { userId: user.id, type: requestedType, token },
      },
      create: {
        userId: user.id,
        endpoint,
        type: requestedType,
        token,
        p256dh: '',
        auth: '',
      },
      update: { endpoint },
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
        where: { userId_type_token: { userId: user.id, type: requestedType, token } },
        create: {
          userId: user.id,
          endpoint,
          type: requestedType,
          token,
          p256dh: '',
          auth: '',
        },
        update: { endpoint },
      })
    } catch (e) {
      console.error('[fcm-register] store failed', e)
      return jsonError('Failed to store native push token', 500)
    }
  }

  await logAudit(user.id, 'push.native_register', `${requestedType}:${tokenFingerprint}`)
  return jsonOk({ success: true })
}

/**
 * DELETE /api/notifications/fcm-register
 * Remove only the current native device registration.
 */
export async function DELETE(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const requestedType = typeof body?.type === 'string' ? body.type.trim().toLowerCase() : 'fcm'
  if (
    (requestedType !== 'fcm' && requestedType !== 'apns') ||
    !token ||
    token.length < 20 ||
    token.length > 4096
  ) {
    return jsonError('Invalid native push registration', 400)
  }
  if (requestedType === 'apns' && !/^[0-9a-f]{64}$/i.test(token)) {
    return jsonError('Invalid APNs device token', 400)
  }

  const { response, user } = await requireAuth(req)
  if (response || !user) return response || jsonError('Unauthorized', 401)

  const result = await db.pushSubscription.deleteMany({
    where: { userId: user.id, type: requestedType, token },
  }).catch(() => ({ count: 0 }))
  await logAudit(user.id, 'push.native_unregister', `${requestedType}:${result.count}`)
  return jsonOk({ success: true, removed: result.count })
}
