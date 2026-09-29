import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/auth';
import { sanitizeText, rateLimit } from '@/lib/security';
import {
  requireAuth,
  requireAuthWithCsrf,
  jsonError,
  jsonOk,
  readJson,
  audit,
} from '@/lib/api-helpers';
import { logger } from '@/lib/logger';
import { PRICING, LEGACY_PRICING, tierFromClaim, Currency } from '@/lib/currency';
export const dynamic = 'force-dynamic';

// POST /api/payments
export async function POST(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return limited;

  const { response, user } = await requireAuthWithCsrf(req);
  if (response || !user) return response!;
  const u = user!;

  try {
    const body = await readJson<{
      type?: string;
      amount?: number;
      currency?: string;
      description?: string;
      provider?: string;
      checkoutFounder?: boolean;
    }>(req);
    if (!body) return jsonError('Invalid JSON', 400);
    if (!body.amount || Number(body.amount) <= 0) return jsonError('Valid amount is required', 400);
    if (Number(body.amount) > 1_000_000) return jsonError('Amount exceeds maximum allowed', 400);

    // SECURITY: validate amount against server-side tier pricing — never trust
    // client input. The claimed tier comes from body.type; the amount must match
    // that tier's published monthly OR yearly price, so a user can't pay the
    // cheaper Plus price while claiming the Family tier.
    const claimedTier = tierFromClaim(body.type);
    const tierKey = claimedTier ?? (u.subscriptionTier === 'family_pro' ? 'family_pro' : 'plus');
    const currency = (body.currency || 'USD') as Currency;
    const pricing = PRICING[currency] ?? PRICING.USD;
    const prices = pricing[tierKey];
    const launchPrices = currency === 'USD' ? LEGACY_PRICING.USD[tierKey] : null;
    const matchesStandard = !!prices && (
      Math.abs(Number(body.amount) - prices.monthly) <= 0.01 ||
      Math.abs(Number(body.amount) - prices.yearly) <= 0.01
    );
    const matchesLaunch = body.checkoutFounder === true && !!launchPrices &&
      Math.abs(Number(body.amount) - launchPrices.monthly) <= 0.01;
    if (!matchesStandard && !matchesLaunch) {
      return jsonError('Amount does not match the selected subscription tier', 400);
    }

    // SECURITY: provider is determined server-side only — never trust client input.
    const isProduction = process.env.NODE_ENV === 'production';
    const provider = isProduction ? 'stripe' : 'mock';

    if (!isProduction && body.provider && body.provider !== 'mock') {
      return jsonError('Provider must be mock in non-production', 400);
    }

    // SECURITY: prevent double-charge — atomic findFirst + $transaction with
    // Serializable isolation prevents TOCTOU race condition under concurrent
    // requests. Two simultaneous requests cannot both create a pending payment.
    let payment: Awaited<ReturnType<typeof db.payment.create>> | null = null;
    let attempts = 0;
    const maxRetries = 2;
    while (!payment && attempts < maxRetries) {
      try {
        payment = await db.$transaction(
          async tx => {
            // Re-check inside the transaction — serializable isolation
            // guarantees no concurrent transaction can sneak through.
            const pending = await tx.payment.findFirst({
              where: {
                userId: u.id,
                status: 'pending',
                createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
              },
              orderBy: { createdAt: 'desc' },
            });
            if (pending) return pending as any;
            return tx.payment.create({
              data: {
                userId: u.id,
                type: sanitizeText(body.type, 60) || 'generic',
                amount: Number(body.amount),
                currency: sanitizeText(body.currency, 5) || 'USD',
                status: 'pending',
                provider,
                description: sanitizeText(body.description, 300),
              },
            });
          },
          { isolationLevel: 'Serializable' }
        );
      } catch {
        attempts++;
        if (attempts >= maxRetries) throw new Error('Payment creation conflict — try again');
      }
    }
    if (!payment) return jsonError('Payment creation conflict — try again', 409);

    await logAudit(u.id, 'payment.create', `payment=${payment.id} amount=${payment.amount}`);

    // If Stripe is configured, create a real PaymentIntent
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (stripeSecretKey && /^sk_(live|test)_[A-Za-z0-9]{24,}$/.test(stripeSecretKey)) {
      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(stripeSecretKey);

        // Create a Stripe Customer if not already linked
        let customerId = u.stripeCustomerId;
        if (!customerId) {
          const customer = await stripe.customers.create({
            email: u.email,
            name: u.name ?? '',
            metadata: { userId: u.id },
          });
          customerId = customer.id;
          await db.user.update({
            where: { id: u.id },
            data: { stripeCustomerId: customerId },
          });
        }

        // Use idempotency key to prevent duplicate charges
        const idempotencyKey = `payment_${payment.id}`;

        const intent = await stripe.paymentIntents.create(
          {
            amount: Math.round(Number(body.amount) * 100),
            currency: (body.currency || 'USD').toLowerCase(),
            customer: customerId,
            metadata: {
              paymentId: payment.id,
              userId: u.id,
              // SECURITY: tier is set server-side from the validated tier — never
              // echoed verbatim from client input.
              tier: tierKey,
            },
            description: sanitizeText(body.description, 300) || 'Kynthai.com subscription',
            // Enable Apple Pay, Google Pay, and other wallets dynamically based
            // on the user's device/browser. The Stripe Payment Element will
            // render these automatically when this is set.
            automatic_payment_methods: { enabled: true },
          },
          { idempotencyKey }
        );

        // Update payment with Stripe reference
        await db.payment.update({
          where: { id: payment.id },
          data: { provider: 'stripe', providerRef: intent.id },
        });

        return jsonOk({
          paymentId: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          clientSecret: intent.client_secret,
          status: payment.status,
        });
      } catch (stripeError) {
        // Security: never log Stripe error details (may contain payment IDs, amounts)
        logger.phiSafeError(stripeError, 'payments.stripe_intent');
        // Mark payment as failed
        await db.payment.update({
          where: { id: payment.id },
          data: { status: 'failed' },
        });
        if (isProduction) {
          return jsonError('Payment processing failed. Please try again.', 502);
        }
        // Non-production: fall through to mock mode
      }
    }

    // Mock mode (dev/test) — returns a fake client secret
    return jsonOk({
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      clientSecret: `mock_secret_${payment.id}`,
      status: payment.status,
    });
  } catch (error) {
    // Security: never log raw DB errors or payment amounts
    logger.phiSafeError(error, 'payments.POST');
    return jsonError('Internal server error', 500);
  }
}
