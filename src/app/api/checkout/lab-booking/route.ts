/**
 * POST /api/checkout/lab-booking
 *
 * Creates a Stripe Checkout Session for a lab booking (tests + delivery fee).
 * Returns { sessionId, url } for redirect-based checkout.
 *
 * Requires: STRIPE_SECRET_KEY in env.
 */
import { NextRequest } from 'next/server'
import { requireAuthWithCsrf, jsonError, jsonOk, readJson, parseJsonCol } from '@/lib/api-helpers'
import { rateLimit } from '@/lib/security'
import { logger } from '@/lib/logger'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://kynthai.app'

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key, { apiVersion: '2025-06-30.basil' as any })
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!

  const body = await readJson<{
    bookingId?: string
    tests?: Array<{ name: string; price: number }>
    deliveryFee?: number       // cents
    platformFee?: number       // cents
    labName?: string
    deliveryAddress?: string
  }>(req)

  if (!body) return jsonError('Invalid JSON', 400)
  if (!body.bookingId) return jsonError('bookingId is required', 400)

  // SECURITY: load the booking before checking the payment provider. The
  // booking record, including the accepted provider quote, is authoritative;
  // client-supplied tests, fees, names, and addresses are display-only.
  const { db } = await import('@/lib/db')
  const booking = await db.labBooking.findUnique({
    where: { id: body.bookingId },
    include: { lab: true },
  })
  if (!booking) return jsonError('Booking not found', 404)
  if (booking.patientId !== user.id && user.role !== 'admin') {
    return jsonError('Unauthorized', 403)
  }
  if (booking.deliveryPricingSource === 'provider_quote' && !booking.deliveryQuoteAccepted) {
    return jsonError('The provider travel quote must be accepted before checkout.', 409, 'TRAVEL_QUOTE_NOT_ACCEPTED')
  }

  const parsedTests = parseJsonCol<unknown[]>(booking.tests, [])
  const serverTests = parsedTests.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as { name?: unknown; price?: unknown }
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    const price = Number(item.price)
    return name && Number.isFinite(price) && price > 0 ? [{ name, price: Math.round(price) }] : []
  })
  // Legacy bookings stored only test names. Preserve their verified booking
  // total as one line item instead of trusting a replacement client payload.
  const lineTests = serverTests.length > 0
    ? serverTests
    : [{ name: 'Lab tests', price: booking.price }]
  const serverTotalCents = booking.price
  const deliveryFee = booking.deliveryFee || 0
  const totalCents = serverTotalCents + deliveryFee

  const stripe = getStripe()
  if (!stripe) {
    return jsonOk({
      sessionId: null,
      url: null,
      mockMode: true,
      bookingId: booking.id,
      total: totalCents,
      message: 'Stripe is not configured. The booking is recorded as pending payment; no charge was made.',
    })
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // Let Stripe auto-detect available payment methods (cards, Apple Pay,
      // Google Pay, etc.) based on the customer's device and region.
      customer_email: user.email || undefined,
      line_items: [
        // Test fees
        ...lineTests.map((t) => ({
          price_data: {
            currency: 'usd',
            product_data: {
              name: t.name,
              description: `Lab test at ${booking.lab.labName || 'Kynthai partner lab'}`,
            },
            unit_amount: t.price,
          },
          quantity: 1,
        })),
        // Delivery fee (if any)
        ...(deliveryFee > 0
          ? [{
              price_data: {
                currency: 'usd',
                product_data: {
                  name: 'Home collection delivery',
                  description: `Delivery to ${booking.deliveryAddress || 'your address'}`,
                },
                unit_amount: deliveryFee,
              },
              quantity: 1,
            }]
          : []),
      ],
      metadata: {
        bookingId: body.bookingId,
        userId: user.id,
        deliveryFee: String(deliveryFee),
        totalAmount: String(totalCents),
      },
      success_url: `${APP_URL}/patient?booking=success&id=${body.bookingId}`,
      cancel_url: `${APP_URL}/patient?booking=cancelled&id=${body.bookingId}`,
    })

    return jsonOk({
      sessionId: session.id,
      url: session.url,
    })
  } catch (err: any) {
    logger.error('stripe-checkout.error', { message: err?.message })
    return jsonError('Failed to create checkout session', 500)
  }
}
