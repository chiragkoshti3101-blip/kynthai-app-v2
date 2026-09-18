import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import { requireAuth, jsonError, jsonOk } from '@/lib/api-helpers'
import { getDoctorTierConfig } from '@/lib/doctor-subscription'

export const dynamic = 'force-dynamic'

/**
 * GET /api/doctors/me — the authenticated doctor's own profile.
 *
 * The doctor dashboard reads `profile.isPro` from this endpoint to gate its
 * Pro-only UI. This route must exist as a STATIC segment: `/api/doctors/[id]`
 * is the public profile lookup keyed on the DoctorProfile primary key, so a
 * request for `/api/doctors/me` previously fell through to it with id="me",
 * found nothing, and returned 404 "Doctor not found" on every dashboard load.
 */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  if (user.role !== 'doctor') return jsonError('Forbidden — doctor portal access only', 403)

  const profile = await db.doctorProfile.findUnique({ where: { userId: user.id } })
  if (!profile) return jsonError('Doctor profile not found. Submit verification first.', 404)

  const tierConfig = getDoctorTierConfig(profile.subscriptionTier)
  const isPro =
    profile.subscriptionTier === 'pro' || profile.subscriptionTier === 'enterprise'

  await logAudit(user.id, 'doctor.me.read', { resourceType: 'DoctorProfile' })

  return jsonOk({
    profile: {
      id: profile.id,
      name: user.name,
      email: user.email,
      specialization: profile.specialization,
      verified: profile.verified,
      verificationStatus: profile.verificationStatus,
      subscriptionTier: profile.subscriptionTier,
      subscriptionRenews: profile.subscriptionRenews,
      isPro,
      patientSlotCap: profile.patientSlotCap ?? tierConfig.patientSlotCap,
      features: tierConfig.features,
      rating: profile.rating,
      reviewCount: profile.reviewCount,
      city: profile.city,
      avatarColor: profile.avatarColor,
    },
  })
}
