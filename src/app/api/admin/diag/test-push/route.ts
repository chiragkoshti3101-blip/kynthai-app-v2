import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { sendPushToUser } from '@/lib/push-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/diag/test-push
 *
 * Operator-only LIVE push test. Guarded by the same SCHEMA_BOOTSTRAP_TOKEN
 * secret as the other /api/admin/* routes; fails closed when unset.
 *
 * Fires a real push notification to EVERY registered device (web-push
 * subscriptions + native FCM tokens) so the operator can verify closed-app
 * delivery with their own eyes: browsers fully closed (service-worker
 * delivery) and the Android app swiped away (system-tray delivery via FCM).
 *
 * Body (JSON, all optional):
 *   { "mode": "dose" | "plain", "userId": "<cuid>" }
 *     - mode "dose" (default): fires the EXACT code path a real dose alarm
 *       uses — clinical priority, high urgency, alarm deep link.
 *     - mode "plain": a normal-priority test notification.
 *     - userId: restrict the blast to one account instead of all accounts
 *       that have registered devices.
 *
 * Response: per-transport counts + per-device detail (device type + endpoint
 * tail only — no PHI). Dead tokens are pruned by the send path automatically.
 */

function maskEndpoint(endpoint: string): string {
  try {
    const u = new URL(endpoint)
    return `${u.host}/…${endpoint.slice(-6)}`
  } catch {
    return `…${endpoint.slice(-6)}`
  }
}

export async function POST(req: NextRequest) {
  const expected = process.env.SCHEMA_BOOTSTRAP_TOKEN
  const provided = req.headers.get('authorization') ?? ''
  if (!expected || provided !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: { mode?: unknown; userId?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    /* empty body is fine */
  }
  const mode = body.mode === 'plain' ? 'plain' : 'dose'
  const userIdFilter = typeof body.userId === 'string' ? body.userId.trim() : ''

  try {
    // Distinct accounts that have at least one registered device.
    const rows: Array<{ userId: string }> = userIdFilter
      ? await db.$queryRawUnsafe(
          `SELECT DISTINCT "userId" FROM "push_subscriptions" WHERE "userId" = $1`,
          userIdFilter
        )
      : await db.$queryRawUnsafe(`SELECT DISTINCT "userId" FROM "push_subscriptions"`)

    if (rows.length === 0) {
      return Response.json({
        ok: true,
        mode,
        accountsMessaged: 0,
        totals: { devices: 0, sent: 0, failed: 0 },
        detail: [],
        note: 'No devices registered yet — enable notifications in the web app or install the FCM APK first.',
      })
    }

    const payload =
      mode === 'dose'
        ? {
            title: 'Kynthai dose alarm — swipe-away test',
            body: 'If you see this with the app closed, closed-app alarms work. You can dismiss it.',
            tag: 'reminder',
            url: '/patient?alarm=1',
            clinical: true,
          }
        : {
            title: 'Kynthai test notification',
            body: 'If you see this, push delivery works — even with the app closed.',
            tag: 'kynthai-test',
          }

    let devices = 0
    let sent = 0
    let failed = 0
    const detail: Array<{ type: string; endpoint: string }> = []

    for (const { userId } of rows) {
      const subs = await db.pushSubscription.findMany({
        where: { userId },
        select: { type: true, endpoint: true },
      })
      const r = await sendPushToUser(userId, payload as never)
      devices += subs.length
      sent += r.sent
      failed += r.failed
      for (const s of subs) {
        detail.push({ type: s.type, endpoint: maskEndpoint(s.endpoint) })
      }
    }

    return Response.json({
      ok: true,
      mode,
      accountsMessaged: rows.length,
      totals: { devices, sent, failed },
      detail,
      note:
        'Each accepted send = the push service accepted the message for that device. Web-push shows via the service worker even when the browser is fully closed; FCM shows in the system tray even when the APK is swiped away.',
    })
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'test-push failed' },
      { status: 500 }
    )
  }
}
