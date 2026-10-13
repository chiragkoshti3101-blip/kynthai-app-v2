import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { sanitizeText, rateLimit } from '@/lib/security'
import { checkCsrf } from '@/lib/csrf'
import { jsonError, jsonOk, readJson, audit, parseJsonCol, requireAuth } from '@/lib/api-helpers'
export const dynamic = 'force-dynamic'

// GET /api/doctors/[id] — public doctor profile
//
// SECURITY: this endpoint is publicly reachable (no auth required). For
// unverified/rejected profiles we redact sensitive fields (email,
// licenseNumber, documents, rejectionReason, subscriptionTier) so an
// attacker who enumerates profile IDs can't harvest pending applicants'
// PII. Verified doctors expose the full public profile.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req)
  if (limited) return limited
  const { id } = await params

  const profile = await db.doctorProfile.findUnique({
    where: { id },
    include: { user: true },
  })
  if (!profile) return jsonError('Doctor not found', 404)

  if (!profile.verified) {
    return jsonOk({
      id: profile.id,
      userId: profile.userId,
      name: profile.user.name,
      specialization: profile.specialization,
      city: profile.city,
      bio: profile.bio,
      experience: profile.experience,
      consultationFee: profile.consultationFee,
      videoCallEnabled: profile.videoCallEnabled,
      verified: false,
      verificationStatus: profile.verificationStatus,
      rating: profile.rating,
      reviewCount: profile.reviewCount,
      avatarColor: profile.avatarColor,
    })
  }

  return jsonOk({
    id: profile.id,
    userId: profile.userId,
    name: profile.user.name,
    specialization: profile.specialization,
    licenseNumber: profile.licenseNumber,
    experience: profile.experience,
    consultationFee: profile.consultationFee,
    city: profile.city,
    bio: profile.bio,
    videoCallEnabled: profile.videoCallEnabled,
    verified: profile.verified,
    verificationStatus: profile.verificationStatus,
    rating: profile.rating,
    reviewCount: profile.reviewCount,
    subscriptionTier: profile.subscriptionTier,
    avatarColor: profile.avatarColor,
    documents: parseJsonCol(profile.documents, []),
  })
}

// PUT /api/doctors/[id] — update doctor profile (owner only, or admin).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req)
  if (limited) return limited
  const csrfError = await checkCsrf(req)
  if (csrfError) return csrfError
  const { id } = await params

  const { response, user: session } = await requireAuth(req)
  if (response || !session) return response!

  const profile = await db.doctorProfile.findUnique({ where: { id } })
  if (!profile) return jsonError('Doctor not found', 404)

  const isAdmin = session.role === 'admin'
  if (!isAdmin && profile.userId !== session.id) {
    return jsonError('Forbidden — you can only update your own profile', 403)
  }

  const body = await readJson<{
    specialization?: string
    consultationFee?: number
    videoCallEnabled?: boolean
    city?: string
    bio?: string
    experience?: number
    verified?: boolean
    verificationStatus?: string
    rejectionReason?: string
    avatarColor?: string
    subscriptionTier?: string
    state?: string
  }>(req)
  if (!body) return jsonError('Invalid JSON', 400)

  const data: Record<string, unknown> = {}
  if (body.specialization !== undefined) data.specialization = sanitizeText(body.specialization, 80)
  if (body.consultationFee !== undefined) data.consultationFee = Number(body.consultationFee) || 0
  if (body.videoCallEnabled !== undefined) data.videoCallEnabled = !!body.videoCallEnabled
  if (body.city !== undefined) data.city = sanitizeText(body.city, 60)
  if (body.state !== undefined) data.state = sanitizeText(body.state, 2).toUpperCase()
  if (body.bio !== undefined) data.bio = sanitizeText(body.bio, 2000)
  if (body.experience !== undefined) data.experience = Number(body.experience) || 0
  if (body.avatarColor !== undefined) data.avatarColor = sanitizeText(body.avatarColor, 30)

  // Only admins can flip verification flags.
  if (isAdmin) {
    if (body.verified !== undefined) {
      data.verified = !!body.verified
      data.verificationStatus = body.verified ? 'approved' : 'rejected'
    }
    if (body.verificationStatus !== undefined) data.verificationStatus = sanitizeText(body.verificationStatus, 30)
    if (body.rejectionReason !== undefined) data.rejectionReason = sanitizeText(body.rejectionReason, 500)
    if (body.subscriptionTier !== undefined) data.subscriptionTier = sanitizeText(body.subscriptionTier, 30)
  }

  // Self-heal: ensure the state column exists (raw SQL, idempotent).
  if (data.state !== undefined) {
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "state" TEXT`)
    } catch {
      return jsonError('Could not update profile right now', 500)
    }
  }

  const updated = await db.doctorProfile.update({ where: { id }, data })
  await logAudit(session.id, 'doctor.profile.update', `profile=${id} fields=${Object.keys(data).join(',')}`)
  return jsonOk(updated)
}
