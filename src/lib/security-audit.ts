/**
 * src/lib/security-audit.ts — HARDENED
 *
 * Fix: isIpBlocked() now fails CLOSED instead of OPEN.
 * If the audit log is unavailable, we block the IP rather than
 * potentially allowing a brute-force attack during a DB outage.
 */

import { db } from './db'

export type SecurityEvent =
  | 'auth.login.failed'
  | 'auth.login.success'
  | 'auth.register'
  | 'auth.logout'
  | 'auth.lockout'
  | 'api.rate_limit'
  | 'api.csrf_fail'
  | 'api.unauthorized'
  | 'data.export'
  | 'data.delete'
  | 'payment.failed'
  | 'payment.success'
  | 'sos.triggered'
  | 'prescription.uploaded'

export async function logSecurityEvent(
  userId: string,
  event: SecurityEvent,
  details?: string,
  ip?: string
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action: event,
        details: details || null,
        ip: ip || null,
      },
    })
  } catch {
    // Silently fail — audit logging should never break the main flow
  }
}

/**
 * Check if an IP has too many failed attempts.
 * FAILS CLOSED: if we can't check the DB, we block the IP.
 */
export async function isIpBlocked(ip: string): Promise<boolean> {
  try {
    const recentFailures = await db.auditLog.count({
      where: {
        action: 'auth.login.failed',
        ip,
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) }, // Last 15 minutes
      },
    })
    return recentFailures >= 10 // Block after 10 failed attempts from same IP
  } catch {
    // FAIL CLOSED: if we can't verify, block the IP
    return true
  }
}
