import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/security'
import { requireAuth, jsonError, jsonOk, parseJsonCol } from '@/lib/api-helpers'
import { logAudit } from '@/lib/auth'
export const dynamic = 'force-dynamic'

// SECURITY-CRITICAL: This endpoint returns lab-specific dashboard data (bookings, revenue, patient info).
// Access is restricted to users with the 'lab' role. No other role may view lab operational data.
export async function GET(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  if (user.role !== 'lab') return jsonError('Forbidden — lab portal access only', 403)
  const u = user!

  try {
    // Audit: lab dashboard access (bookings, patient info, revenue sensitive health data)
    await logAudit(user.id, 'lab.dashboard.read', { resourceType: 'LabBooking' })

    // Use session userId directly — no query param needed
    const userId = u.id

    const profile = await db.labProfile.findUnique({ where: { userId: u.id }, include: { user: true } })
    if (!profile) return jsonError('Lab profile not found', 404)

    const bookings = await db.labBooking.findMany({
      where: { labId: profile.id },
      include: { patient: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    const completed = bookings.filter((b) => b.status === 'completed')
    const pending = bookings.filter((b) => b.status === 'pending')
    const revenue = completed.reduce((s, b) => s + b.price + b.deliveryFee - b.commission, 0)

    return jsonOk({
      profile: {
        id: profile.id,
        userId: profile.userId,
        labName: profile.labName,
        email: profile.user.email,
        licenseNumber: profile.licenseNumber,
        address: profile.address,
        city: profile.city,
        testsOffered: parseJsonCol(profile.testsOffered, []),
        homeCollection: profile.homeCollection,
        longDistanceTravelFeeCents: profile.longDistanceTravelFeeCents,
        verified: profile.verified,
        verificationStatus: profile.verificationStatus,
        rejectionReason: profile.rejectionReason,
        rating: profile.rating,
        reviewCount: profile.reviewCount,
      },
      stats: {
        bookingsTotal: bookings.length,
        pending: pending.length,
        completed: completed.length,
        revenue,
      },
      bookings: bookings.map((b) => ({
        id: b.id,
        patientId: b.patientId,
        patientName: b.patient.name,
        patientEmail: b.patient.email,
        tests: parseJsonCol(b.tests, []),
        scheduledAt: b.scheduledAt.toISOString(),
        status: b.status,
        price: b.price,
        commission: b.commission,
        homeCollection: b.homeCollection,
        deliveryDistanceKm: b.deliveryDistanceKm,
        deliveryFee: b.deliveryFee,
        deliveryQuoteAccepted: b.deliveryQuoteAccepted,
        deliveryPricingSource: b.deliveryPricingSource,
      })),
    })
  } catch (error) {
    return jsonError('Failed to load lab dashboard', 500)
  }
}
