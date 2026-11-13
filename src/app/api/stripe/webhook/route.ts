import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/auth';
import { jsonError, jsonOk } from '@/lib/api-helpers';
import { logger } from '@/lib/logger';
import { tierFromClaim, amountMatchesTier, TierKey } from '@/lib/currency';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return jsonError('Stripe is not configured', 503);
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-08-26.dahlia',
  });

  const sig = req.headers.get('stripe-signature');
  const body = await req.text();

  let event: any;
  try {
    if (!sig) return jsonError('Missing Stripe signature', 400);
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.phiSafeError(err, 'stripe.webhook.verify');
    return jsonError('Invalid webhook signature', 400);
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const intent = event.data.object as Stripe.PaymentIntent;
      await handlePaymentSucceeded(intent);
      break;
    }
    case 'payment_intent.payment_failed': {
      const intent = event.data.object as Stripe.PaymentIntent;
      await handlePaymentFailed(intent);
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscriptionUpdate(sub);
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscriptionDeleted(sub);
      break;
    }
    default:
      logger.info('Unhandled Stripe event: ' + event.type);
  }

  return jsonOk({ received: true });
}

async function handlePaymentSucceeded(intent: any) {
  const userId = intent.metadata.userId;
  if (!userId) {
    logger.warn('Stripe PaymentIntent ' + intent.id + ' missing userId in metadata');
    return;
  }

  const payment = await db.payment.findFirst({
    where: { providerRef: intent.id, userId },
    orderBy: { createdAt: 'desc' },
  });

  if (payment && payment.status !== 'succeeded') {
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: 'succeeded',
        provider: 'stripe',
        amount: intent.amount / 100,
        currency: intent.currency.toUpperCase(),
      },
    });

    const verifiedTier = verifiedTierFromIntent(intent);
    if (!verifiedTier) {
      logger.warn('Stripe PaymentIntent ' + intent.id + ' amount does not match claimed tier — tier NOT granted');
      await logAudit(userId, 'payment.tier_mismatch', 'payment=' + payment.id + ' amount=' + intent.amount / 100 + ' currency=' + intent.currency);
      return;
    }

    await db.user.update({
      where: { id: userId },
      data: { subscriptionTier: verifiedTier },
    });

    await logAudit(userId, 'payment.succeeded', 'payment=' + payment.id + ' amount=' + intent.amount / 100 + ' tier=' + verifiedTier);
  }
}

function verifiedTierFromIntent(intent: any) {
  const claimed = tierFromClaim(intent.metadata.tier);
  if (!claimed) return null;
  const amountDollars = intent.amount / 100;
  const currency = (intent.currency || 'usd').toUpperCase();
  return amountMatchesTier(amountDollars, currency, claimed) ? claimed : null;
}

async function handlePaymentFailed(intent: any) {
  const userId = intent.metadata.userId;
  if (!userId) return;

  const payment = await db.payment.findFirst({
    where: { providerRef: intent.id, userId },
    orderBy: { createdAt: 'desc' },
  });

  if (payment) {
    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'failed' },
    });
    await logAudit(userId, 'payment.failed', 'payment=' + payment.id);
  }
}

async function handleSubscriptionUpdate(sub: any) {
  const userId = sub.metadata.userId;
  if (!userId) return;

  if (sub.status !== 'active' && sub.status !== 'trialing') {
    if (sub.status === 'past_due' || sub.status === 'unpaid') {
      await db.user.update({
        where: { id: userId },
        data: { subscriptionTier: 'free' },
      });
      await logAudit(userId, 'subscription.payment_failed', 'status=' + sub.status);
    }
    return;
  }

  const price = sub.items.data[0]?.price;
  const claimed = tierFromClaim(price?.metadata?.tier);
  if (!claimed) return;

  const unitAmountDollars = price?.unit_amount != null ? price.unit_amount / 100 : null;
  if (
    unitAmountDollars !== null &&
    !amountMatchesTier(unitAmountDollars, (price?.currency || 'usd').toUpperCase(), claimed)
  ) {
    logger.warn('Stripe subscription ' + sub.id + ' unit amount does not match tier ' + claimed + ' — tier NOT granted');
    return;
  }

  await db.user.update({
    where: { id: userId },
    data: { subscriptionTier: claimed },
  });

  await logAudit(userId, 'subscription.updated', 'tier=' + claimed + ' status=' + sub.status);
}

async function handleSubscriptionDeleted(sub: any) {
  const userId = sub.metadata.userId;
  if (!userId) return;

  await db.user.update({
    where: { id: userId },
    data: { subscriptionTier: 'free' },
  });

  await logAudit(userId, 'subscription.cancelled', 'subscription_cancelled');
}