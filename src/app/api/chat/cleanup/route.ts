import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSystemToken, jsonError } from '@/lib/api-helpers'
import { logAudit } from '@/lib/auth'
import { recordAuditSync } from '@/lib/audit-logger'
import { logger } from '@/lib/logger'
// Prevent static generation — requires runtime context
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return POST(req)
}

/**
 * POST /api/chat/cleanup — cron job to delete expired messages.
 *
 * Requires CRON_SECRET bearer token or admin role.
 * Schedule via external cron (e.g. Vercel Cron, GitHub Actions, etc.):
 *
 *   curl -X POST https://your-app.com/api/chat/cleanup \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(req: NextRequest) {
  const { response } = await requireSystemToken(req)
  if (response) return response

  // Audit: cron chat cleanup (system-level)
  await recordAuditSync('system', 'chat.cleanup.cron', {
    category: 'system',
    metadata: { operation: 'delete_expired_messages' },
  })

  try {
    const result = await db.chatMessage.deleteMany({
      where: {
        expiresAt: { lte: new Date() },
      },
    })
    return NextResponse.json({
      success: true,
      deleted: result.count,
    })
  } catch (error) {
    logger.phiSafeError(error, 'chat.cleanup')
    return jsonError('Chat cleanup failed', 500, 'CLEANUP_ERROR')
  }
}
