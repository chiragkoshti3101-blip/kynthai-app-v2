import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/security'
import { requireAuthWithCsrf, jsonOk, jsonError } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notifications/subscribe/status — verify one device registration.
 * This is intentionally read-only so a browser can recover after a provider
 * invalidates or the server prunes its endpoint.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 30, 60000)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!

  const body = await req.json().catch(() => null)
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : ''
  if (!endpoint || endpoint.length > 4096) {
    return jsonError('Invalid subscription endpoint', 400)
  }

  const registration = await db.pushSubscription.findFirst({
    where: { userId: user.id, endpoint },
    select: { id: true },
  })

  return jsonOk({ registered: Boolean(registration) })
}
