import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuthWithCsrf, jsonOk, jsonError, readJson } from '@/lib/api-helpers'
import { sanitizeText, rateLimit } from '@/lib/security'
import { logAudit } from '@/lib/auth'
import { ensureNotificationDedupeStorage } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notifications/in-app
 * Record a client-side alarm (dose due) into the in-app inbox.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 30, 60_000)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!

  const body = await readJson<{ title?: string; body?: string; type?: string; dedupeKey?: string }>(req)
  if (!body) return jsonError('Invalid JSON', 400)

  const title = sanitizeText(body.title, 200) || 'Medication reminder'
  const text = sanitizeText(body.body, 500) || ''
  const type = sanitizeText(body.type, 40) || 'reminder'
  const dedupeKey = sanitizeText(body.dedupeKey, 200) || undefined

  try {
    if (dedupeKey) {
      await ensureNotificationDedupeStorage()
      const existing = await db.notificationLog.findFirst({
        where: {
          userId: user.id,
          channel: { in: ['in-app', 'app'] },
          // Notification bodies are encrypted at rest; use the stable event
          // key instead of an unsupported encrypted substring query.
          dedupeKey,
        },
        select: { id: true },
      })
      if (existing) return jsonOk({ id: existing.id, deduped: true })
    }
    const row = await db.notificationLog.create({
      data: {
        userId: user.id,
        channel: 'in-app',
        type,
        title,
        body: text,
        recipient: user.id,
        status: 'sent',
        cost: 0,
        ...(dedupeKey ? { dedupeKey } : {}),
      },
      select: { id: true },
    })
    await logAudit(user.id, 'notifications.inApp', `id=${row.id}`)
    return jsonOk({ id: row.id })
  } catch {
    if (dedupeKey) {
      const existing = await db.notificationLog.findFirst({
        where: {
          userId: user.id,
          channel: { in: ['in-app', 'app'] },
          // Notification bodies are encrypted at rest; use the stable event
          // key instead of an unsupported encrypted substring query.
          dedupeKey,
        },
        select: { id: true },
      }).catch(() => null)
      if (existing) return jsonOk({ id: existing.id, deduped: true })
    }
    return jsonError('Failed to record notification', 500)
  }
}
