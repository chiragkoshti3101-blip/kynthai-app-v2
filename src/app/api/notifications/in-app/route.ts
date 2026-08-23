import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuthWithCsrf, jsonOk, jsonError, readJson } from '@/lib/api-helpers'
import { sanitizeText, rateLimit } from '@/lib/security'
import { logAudit } from '@/lib/auth'

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

  const body = await readJson<{ title?: string; body?: string; type?: string }>(req)
  if (!body) return jsonError('Invalid JSON', 400)

  const title = sanitizeText(body.title, 200) || 'Medication reminder'
  const text = sanitizeText(body.body, 500) || ''
  const type = sanitizeText(body.type, 40) || 'reminder'

  try {
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
      },
      select: { id: true },
    })
    await logAudit(user.id, 'notifications.inApp', `id=${row.id}`)
    return jsonOk({ id: row.id })
  } catch {
    return jsonError('Failed to record notification', 500)
  }
}
