import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkCsrf, isSecureRequest } from '@/lib/csrf';
import { rateLimit, getIp, isValidEmail } from '@/lib/security';
import { jsonError, jsonOk, readJson } from '@/lib/api-helpers';
import { signSessionToken } from '@/lib/session-signing';
import { setPortalRoleCookie } from '@/lib/portal-role-cookie';
import { loginSchema } from '@/lib/schemas';
import { logSecurityEvent } from '@/lib/security-audit';
import { logger } from '@/lib/logger';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // C4: this endpoint is a demo convenience — never let it authenticate
    // against the live production database. In production, login must go
    // through the real auth flow only.
    if (process.env.NODE_ENV === 'production') {
      return jsonError('Not available in production', 404, 'NOT_FOUND');
    }

    const limited = rateLimit(req, 10, 60000, { globalKey: true });
    if (limited) return limited;

    const csrfErr = await checkCsrf(req);
    if (csrfErr) return csrfErr;

    const ip = getIp(req);
    const { isIpBlocked } = await import('@/lib/security-audit');
    const ipBlocked = await isIpBlocked(ip);
    if (ipBlocked) {
      return jsonError('Too many failed login attempts from this network. Try again later.', 423);
    }

    const rawBody = await readJson(req);
    if (!rawBody) return jsonError('Validation failed', 422, 'VALIDATION_ERROR');
    const loginResult = loginSchema.safeParse(rawBody);
    if (!loginResult.success) {
      const fields: Record<string, string> = {};
      for (const issue of loginResult.error.issues) {
        fields[String(issue.path.join('.') || 'body')] = issue.message;
      }
      return jsonError('Validation failed', 422, 'VALIDATION_ERROR', { fields });
    }
    const { email, password } = loginResult.data;
    if (!isValidEmail(email)) return jsonError('Valid email is required', 400);

    // ── Local Prisma Auth: verify against local database ──────────────────
    const user = await db.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      await logSecurityEvent('unknown', 'auth.login.failed', `ip=${ip} email=${email}`);
      return jsonError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      await logSecurityEvent(user.id, 'auth.login.failed', `ip=${ip} email=${email}`);
      return jsonError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    // Compliance: enforce consent before issuing session
    const { checkConsent } = await import('@/lib/api-helpers');
    const consentErr = checkConsent({
      consentAccepted: user.consentAccepted ?? false,
      dataProcessingConsent: user.dataProcessingConsent ?? false,
      aiTrainingConsent: user.aiTrainingConsent ?? false,
    });
    if (consentErr) return consentErr;

    const { isUserMinor } = await import('@/lib/api-helpers');
    const isUserMinorFlag = isUserMinor({ dateOfBirth: user.dateOfBirth } as any);

    await import('@/lib/auth').then(m => m.logAudit(user.id, 'auth.login', `role=${user.role}`));

    const responseBody = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      subscriptionTier: user.subscriptionTier,
      isDemo: user.isDemo,
      isUserMinor: isUserMinorFlag,
    };
    const res = jsonOk(responseBody);
    // Set a signed session cookie for demo mode
    const signedValue = await signSessionToken(user.id);
    if (!signedValue) {
      return jsonError('Server configuration error', 500, 'INTERNAL_ERROR');
    }
    res.cookies.set('kynthai-session', signedValue, {
      httpOnly: true,
      secure: isSecureRequest(req),
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });
    setPortalRoleCookie(res, user.role, isSecureRequest(req));
    return res;
  } catch (error) {
    logger.phiSafeError(error, 'demo-login.POST');
    return jsonError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}