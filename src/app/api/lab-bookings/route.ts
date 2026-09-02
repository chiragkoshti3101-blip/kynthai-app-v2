import { NextRequest } from 'next/server'
// import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/security'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk, readJson, parseJsonCol, checkConsent } from '@/lib/api-helpers'
import { logAudit } from '@/lib/auth'
import { sendNotification } from '@/lib/notifications'
import { LAB_BASE_FEE_PCT, resolveTier, effectiveFeePct } from '@/lib/commission'
import { calculateDeliveryFee, extractZip } from '@/lib/delivery-fee'
import { logger } from '@/lib/logger'
export const dynamic = 'force-dynamic'

// GET /api/lab-bookings?patientId=...
export async function GET(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  const u = user!

  const consentErr = checkConsent(u)
  if (consentErr) return consentErr

  const sp = req.nextUrl.searchParams
  const patientId = sp.get('patientId')?.trim()
  const labId = sp.get('labId')?.trim()

  if (patientId && patientId !== u.id && u.role !== 'admin') {
    return jsonError('Forbidden — patientId must match session', 403)
  }

  const and: any[] = []

  if (u.role === 'patient') {
    and.push({ patientId: u.id })
  } else if (u.role === 'lab') {
    if (labId) {
      const profile = await db.labProfile.findUnique({ where: { userId: u.id } })
      if (!profile || profile.id !== labId) {
        return jsonError('Forbidden — labId must match your profile', 403)
      }
      and.push({ labId })
    } else {
      const profile = await db.labProfile.findUnique({ where: { userId: u.id } })
      if (!profile) return jsonOk([])
      and.push({ labId: profile.id })
    }
  } else if (u.role === 'admin') {
    if (patientId) and.push({ patientId })
    if (labId) and.push({ labId })
  } else {
    return jsonError('patientId or labId query param required', 400)
  }

  const where: any = { AND: and }
  const bookings = await db.labBooking.findMany({
    where,
    include: { patient: true, lab: { include: { user: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  await logAudit(user.id, 'lab_booking.list', { resourceType: 'LabBooking' })
  return jsonOk(
    bookings.map((b: any) => ({
      id: b.id,
      labId: b.labId,
      labName: b.lab.labName,
      patientId: b.patientId,
      patientName: b.patient.name,
      tests: parseJsonCol(b.tests, []),
      scheduledAt: b.scheduledAt.toISOString(),
      status: b.status,
      price: b.price,
      commission: b.commission,
      homeCollection: b.homeCollection,
      deliveryAddress: b.deliveryAddress,
      deliveryCity: b.deliveryCity,
      deliveryZip: b.deliveryZip,
      deliveryDistanceMi: b.deliveryDistanceMi,
      deliveryDistanceKm: b.deliveryDistanceKm,
      deliveryFee: b.deliveryFee,
      deliveryPlatformFee: b.deliveryPlatformFee,
      deliveryQuoteAccepted: b.deliveryQuoteAccepted,
      deliveryPricingSource: b.deliveryPricingSource,
      paymentStatus: b.paymentStatus,
    })),
  )
}

// POST /api/lab-bookings — book a lab test
export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!

  const body = await readJson<{
    labId?: string
    patientId?: string
    scheduledAt?: string
    tests?: Array<{ name: string; price: number }>
    homeCollection?: boolean
    deliveryAddress?: string
    deliveryCity?: string
    deliveryZip?: string
    deliveryDistanceMi?: number // legacy client field; recalculated server-side
    deliveryDistanceKm?: number // client preview; recalculated server-side
    deliveryFee?: number // legacy client field; recalculated server-side
    deliveryPlatformFee?: number // legacy client field; recalculated server-side
    deliveryQuoteAccepted?: boolean
    deliveryPricingSource?: 'platform_fixed' | 'provider_quote'
    stripePaymentIntentId?: string
    paymentStatus?: string
  }>(req)
  if (!body) return jsonError('Invalid JSON', 400)
  if (!body.labId) return jsonError('labId is required', 400)
  if (!body.scheduledAt) return jsonError('scheduledAt is required', 400)

  const scheduledAt = new Date(body.scheduledAt)
  if (Number.isNaN(scheduledAt.getTime())) return jsonError('scheduledAt must be a valid date', 400)

  const patientId = body.patientId || u.id
  if (u.role === 'patient' && patientId !== u.id) {
    return jsonError('You can only book for yourself', 403)
  }

  const lab = await db.labProfile.findUnique({ where: { id: body.labId } })
  if (!lab) return jsonError('Lab not found', 404)
  if (!lab.verified) return jsonError('Lab is not verified', 403)

  const homeCollection = body.homeCollection === true
  if (homeCollection && !lab.homeCollection) {
    return jsonError('This provider does not offer home collection', 422)
  }

  const patient = await db.user.findUnique({ where: { id: patientId } })
  if (!patient) return jsonError('Patient not found', 404)
  const patientConsentErr = checkConsent(patient)
  if (patientConsentErr) return patientConsentErr

  // The lab profile is the source of truth for test names and prices. Client
  // amounts are accepted only when they exactly match the provider's current
  // catalogue, preventing a real customer from changing the order total in
  // the browser.
  const requestedTests = Array.isArray(body.tests) ? body.tests : []
  if (requestedTests.length === 0) return jsonError('At least one test is required', 400)
  const offeredRaw = parseJsonCol<unknown[]>(lab.testsOffered, [])
  const offered = offeredRaw.flatMap((entry) => {
    if (typeof entry === 'string') {
      return [{ name: entry.trim(), priceCents: null as number | null }]
    }
    if (!entry || typeof entry !== 'object') return []
    const item = entry as { name?: unknown; price?: unknown }
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    const priceDollars = Number(item.price)
    if (!name) return []
    return [{
      name,
      priceCents: Number.isFinite(priceDollars) && priceDollars > 0
        ? Math.round(priceDollars * 100)
        : null,
    }]
  })

  const selectedNames = new Set<string>()
  const tests = requestedTests.map((requested) => {
    const name = typeof requested?.name === 'string' ? requested.name.trim() : ''
    const requestedPriceCents = Number(requested?.price)
    if (!name || !Number.isFinite(requestedPriceCents) || requestedPriceCents <= 0) {
      return null
    }
    const key = name.toLocaleLowerCase()
    if (selectedNames.has(key)) return null
    selectedNames.add(key)
    const match = offered.find((candidate) => candidate.name.toLocaleLowerCase() === key)
    if (!match || match.priceCents === null || Math.round(requestedPriceCents) !== match.priceCents) {
      return null
    }
    return { name: match.name, price: match.priceCents }
  })
  if (tests.some((test) => test === null) || tests.length === 0) {
    return jsonError('One or more selected tests are unavailable or have a changed price. Refresh the provider catalogue and try again.', 409, 'TEST_CATALOG_CHANGED')
  }
  const verifiedTests = tests as Array<{ name: string; price: number }>
  const total = verifiedTests.reduce((sum, test) => sum + test.price, 0)
  if (total <= 0) return jsonError('Total price must be greater than 0', 400)

  let deliveryAddress: string | null = null
  let deliveryCity: string | null = null
  let deliveryZip: string | null = null
  let deliveryDistanceMi: number | null = null
  let deliveryDistanceKm: number | null = null
  let deliveryFee = 0
  let deliveryPlatformFee = 0
  let deliveryQuoteAccepted = false
  let deliveryPricingSource: 'platform_fixed' | 'provider_quote' = 'platform_fixed'

  if (homeCollection) {
    deliveryAddress = typeof body.deliveryAddress === 'string' ? body.deliveryAddress.trim() : ''
    deliveryCity = typeof body.deliveryCity === 'string' ? body.deliveryCity.trim() : ''
    const submittedZip = typeof body.deliveryZip === 'string' ? body.deliveryZip.trim() : ''
    deliveryZip = extractZip(submittedZip) || (/^\d{5}(?:-\d{4})?$/.test(submittedZip) ? submittedZip.slice(0, 5) : null)
    if (!deliveryAddress) return jsonError('deliveryAddress is required for home collection', 400)
    if (deliveryAddress.length > 500) return jsonError('deliveryAddress is too long', 422)
    if (!deliveryZip) return jsonError('A valid delivery ZIP code is required for home collection', 400)

    const providerZip = extractZip(lab.address || '')
    if (!providerZip) {
      return jsonError('This provider has not supplied a service ZIP, so online home collection is unavailable.', 422, 'SERVICE_AREA_UNAVAILABLE')
    }

    const delivery = calculateDeliveryFee(deliveryZip, providerZip, lab.longDistanceTravelFeeCents)
    if (delivery.contactLab || delivery.distanceKm === null || delivery.distanceMi === null) {
      return jsonError('We cannot calculate a safe service distance for this address. Please contact the provider.', 422, 'SERVICE_AREA_UNAVAILABLE')
    }
    if (delivery.quoteRequired) {
      if (!delivery.quoteAvailable || delivery.providerQuoteCents === null) {
        return jsonError('The provider has not configured a long-distance travel quote.', 422, 'TRAVEL_QUOTE_UNAVAILABLE')
      }
      if (body.deliveryQuoteAccepted !== true || body.deliveryPricingSource !== 'provider_quote') {
        return jsonError('You must review and accept the provider travel quote before booking.', 422, 'TRAVEL_QUOTE_NOT_ACCEPTED')
      }
      deliveryPricingSource = 'provider_quote'
      deliveryQuoteAccepted = true
    }

    deliveryDistanceKm = delivery.distanceKm
    deliveryDistanceMi = delivery.distanceMi
    deliveryFee = delivery.deliveryFeeCents
    deliveryPlatformFee = delivery.platformFeeCents
  }

  // BUSINESS LOGIC: use loyalty-tier-aware commission on tests + travel.
  const labTier = resolveTier(lab.reviewCount) // reviewCount as proxy for lifetime fulfilled
  const feePct = effectiveFeePct(LAB_BASE_FEE_PCT, labTier)
  const totalWithDelivery = total + deliveryFee
  const commission = Math.round(totalWithDelivery * (feePct / 100))

  const booking = await db.labBooking.create({
    data: {
      labId: lab.id,
      patientId: patient.id,
      scheduledAt,
      status: 'pending',
      price: total,
      commission,
      homeCollection,
      tests: JSON.stringify(verifiedTests),
      deliveryAddress,
      deliveryCity: deliveryCity || null,
      deliveryZip,
      deliveryDistanceMi,
      deliveryDistanceKm,
      deliveryFee,
      deliveryPlatformFee,
      deliveryQuoteAccepted,
      deliveryPricingSource,
      stripePaymentIntentId: body.stripePaymentIntentId || null,
      // A booking is not treated as paid merely because the client says so.
      // The checkout/webhook path owns payment confirmation.
      paymentStatus: 'pending',
    },
  })

  // Create a mock payment record for the existing non-Stripe path. The amount
  // must include the travel charge so real customers are not under-recorded.
  try {
    await db.payment.create({
      data: {
        userId: patient.id,
        amount: totalWithDelivery,
        currency: 'USD',
        type: 'lab_booking',
        status: 'succeeded',
        provider: 'mock',
        description: `Lab test: ${verifiedTests.map((test) => test.name).join(', ')} at ${lab.labName}`,
      },
    })
  } catch (paymentErr) {
    logger.phiSafeError(paymentErr, 'lab-bookings.payment.create')
  }

  await logAudit(u.id, 'lab-bookings.book', `booking=${booking.id} lab=${lab.id} total=${totalWithDelivery} delivery=${deliveryFee} pricing=${deliveryPricingSource} feePct=${feePct}%`)

  // Notify the lab that a new booking was made.
  try {
    await sendNotification(
      { userId: lab.userId },
      {
        title: 'New lab test booking',
        body: `${patient.name} booked ${verifiedTests.length > 1 ? `${verifiedTests.length} tests` : verifiedTests[0]?.name} for ${scheduledAt.toLocaleDateString('en-US', { dateStyle: 'medium' })}.\n\n` +
          `Open Kynthai to view and confirm: ${process.env.NEXT_PUBLIC_APP_URL || 'https://kynthai.app'}/lab`,
        type: 'lab_booking',
        data: { bookingId: booking.id, labId: lab.id, patientId: patient.id, url: '/lab' },
        dedupeKey: `lab-booking:${booking.id}:created:lab`,
      },
    )
  } catch { /* best-effort */ }

  // Notify the patient that their booking was submitted.
  try {
    await sendNotification(
      { userId: patient.id, email: patient.email },
      {
        title: 'Lab booking submitted',
        body: `Your ${verifiedTests.length > 1 ? `${verifiedTests.length} tests` : verifiedTests[0]?.name} booking at ${lab.labName} has been submitted.\n\n` +
          `Date: ${scheduledAt.toLocaleDateString('en-US', { dateStyle: 'medium' })}\n` +
          `Status: Pending — waiting for lab to confirm\n\n` +
          `You'll receive a notification once the lab confirms.\n\n` +
          `Open Kynthai: ${process.env.NEXT_PUBLIC_APP_URL || 'https://kynthai.app'}/patient`,
        type: 'lab_booking',
        data: { bookingId: booking.id, labId: lab.id, url: '/patient' },
        dedupeKey: `lab-booking:${booking.id}:created:patient`,
      },
    )
  } catch { /* best-effort */ }

  return jsonOk({
    id: booking.id,
    labId: booking.labId,
    patientId: booking.patientId,
    scheduledAt: booking.scheduledAt.toISOString(),
    status: booking.status,
    price: booking.price,
    total: totalWithDelivery,
    commission: booking.commission,
    commissionRatePct: feePct,
    tests: parseJsonCol(booking.tests, []),
    homeCollection: booking.homeCollection,
    deliveryAddress: booking.deliveryAddress,
    deliveryCity: booking.deliveryCity,
    deliveryZip: booking.deliveryZip,
    deliveryDistanceMi: booking.deliveryDistanceMi,
    deliveryDistanceKm: booking.deliveryDistanceKm,
    deliveryFee: booking.deliveryFee,
    deliveryPlatformFee: booking.deliveryPlatformFee,
    deliveryQuoteAccepted: booking.deliveryQuoteAccepted,
    deliveryPricingSource: booking.deliveryPricingSource,
    paymentStatus: booking.paymentStatus,
  })
}
