import { NextRequest } from 'next/server'
import { requireAuth, jsonOk, jsonError, checkConsent } from '@/lib/api-helpers'
import { buildPartnerStatement } from '@/lib/payout-service'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/payouts/statements
 *
 * Returns the caller's open payout statement: gross, platform fees, commission
 * clawbacks, net, and what is eligible to be paid after the hold window.
 * Admins must pass ?userId=<partner> to view another partner's statement.
 */
export async function GET(req: NextRequest) {
  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  const consentErr = checkConsent(user)
  if (consentErr) return consentErr

  const u = user!
  if (u.role === 'patient' || u.role === 'caretaker') {
    return jsonError('Payout statements are for doctors, labs, and admins', 403)
  }

  try {
    let userId = u.id
    if (u.role === 'admin') {
      userId = req.nextUrl.searchParams.get('userId')?.trim() || ''
      if (!userId) {
        return jsonError('Admin must pass ?userId=<partner userId>', 400)
      }
    }
    const statement = await buildPartnerStatement(userId)
    return jsonOk(statement)
  } catch (error) {
    logger.phiSafeError(error, 'payouts.statements')
    return jsonError('Failed to build payout statement', 500)
  }
}
