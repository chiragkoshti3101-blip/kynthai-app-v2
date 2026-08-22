import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk } from '@/lib/api-helpers'
import { logAudit } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
export const dynamic = 'force-dynamic'

// ── Zod schema for partial consent updates ──────────────────────────────────

const consentUpdateSchema = z.object({
  consentAccepted:       z.boolean().optional(),
  dataProcessingConsent: z.boolean().optional(),
  aiTrainingConsent:     z.boolean().optional(),
})

// ── Helpers ─────────────────────────────────────────────────────────────────

function isResponseError(v: unknown): v is NextResponse {
  return v instanceof NextResponse
}


// GET /api/user/consent — read consent flags (session auth, no CSRF needed)
export async function GET(req: NextRequest) {
  try {
    const { response, user } = await requireAuth(req)
    if (response || !user) return response!

    const row = await db.user.findUnique({
      where: { id: user.id },
      select: {
        consentAccepted: true,
        dataProcessingConsent: true,
        aiTrainingConsent: true,
        role: true,
      },
    })
    if (!row) return jsonError('User not found', 404)

    return jsonOk({
      consentAccepted: !!row.consentAccepted,
      dataProcessingConsent: !!row.dataProcessingConsent,
      aiTrainingConsent: !!row.aiTrainingConsent,
      role: row.role,
    })
  } catch (error) {
    logger.phiSafeError(error)
    return jsonError('Failed to load consent', 500)
  }
}

// PATCH /api/user/consent
// US privacy / Health Data Protection right to withdraw consent — updates any or all of the three consent
// flags. Each field may be set to true or false independently. Requires
// authenticated CSRF-verified session.
//
// Side effects:
//   - The consent field(s) are atomically updated in the users table.
//   - An audit log entry is written so the change is traceable.
//
// Response body (on success):
//   { success: true, consentAccepted, dataProcessingConsent, aiTrainingConsent }
export async function PATCH(req: NextRequest) {
  // Parse body manually to preserve raw JSON for audit logging.
  const raw = await req.text().catch(() => null)
  if (!raw) return jsonError('Request body is required', 400)

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw)
  } catch {
    return jsonError('Invalid JSON — body must be valid JSON', 400)
  }

  const result = consentUpdateSchema.safeParse(parsed)
  if (!result.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of result.error.issues) {
      fieldErrors[issue.path.join('.')] = issue.message
    }
    return jsonError('Validation failed', 422, 'VALIDATION_ERROR', {
      fields: fieldErrors,
    })
  }

  const { consentAccepted, dataProcessingConsent, aiTrainingConsent } = result.data

  // requireAuthWithCsrf handles rate-limiting, CSRF check, consent block check,
  // and session validation in one call. skipConsentCheck: this route IS the
  // consent grant — blocking unconsented users here would lock them out of
  // ever consenting (chicken-and-egg).
  const authResult = await requireAuthWithCsrf(req, { skipConsentCheck: true })
  if (isResponseError(authResult.response)) return authResult.response
  if (!authResult.user) return jsonError('Unauthorized', 401)

  const user = authResult.user
  const targetUserId = user.id

  // Consent modifications must be scoped to the session user's own account.
  if (user.role !== 'admin') {
    // Additional tenant-isolation: verify request context doesn't target a
    // different user. Params are not passed here, but if the route is extended
    // to accept a userId param, the check below MUST be updated accordingly.
  }

  // Build the Prisma update payload — only include fields that were actually
  // supplied so we don't accidentally clear a flag the caller didn't touch.
  const updateData: Record<string, boolean> = {}
  if (consentAccepted !== undefined)       updateData.consentAccepted       = consentAccepted
  if (dataProcessingConsent !== undefined) updateData.dataProcessingConsent = dataProcessingConsent
  if (aiTrainingConsent !== undefined)     updateData.aiTrainingConsent     = aiTrainingConsent

  if (Object.keys(updateData).length === 0) {
    return jsonError('Provide at least one consent field to update', 400)
  }

  try {
    const updated = await db.user.update({
      where: { id: user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        consentAccepted: true,
        dataProcessingConsent: true,
        aiTrainingConsent: true,
      },
    })

    // Log what changed so privacy auditors have a full trail.
    const changedFlags = Object.entries(updateData)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')
    await logAudit(user.id, 'consent.update', changedFlags)

    return jsonOk({
      success: true,
      consentAccepted:       updated.consentAccepted,
      dataProcessingConsent: updated.dataProcessingConsent,
      aiTrainingConsent:     updated.aiTrainingConsent,
    })
  } catch (error) {
    logger.phiSafeError(error)
    return jsonError('Failed to update consent', 500)
  }
}
