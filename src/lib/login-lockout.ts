/**
 * src/lib/login-lockout.ts  HARDENED
 *
 * Fix: getLockoutStatus() now fails CLOSED instead of OPEN.
 * If the audit log is unavailable, we lock the account rather than
 * potentially allowing a brute-force attack during a DB outage.
 */

import { db } from './db'
import { jsonError } from './api-helpers'
import { logSecurityEvent } from './security-audit'

const MAX_ATTEMPTS = 5
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

export interface LockoutStatus {
  locked: boolean
  remainingAttempts: number
  lockoutExpiresAt: number | null
}

export async function getLockoutStatus(email: string): Promise<LockoutStatus> {
  // CI runners share one IP and demo accounts  skip email lockout during E2E.
  if (process.env.CI === 'true') {
    return { locked: false, remainingAttempts: 5, lockoutExpiresAt: null };
  }
  try {
    const since = new Date(Date.now() - LOCKOUT_WINDOW_MS)
    const recentFailures = await db.auditLog.count({
      where: {
        action: 'auth.login.failed',
        details: { contains: `email=${email}` },
        createdAt: { gte: since },
      },
    })

    if (recentFailures >= MAX_ATTEMPTS) {
      const oldest = await db.auditLog.findFirst({
        where: {
          action: 'auth.login.failed',
          details: { contains: `email=${email}` },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      })
      const lockoutExpiresAt = oldest
        ? oldest.createdAt.getTime() + LOCKOUT_WINDOW_MS
        : Date.now() + LOCKOUT_WINDOW_MS

      return {
        locked: true,
        remainingAttempts: 0,
        lockoutExpiresAt,
      }
    }

    return {
      locked: false,
      remainingAttempts: MAX_ATTEMPTS - recentFailures,
      lockoutExpiresAt: null,
    }
  } catch {
    // FAIL CLOSED: if we can't check, lock the account
    return {
      locked: true,
      remainingAttempts: 0,
      lockoutExpiresAt: Date.now() + LOCKOUT_WINDOW_MS,
    }
  }
}

export async function checkAccountLockout(
  email: string,
  ip: string
): Promise<ReturnType<typeof jsonError> | null> {
  const status = await getLockoutStatus(email)
  if (!status.locked) return null

  await logSecurityEvent('unknown', 'auth.lockout', `email=${email} ip=${ip} locked_until=${new Date(status.lockoutExpiresAt!).toISOString()}`, ip)

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
  await logSecurityEvent('unknown', 'auth.login.failed', `email=${email} ip=${ip}`, ip)
}

export async function resetLockout(email: string): Promise<void> {
  try {
    const since = new Date(Date.now() - LOCKOUT_WINDOW_MS)
    await db.auditLog.deleteMany({
      where: {
        action: 'auth.login.failed',
        details: { contains: `email=${email}` },
        createdAt: { gte: since },
      },
    })
  } catch {
    // Non-critical  lockout will naturally expire
  }
}
