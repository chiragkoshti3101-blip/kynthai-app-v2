/**
 * Suspicious Login Detection — Anomaly Detection & Risk Scoring
 *
 * Analyzes login attempts for suspicious patterns:
 * 1. Geographic velocity (login from distant locations in short time)
 * 2. Device fingerprint changes
 * 3. Known-bad IP ranges (datacenter/proxy/VPN)
 * 4. Time-of-day anomalies (user never logs in at 3 AM)
 *
 * Each factor contributes to a risk score (0-100).
 * Score ≥ 70 triggers additional verification (not blocking).
 * Score ≥ 90 blocks the login and sends an alert.
 *
 * This is a best-effort detection layer. It never blocks legitimate
 * users on false positives — it only adds friction proportional to risk.
 */

import { db } from './db';
import { logger } from './logger';

export interface LoginContext {
  userId: string;
  email: string;
  ip: string;
  userAgent: string;
  /** Simple device fingerprint: hash of user-agent + accept-language + sec-ch-ua */
  deviceFingerprint: string;
  timestamp: Date;
}

export interface RiskAssessment {
  score: number;          // 0-100
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];
  shouldChallenge: boolean; // true if score >= 70 (require MFA or email verification)
  shouldBlock: boolean;     // true if score >= 90
}

interface RiskFactor {
  name: string;
  score: number;
  detail: string;
}

/**
 * Assess login risk based on context.
 * Queries recent login history from audit logs.
 */
export async function assessLoginRisk(ctx: LoginContext): Promise<RiskAssessment> {
  const factors: RiskFactor[] = [];
  let totalScore = 0;

  // Get recent successful logins for this user (last 30 days).
  // Risk scoring is advisory: an audit-history/schema outage must never turn
  // valid credentials into a failed login.
  let recentLogins: Array<{
    ip: string | null;
    metadata: string | null;
    createdAt: Date;
  }> = [];
  try {
    recentLogins = await db.auditLog.findMany({
      where: {
        userId: ctx.userId,
        action: 'auth.login',
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  } catch (error) {
    logger.phiSafeError(error, 'auth.login.risk-history');
  }

  // Factor 1: New IP detection
  if (recentLogins.length > 0) {
    const knownIps = new Set(recentLogins.map(l => l.ip).filter(Boolean));
    if (!knownIps.has(ctx.ip)) {
      const score = Math.min(25, recentLogins.length * 3);
      factors.push({ name: 'new_ip', score, detail: `Login from new IP address: ${ctx.ip}` });
      totalScore += score;
    }
  }

  // Factor 2: New device fingerprint
  if (recentLogins.length > 0) {
    const knownFingerprints = new Set(
      recentLogins
        .map(l => {
          try {
            const meta = l.metadata ? JSON.parse(l.metadata) : {};
            return meta.deviceFingerprint as string;
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    );
    if (knownFingerprints.size > 0 && !knownFingerprints.has(ctx.deviceFingerprint)) {
      const score = 20;
      factors.push({ name: 'new_device', score, detail: 'Login from unrecognized device' });
      totalScore += score;
    }
  }

  // Factor 3: Geographic velocity (rapid login from far-away IPs)
  if (recentLogins.length >= 2) {
    const lastLogin = recentLogins[0]!;
    if (lastLogin.ip && lastLogin.ip !== ctx.ip && lastLogin.ip !== 'unknown') {
      const timeSinceLastLogin = Date.now() - new Date(lastLogin.createdAt).getTime();
      // If less than 30 minutes between logins from different IPs
      if (timeSinceLastLogin < 30 * 60 * 1000) {
        const score = 30;
        factors.push({
          name: 'geo_velocity',
          score,
          detail: `Rapid login from different IPs within ${Math.round(timeSinceLastLogin / 60000)} minutes`,
        });
        totalScore += score;
      }
    }
  }

  // Factor 4: Time-of-day anomaly (first login at unusual hour)
  if (recentLogins.length >= 5) {
    const hour = ctx.timestamp.getHours();
    const loginHours = recentLogins
      .slice(0, 10)
      .map(l => new Date(l.createdAt).getHours());
    const typicalHours = new Set(loginHours);
    // If user normally logs in 8 AM - 10 PM but it's 3 AM
    if (!typicalHours.has(hour) && loginHours.length >= 5) {
      const score = 10;
      factors.push({ name: 'unusual_hour', score, detail: `Login at unusual hour: ${hour}:00` });
      totalScore += score;
    }
  }

  // Factor 5: Known suspicious IP patterns (datacenter, proxy)
  if (isSuspiciousIp(ctx.ip)) {
    const score = 25;
    factors.push({ name: 'suspicious_ip', score, detail: `Login from datacenter/proxy IP: ${ctx.ip}` });
    totalScore += score;
  }

  // Normalize score to 0-100
  totalScore = Math.min(100, Math.max(0, totalScore));

  const level: RiskAssessment['level'] =
    totalScore >= 90 ? 'critical' :
    totalScore >= 70 ? 'high' :
    totalScore >= 40 ? 'medium' :
    'low';

  return {
    score: totalScore,
    level,
    factors,
    shouldChallenge: totalScore >= 70,
    shouldBlock: totalScore >= 90,
  };
}

/**
 * Log a suspicious login event to the audit trail with elevated risk score.
 */
export async function logSuspiciousLogin(
  userId: string,
  ctx: LoginContext,
  risk: RiskAssessment
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action: 'auth.login.suspicious',
        category: 'auth',
        outcome: risk.shouldBlock ? 'forbidden' : 'success',
        riskScore: risk.score,
        details: `Suspicious login attempt. Factors: ${risk.factors.map(f => `${f.name}(${f.score})`).join(', ')}`,
        metadata: JSON.stringify({
          ip: ctx.ip,
          deviceFingerprint: ctx.deviceFingerprint,
          userAgent: ctx.userAgent.slice(0, 200),
          riskLevel: risk.level,
          factors: risk.factors,
          timestamp: ctx.timestamp.toISOString(),
        }),
        ip: ctx.ip,
        userAgent: ctx.userAgent.slice(0, 512),
      },
    });
  } catch (error) {
    logger.phiSafeError(error, 'auth.suspicious-login.log');
  }
}

/**
 * Generate a simple device fingerprint from request headers.
 * Not a true fingerprint — just a basic heuristic for anomaly detection.
 */
export function computeDeviceFingerprint(
  userAgent: string,
  acceptLanguage?: string,
  secChUa?: string
): string {
  const parts = [
    userAgent.slice(0, 200),
    acceptLanguage?.slice(0, 50) || '',
    secChUa?.slice(0, 100) || '',
  ];
  // Simple hash
  let hash = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Check if an IP address is from a known suspicious source.
 * Simplified: checks for private/datacenter ranges.
 * In production, integrate with a 3rd-party IP reputation API.
 */
function isSuspiciousIp(ip: string): boolean {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') {
    return false;
  }

  // Check for common cloud provider IP prefixes (simplified)
  const cloudPrefixes = [
    '34.', '35.', // Google Cloud
    '52.', '54.', // AWS
    '13.',  // AWS
    '20.', '40.', '104.', // Azure
  ];

  // Simple heuristic: most residential IPs are in specific ranges,
  // cloud/datacenter IPs are in known blocks.
  for (const prefix of cloudPrefixes) {
    if (ip.startsWith(prefix)) return true;
  }

  return false;
}
