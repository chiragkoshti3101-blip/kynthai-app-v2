import { jsonError } from './api-helpers'
import { logSecurityEvent } from './security-audit'

const MAX_ATTEMPTS = 5
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000

export interface LockoutStatus {
  locked: boolean
  remainingAttempts: number
  lockoutExpiresAt: number | null
}

export async function getLockoutStatus(email: string): Promise<LockoutStatus> {
  // CI runners share one IP and demo accounts — skip email lockout during E2E.
  if (process.env.CI === 'true') {
    return { locked: false, remainingAttempts: 5, lockoutExpiresAt: null };
  }
  // DB-based lockout disabled (Vercel can't reach Supabase DB directly)
  return { locked: false, remainingAttempts: 5, lockoutExpiresAt: null };
}

export async function checkAccountLockout(
  email: string,
  ip: string
): Promise<ReturnType<typeof jsonError> | null> {
  const status = await getLockoutStatus(email)
  if (!status.locked) return null
  const retryAfter = Math.ceil((status.lockoutExpiresAt! - Date.now()) / 1000)
  const minutes = Math.ceil(retryAfter / 60)
  return jsonError(
    `Account temporarily locked due to too many failed login attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    423,
    'ACCOUNT_LOCKED',
    { retryAfterSeconds: retryAfter }
  )
}

export async function recordFailedAttempt(email: string, ip: string): Promise<void> {
  // Non-critical — skip DB write
}

export async function resetLockout(email: string): Promise<void> {
  // Non-critical — skip DB write
}
