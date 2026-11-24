/**
 * Free Tier Guard — usage tracking and enforcement for the "Free Forever" plan.
 *
 * Server-side enforcement (DB-backed) + client-side type/constants for UI gating.
 *
 * Free tier rules:
 *   - 5 medicine adds per day (UTC)
 *   - 5 AI chat messages per day (UTC)
 *   - 1 prescription scan per week (rolling 7-day window)
 *   - Blocked features: Care, Bookings, Lab tests, Prescriptions, Video calls
 *   - Allowed: Home dashboard, Account settings
 *   - Daily reset at 00:00 UTC (meds + AI); 7-day rolling window (prescription scan)
 */

import { db } from './db';
import { recordUsageAtomically } from './supabase-db';

// ── Constants ────────────────────────────────────────────────────────────────

export const FREE_TIER = 'free' as const;
export const TIERS_UNLOCKED = new Set(['plus', 'pro', 'family_pro']);

/** Daily usage limits for free-tier users. */
export const FREE_TIER_MEDICINE_LIMIT = 5;
export const FREE_TIER_AI_LIMIT = 5;
/** Weekly (rolling 7-day) prescription scan limit for free-tier users. */
export const FREE_TIER_PRESCRIPTION_SCAN_WEEKLY_LIMIT = 1;

/** Feature names that are fully blocked for free-tier users. */
export const BLOCKED_FEATURES = {
  care: 'Care',
  bookings: 'Bookings',
  labTests: 'Lab tests',
  prescriptions: 'Prescriptions',
  videoCalls: 'Video calls',
  doctors: 'Doctors listing',
} as const;

/** Today's UTC start (midnight). */
export function todayUtcStart(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Today's UTC end (just before midnight). */
export function todayUtcEnd(): Date {
  const d = new Date();
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/** Rolling 7-day window start (UTC). */
export function weekUtcStart(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - 6);
  return d;
}

// ── Feature-key mapping ──────────────────────────────────────────────────────

const FEATURE_MEDICINE = 'add_medication';
const FEATURE_AI_CHAT = 'ai_chat';
const FEATURE_PRESCRIPTION_SCAN = 'prescription_scan';

// ── DB-backed usage helpers ──────────────────────────────────────────────────

/**
 * Read today's usage for a user by feature. Returns count for each feature.
 */
export async function getFreeTierUsage(userId: string): Promise<{
  medicinesAdded: number;
  aiChatsUsed: number;
}> {
  const dayStart = todayUtcStart();

  const medRow = await db.freeTierUsage.findFirst({
    where: {
      userId,
      feature: FEATURE_MEDICINE,
      date: { gte: dayStart, lt: todayUtcEnd() },
    },
  });
  const aiRow = await db.freeTierUsage.findFirst({
    where: {
      userId,
      feature: FEATURE_AI_CHAT,
      date: { gte: dayStart, lt: todayUtcEnd() },
    },
  });

  return {
    medicinesAdded: medRow?.count ?? 0,
    aiChatsUsed: aiRow?.count ?? 0,
  };
}

/**
 * Count prescription scans in the last 7 days for a user.
 */
export async function getWeeklyPrescriptionScans(userId: string): Promise<number> {
  const weekStart = weekUtcStart();
  const rows = await db.freeTierUsage.findMany({
    where: {
      userId,
      feature: FEATURE_PRESCRIPTION_SCAN,
      date: { gte: weekStart },
    },
  });
  return rows.reduce((sum, r) => sum + r.count, 0);
}

/**
 * Can a free-tier user do a prescription scan this week?
 */
export async function canUsePrescriptionScan(userId: string): Promise<boolean> {
  const used = await getWeeklyPrescriptionScans(userId);
  return used < FREE_TIER_PRESCRIPTION_SCAN_WEEKLY_LIMIT;
}

/**
 * Get remaining prescription scans this week.
 */
export async function getRemainingPrescriptionScans(userId: string): Promise<number> {
  const used = await getWeeklyPrescriptionScans(userId);
  return Math.max(0, FREE_TIER_PRESCRIPTION_SCAN_WEEKLY_LIMIT - used);
}

/**
 * Record a prescription scan usage (call after a successful scan).
 */
export async function recordPrescriptionScanUsage(userId: string): Promise<void> {
  const feature = FEATURE_PRESCRIPTION_SCAN;

  await recordUsageAtomically(userId, feature, 'prescription_scan');
}

/**
 * Can the user add a medication today? True only for paid tiers or if
 * today's count is below the limit (5/day).
 */
export async function canAddMedication(userId: string): Promise<boolean> {
  const { medicinesAdded } = await getFreeTierUsage(userId);
  return medicinesAdded < FREE_TIER_MEDICINE_LIMIT;
}

/**
 * Get remaining medicine additions for the user today.
 */
export async function getRemainingMedicineAdds(userId: string): Promise<number> {
  const { medicinesAdded } = await getFreeTierUsage(userId);
  return Math.max(0, FREE_TIER_MEDICINE_LIMIT - medicinesAdded);
}

/**
 * Can the user send an AI chat message today?
 */
export async function canUseAI(userId: string): Promise<boolean> {
  const { aiChatsUsed } = await getFreeTierUsage(userId);
  return aiChatsUsed < FREE_TIER_AI_LIMIT;
}

/**
 * Get remaining AI messages for the user today.
 */
export async function getRemainingAiChats(userId: string): Promise<number> {
  const { aiChatsUsed } = await getFreeTierUsage(userId);
  return Math.max(0, FREE_TIER_AI_LIMIT - aiChatsUsed);
}

/**
 * Can a free-tier user access a given feature?
 * Returns false + reason string if blocked for free tier.
 */
export function canAccessFeature(
  tier: string | undefined,
  feature: keyof typeof BLOCKED_FEATURES
): { allowed: boolean; reason?: string } {
  if (!tier || TIERS_UNLOCKED.has(tier)) return { allowed: true };
  if (BLOCKED_FEATURES[feature]) {
    return {
      allowed: false,
      reason: `${BLOCKED_FEATURES[feature]} requires a Plus or higher subscription.`,
    };
  }
  return { allowed: true };
}

/**
 * Locked feature display config (UI helper).
 */
export function lockedFeatureConfig(feature: keyof typeof BLOCKED_FEATURES): {
  label: string;
  cta: string;
} {
  const label = BLOCKED_FEATURES[feature];
  return {
    label: `${label} — Upgrade to access`,
    cta: `Upgrade to Plus to unlock ${label.toLowerCase()}.`,
  };
}

/**
 * Increment today's usage counter for the given action.
 * Use after the operation succeeds (so failed interactions aren't counted).
 */
export async function incrementUsage(
  userId: string,
  action: 'medicine_add' | 'ai_chat'
): Promise<void> {
  const feature = action === 'medicine_add' ? FEATURE_MEDICINE : FEATURE_AI_CHAT;
  await recordUsageAtomically(userId, feature, action);
}

// ── Client-side gating helpers (no DB access — used in components) ───────────

/**
 * Client-side check — use for UI gating only; always recheck server-side.
 */
export function isFreeTier(tier: string | undefined): boolean {
  return !tier || tier === FREE_TIER;
}

/**
 * Usage state for the free tier banner.
 */
export interface FreeTierStatus {
  isFree: boolean;
  medicinesUsed: number;
  medicinesLimit: number;
  aiChatsUsed: number;
  aiChatsLimit: number;
  medicineRemaining: number;
  aiRemaining: number;
}

export function makeFreeTierStatus(medicinesAdded: number, aiChatsUsed: number): FreeTierStatus {
  return {
    isFree: true,
    medicinesUsed: medicinesAdded,
    medicinesLimit: FREE_TIER_MEDICINE_LIMIT,
    aiChatsUsed: aiChatsUsed,
    aiChatsLimit: FREE_TIER_AI_LIMIT,
    medicineRemaining: Math.max(0, FREE_TIER_MEDICINE_LIMIT - medicinesAdded),
    aiRemaining: Math.max(0, FREE_TIER_AI_LIMIT - aiChatsUsed),
  };
}
