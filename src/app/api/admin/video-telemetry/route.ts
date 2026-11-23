import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/security'
import { requireAdmin, jsonOk, jsonError } from '@/lib/api-helpers'
import { logAudit } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { summarizeVideoTelemetry } from '@/lib/video-telemetry'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/video-telemetry
 *
 * Aggregates persisted call outcomes (status, duration, quality, TURN relay
 * usage) for the admin dashboard. Optional ?days=N narrows the window
 * (default 30, max 180).
 */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAdmin(req)
  if (response || !user) return response!
  await logAudit(user.id, 'admin.video_telemetry')

  const rawDays = Number(req.nextUrl.searchParams.get('days'))
  const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(Math.round(rawDays), 180) : 30
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  try {
    const rows = await db.videoCall.findMany({
      where: { createdAt: { gte: since } },
      select: {
        status: true,
        durationSec: true,
        qualityScore: true,
        startedAt: true,
        endedAt: true,
        participants: { select: { connectionQuality: true, iceCandidateType: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    })
    return jsonOk({ windowDays: days, ...summarizeVideoTelemetry(rows) })
  } catch (error) {
    logger.phiSafeError(error, 'admin.videoTelemetry')
    return jsonError('Failed to aggregate video telemetry', 500)
  }
}
