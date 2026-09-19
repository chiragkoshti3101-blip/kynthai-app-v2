import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

/**
 * Referral codes are `<3-letter name prefix>-<6 random chars>`, e.g. `SAR-4KQ8ZP`.
 * Kept deliberately narrow: the code travels in a URL path segment, so anything
 * that is not plain uppercase alphanumerics plus `-` is rejected before it can
 * reach a query.
 */
export const REFERRAL_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,19}$/

/** Trim + uppercase a candidate code, or return null when it can't be valid. */
export function normalizeReferralCode(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const code = input.trim().toUpperCase()
  if (!REFERRAL_CODE_PATTERN.test(code)) return null
  return code
}

export interface ReferralRewardTier {
  threshold: number
  reward: string
  description: string
}

export const REFERRAL_REWARD_TIERS: ReferralRewardTier[] = [
  { threshold: 1, reward: '$10 credit', description: 'Get $10 off your next payment' },
  { threshold: 3, reward: '1 month free', description: 'Get 1 month free subscription' },
  { threshold: 5, reward: 'Free annual plan', description: 'Get annual plan for free' },
  { threshold: 10, reward: 'Lifetime Plus', description: 'Free Plus plan for life' },
]

export function getReferralRewards(referralCount: number) {
  return {
    unlocked: REFERRAL_REWARD_TIERS.filter(r => referralCount >= r.threshold),
    nextReward: REFERRAL_REWARD_TIERS.find(r => referralCount < r.threshold) ?? null,
    totalReferrals: referralCount,
  }
}

/**
 * Credit both sides of a referral. Amounts are intentionally symmetric today
 * ($10 each) so the payout is easy to reason about in support conversations.
 */
export async function grantReferralReward(userId: string, type: 'referred' | 'referrer') {
  await db.payment.create({
    data: {
      userId,
      type: 'referral_reward',
      amount: 10,
      currency: 'USD',
      status: 'succeeded',
      provider: 'internal',
      description: `Referral reward (${type})`,
    },
  })
}

export type ApplyReferralResult = {
  applied: boolean
  reason?: 'invalid_code' | 'unknown_code' | 'self_referral' | 'already_referred' | 'error'
  referrerId?: string
}

/**
 * Attribute a new signup to the referral code they arrived with.
 *
 * Best-effort by design: this runs *after* the account already exists, so it
 * must never throw — a bad code is a support question, not a failed signup.
 * Idempotent per user, because a retried registration request must not pay out
 * a second reward.
 */
export async function applyReferralCode(
  newUserId: string,
  rawCode: unknown
): Promise<ApplyReferralResult> {
  const code = normalizeReferralCode(rawCode)
  if (!code) return { applied: false, reason: 'invalid_code' }

  try {
    const referral = await db.referral.findFirst({ where: { code, deletedAt: null } })
    if (!referral) return { applied: false, reason: 'unknown_code' }
    if (referral.referrerId === newUserId) return { applied: false, reason: 'self_referral' }

    const existingUsage = await db.referralUsage.findFirst({ where: { usedById: newUserId } })
    if (existingUsage) return { applied: false, reason: 'already_referred' }

    await db.referralUsage.create({
      data: {
        referralId: referral.id,
        usedById: newUserId,
        referrerId: referral.referrerId,
      },
    })

    await db.referral.update({
      where: { id: referral.id },
      data: { referralCount: { increment: 1 } },
    })

    await grantReferralReward(newUserId, 'referred')
    await grantReferralReward(referral.referrerId, 'referrer')

    return { applied: true, referrerId: referral.referrerId }
  } catch (error) {
    logger.phiSafeError(error, 'referral.apply')
    return { applied: false, reason: 'error' }
  }
}