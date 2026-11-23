import { NextRequest } from 'next/server'
import { requireSystemToken, jsonOk } from '@/lib/api-helpers'
import {
  settlePartnerPayouts,
  usersWithOpenPayouts,
} from '@/lib/payout-service'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/payouts/run
 *
 * Weekly payout settlement, called by cron (Authorization: Bearer $CRON_SECRET).
 * Settles every partner with a cleared balance, or a single partner when
 * `{ userId }` is supplied. Only rows older than the hold window are paid;
 * commission clawbacks are netted into the balance first.
 */
export async function POST(req: NextRequest) {
  const { response } = await requireSystemToken(req)
  if (response) return response

  const body = await req.json().catch(() => ({} as { userId?: string }))
  try {
    const userIds = body?.userId ? [String(body.userId)] : await usersWithOpenPayouts()
    let settled = 0
    const results: Array<{ userId: string; settled: number; eligibleNet: number; net: number }> = []

    for (const userId of userIds) {
      const { settled: count, statement } = await settlePartnerPayouts(userId)
      settled += count
      results.push({
        userId,
        settled: count,
        eligibleNet: statement.eligibleNet,
        net: statement.net,
      })
    }

    return jsonOk({ settled, partners: results.length, results })
  } catch (error) {
    logger.phiSafeError(error, 'payouts.run')
    return jsonOk({ settled: 0, partners: 0, results: [], error: 'settlement failed' })
  }
}
