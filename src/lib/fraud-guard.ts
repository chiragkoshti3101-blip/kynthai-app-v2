/**
 * Kynthai fraud PREVENTION guard.
 *
 * Detection (src/lib/fraud-checks.ts) flags suspicious activity AFTER it
 * happens. This guard is the enforcement layer: it DECIDES whether a person
 * is allowed in at the entry gates (register / login / provider application)
 * and centralizes a durable, admin-managed BLOCK state so a fraudster is kept
 * out app-wide, not just flagged.
 *
 * Block state (no DB migration — reuses existing columns):
 *   User.verificationLevel = 'blocked'   (free-form String, default 'unverified')
 *   User.verificationRejectedReason      = human-readable block reason
 *
 * ponytail: IP/device fingerprinting is intentionally NOT used here — the app
 * has no persistent IP store (logAudit doesn't record ip), so a per-IP account
 * limit would be unreliable. The gate relies on signals it can verify against
 * the DB today: blocked identifiers, duplicate phone, disposable email.
 */

import { db } from '@/lib/db';
import { logAudit } from '@/lib/auth';

export const BLOCK_LEVEL = 'blocked';
export const UNBLOCK_LEVEL = 'unverified';

/** throwaway / disposable email providers (domain or subdomain suffix match). */
const DISPOSABLE_EMAIL_MARKERS = [
  'mailinator',
  'guerrillamail',
  '10minutemail',
  'tempmail',
  'temp-mail',
  'throwaway',
  'throwawaymail',
  'yopmail',
  'sharklasers',
  'spam4',
  'trash-mail',
  'trashmail',
  'getnada',
  'maildrop',
  'discard.email',
  'mohmal',
  'tempr.email',
  'emailondeck',
  'fakeinbox',
  'mailnesia',
  'mintemail',
  'mailcatch',
  'mytemp',
  '1secmail',
  'inboxes',
];

export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  if (!domain) return false;
  return DISPOSABLE_EMAIL_MARKERS.some(marker => domain.includes(marker));
}

/** True when a Prisma user profile is hard-blocked. */
export function isUserBlocked(profile: { verificationLevel?: string | null } | null | undefined): boolean {
  return !!profile && profile.verificationLevel === BLOCK_LEVEL;
}

export type EnrollmentVerdict =
  | { allowed: true }
  | { allowed: false; code: 'ACCOUNT_BLOCKED' | 'PHONE_IN_USE' | 'DISPOSABLE_EMAIL'; message: string };

/**
 * Enrollment gate — run BEFORE creating a new account.
 * Returns a block verdict when the person looks like a fraudster.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''

function sbHeaders() {
  const key = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

export async function checkEnrollmentGate(input: {
  email: string;
  phone?: string | null;
}): Promise<EnrollmentVerdict> {
  const email = input.email.toLowerCase().trim();

  // 1. Disposable / throwaway email.
  if (isDisposableEmail(email)) {
    await logAudit('system', 'fraud.gate', `email=${email} rule=disposable`, 'security');
    return {
      allowed: false,
      code: 'DISPOSABLE_EMAIL',
      message: 'Registration is not available for this email address.',
    };
  }

  // 2. Blocked identity — email or phone already tied to a hard-blocked account.
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?verificationLevel=eq.blocked&select=id,email,phone&or=(email.eq.${encodeURIComponent(email)},phone.eq.${encodeURIComponent(input.phone || '')})`, {
      headers: sbHeaders(),
    })
    if (res.ok) {
      const blocked = await res.json()
      if (blocked && blocked.length > 0) {
        await logAudit('system', 'fraud.gate', `email=${email} rule=blocked_identity`, 'security');
        return {
          allowed: false,
          code: 'ACCOUNT_BLOCKED',
          message: 'This account is not eligible to register.',
        };
      }
    }
  } catch (e) {
    console.error('Fraud gate check failed:', e)
  }

  // 3. Duplicate phone on an active account
  if (input.phone) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/users?phone=eq.${encodeURIComponent(input.phone)}&verificationLevel=neq.blocked&select=id,email`, {
        headers: sbHeaders(),
      })
      if (res.ok) {
        const phoneUsers = await res.json()
        if (phoneUsers && phoneUsers.length > 0 && phoneUsers[0].email !== email) {
          await logAudit('system', 'fraud.gate', `email=${email} rule=duplicate_phone`, 'security');
          return {
            allowed: false,
            code: 'PHONE_IN_USE',
            message: 'This phone number is already in use on another account.',
          };
        }
      }
    } catch (e) {
      console.error('Phone check failed:', e)
    }
  }

  return { allowed: true };
}

/** Persist a hard block on a user (by id or email). Admin-only call. */
export async function blockUser(
  adminId: string,
  target: { userId?: string; email?: string },
  reason: string
): Promise<boolean> {
  const existing = await db.user.findFirst({
    where: {
      deletedAt: null,
      OR: [{ id: target.userId ?? undefined }, { email: target.email?.toLowerCase() ?? undefined }],
    },
    select: { id: true, email: true },
  });
  if (!existing) return false;
  const note = `${reason} (blocked by admin ${adminId})`;
  await db.user.update({
    where: { id: existing.id },
    data: { verificationLevel: BLOCK_LEVEL, verificationRejectedReason: note },
  });
  await logAudit(adminId, 'admin.user.block', `user=${existing.id} reason=${reason}`, 'security');
  return true;
}

/** Lift a hard block. Admin-only call. */
export async function unblockUser(adminId: string, userId: string): Promise<boolean> {
  const existing = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) return false;
  await db.user.update({
    where: { id: userId },
    data: { verificationLevel: UNBLOCK_LEVEL, verificationRejectedReason: null },
  });
  await logAudit(adminId, 'admin.user.unblock', `user=${userId}`, 'security');
  return true;
}

/** List currently hard-blocked users (admin view). */
export async function getBlockedUsers() {
  return db.user.findMany({
    where: { verificationLevel: BLOCK_LEVEL, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      verificationRejectedReason: true,
      isDemo: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  });
}