import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { sanitizeText, rateLimit } from '@/lib/security'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk, readJson, audit } from '@/lib/api-helpers'
import { logAudit } from '@/lib/auth'
export const dynamic = 'force-dynamic'

// GET /api/invite?token=... — validate a prescription invite token (public).
//
// SECURITY: previously this endpoint returned `patientEmail` and the full
// `notes` field to anyone holding the invite token. The token has 128 bits
// of entropy so guessing is infeasible, but defense-in-depth: we no longer
// leak the patient's raw email. We return only a masked hint (first 2 chars
// + domain) sufficient for the recipient to confirm "yes this is for me".
export async function GET(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const token = req.nextUrl.searchParams.get('token')?.trim()
  if (!token) return jsonError('token is required', 400)

  const prescription = await db.prescription.findFirst({
    where: { inviteToken: token } as any,
    include: { patient: true, doctor: { include: { user: true } } },
  })
  if (!prescription) return jsonError('Invalid or expired invite token', 404)

  // Check if token has expired (30-day expiry)
  if ((prescription as any).inviteExpiresAt && (prescription as any).inviteExpiresAt < new Date()) {
    return jsonError('Invite token has expired. Please request a new prescription.', 410)
  }

  // Mask the patient email: "alice@example.com" → "al•••@example.com"
  const email = (prescription as any).patient?.email || ''
  const [localPart, domain] = email.split('@') as [string, string]
  const maskedEmail = localPart && domain
    ? `${localPart.slice(0, 2)}${'•'.repeat(Math.max(3, localPart.length - 2))}@${domain}`
    : ''

  return jsonOk({
    valid: true,
    prescription: {
      id: prescription.id,
      doctorName: (prescription as any).doctor?.user?.name,
      specialization: (prescription as any).doctor?.specialization,
      patientName: (prescription as any).patient?.name,
      patientEmailMasked: maskedEmail,
      inviteStatus: (prescription as any).inviteStatus,
      // NOTE: `notes` intentionally omitted — may contain prescription
      // details that should only be revealed after the patient accepts
      // the invite and is authenticated.
      followUpDate: prescription.followUpDate?.toISOString() ?? null,
      createdAt: prescription.createdAt.toISOString(),
    },
  })
}

// POST /api/invite — accept an invite
export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!

  // Audit: this sensitive health data access
  await logAudit(user.id, 'invite.create')

  const body = await readJson<{ token?: string }>(req)
  if (!body?.token) return jsonError('token is required', 400)
  const token = sanitizeText(body.token, 200)

  const prescription = await db.prescription.findFirst({
    where: { inviteToken: token } as any,
    include: { patient: true, doctor: true },
  })
  if (!prescription) return jsonError('Invalid or expired invite token', 404)

  // Check if token has expired (30-day expiry)
  if ((prescription as any).inviteExpiresAt && (prescription as any).inviteExpiresAt < new Date()) {
    return jsonError('Invite token has expired. Please request a new prescription.', 410)
  }

  // A bearer token must never transfer another patient's clinical record.
  if (prescription.patientId !== u.id) {
    return jsonError('This prescription invite is not addressed to your account', 403)
  }
  await db.prescription.update({
    where: { id: prescription.id },
    data: { inviteStatus: 'accepted', inviteToken: null } as any,
  })
  await logAudit(u.id, 'invite.accept', `prescription=${prescription.id}`)
  return jsonOk({ accepted: true, prescriptionId: prescription.id, inviteStatus: 'accepted' })
}
