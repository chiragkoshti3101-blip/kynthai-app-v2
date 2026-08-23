import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { logAudit } from '@/lib/auth';
import { isValidEmail, rateLimit, getIp } from '@/lib/security';
import { checkCsrf, isSecureRequest } from '@/lib/csrf';
import { signSessionToken } from '@/lib/session-signing';
import { verifyTurnstileToken, isCaptchaConfigured } from '@/lib/captcha';
import { assessLoginRisk, logSuspiciousLogin, computeDeviceFingerprint } from '@/lib/login-anomaly';
import {
  jsonError,
  jsonOk,
  readJson,
  isUserMinor as isUserMinorFlag,
} from '@/lib/api-helpers';
import { loginSchema } from '@/lib/schemas';
import { isIpBlocked, logSecurityEvent } from '@/lib/security-audit';
import { checkAccountLockout, recordFailedAttempt, resetLockout } from '@/lib/login-lockout';
import { isUserBlocked } from '@/lib/fraud-guard';
import { getSupabaseProfile } from '@/lib/supabase/sync';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const limited = rateLimit(req, 10, 60000, { globalKey: true });
    if (limited) return limited;

    const csrfErr = await checkCsrf(req);
    if (csrfErr) return csrfErr;

    const ip = getIp(req);
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
    const { email, password, captchaToken } = loginResult.data;
    if (!isValidEmail(email)) return jsonError('Valid email is required', 400);


    // Known demo accounts — skip CAPTCHA so QA can sign in without Turnstile friction
    const DEMO_EMAILS = new Set([
      'patient@kynthai.app', 'patient@demo.kynthai.app',
      'caretaker@kynthai.app', 'caretaker@demo.kynthai.app',
      'doctor@kynthai.app', 'priya@demo.kynthai.app',
      'lab@kynthai.app', 'pathlabs@demo.kynthai.app',
      'admin@kynthai.app', 'admin@demo.kynthai.app',
    ]);
    const isDemoEmail = DEMO_EMAILS.has(email.toLowerCase());

    // ── CAPTCHA verification ──────────────────────────────────────────
    if (isCaptchaConfigured() && !isDemoEmail) {
      if (!captchaToken) {
        return jsonError('CAPTCHA verification is required. Please complete the security check.', 400, 'CAPTCHA_REQUIRED');
      }
      const captchaResult = await verifyTurnstileToken(captchaToken, ip);
      if (!captchaResult.valid) {
        return jsonError(captchaResult.error || 'CAPTCHA verification failed', 400, 'CAPTCHA_FAILED');
      }
    }

    // ── Account-based brute-force lockout check ──────────────────────────
    const lockoutErr = await checkAccountLockout(email, ip);
    if (lockoutErr) return lockoutErr;

    // ── Supabase Auth: sign in ──────────────────────────────────────────
    let supabaseResponseCookies: { name: string; value: string; options?: Record<string, unknown> }[] = [];
    let user: any = null;

    try {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              const cookies = req.cookies.getAll();
              return cookies;
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value, options }) => {
                req.cookies.set({ name, value, ...options });
                supabaseResponseCookies.push({ name, value, options });
              });
            },
          },
        }
      );

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      
      if (authError || !authData.user) {
        // Local auth: check Prisma database with bcrypt
        const localUser = await db.user.findUnique({ where: { email } });
        if (localUser?.password) {
          const bcrypt = await import('bcryptjs');
          const valid = await bcrypt.compare(password, localUser.password);
          if (valid) {
            user = localUser;
          }
        }
        if (!user) {
          await recordFailedAttempt(email, ip);
          return jsonError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
        }
      } else {
        // Supabase auth succeeded - get Prisma profile
              try {
                user = await getSupabaseProfile(authData.user);
              } catch (profileError) {
                throw profileError;
              }
      
              if (!user) {
                try {
                  const { syncSupabaseUser } = await import('@/lib/supabase/sync');
                  user = await syncSupabaseUser(authData.user);
                } catch (syncError) {
                  throw syncError;
                }
                if (!user) {
                  return jsonError('Failed to create user profile', 500, 'PROFILE_CREATE_FAILED');
                }
              }
      }
    } catch (supabaseError) {
      // Supabase client creation failed (e.g., invalid URL/keys), fall back to local auth
      const localUser = await db.user.findUnique({ where: { email } });
      if (localUser?.password) {
        const bcrypt = await import('bcryptjs');
        const valid = await bcrypt.compare(password, localUser.password);
        if (valid) {
          user = localUser;
        }
      }
      if (!user) {
        await recordFailedAttempt(email, ip);
        return jsonError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      }
    }

    // ── Fraud prevention: hard-blocked account ────────────────────────
    // A user marked verificationLevel='blocked' by an admin may not sign in.
    if (isUserBlocked(user)) {
      await logAudit(user.id, 'auth.login.blocked', `email=${user.email}`, 'security');
      return jsonError(
        'This account has been blocked for security reasons. Contact support@kynthai.app.',
        423,
        'ACCOUNT_BLOCKED'
      );
    }

    // Reset lockout on successful login
    await resetLockout(email);

    // Compliance: consent is enforced at the DATA layer (requireAuth →
    // checkConsent blocks every health-data endpoint for unconsented users)
    // and at the UI layer (onboarding consent slide / patient ConsentGate).
    // Login must NOT hard-block unconsented users: there is no consent UI
    // reachable without a session, so a hard block here permanently locks the
    // account (chicken-and-egg). Issuing the session lets the app route the
    // user straight to the consent flow; data stays inaccessible until they
    // consent. This mirrors the US-privacy pattern of consent-before-processing
    // instead of consent-before-authentication.
    const isUserMinor = isUserMinorFlag({
      dateOfBirth: user.dateOfBirth ?? null,
    } as any);

    // ── Suspicious login detection ──────────────────────────────────
    const deviceFingerprint = computeDeviceFingerprint(
      req.headers.get('user-agent') || '',
      req.headers.get('accept-language') || undefined,
      req.headers.get('sec-ch-ua') || undefined
    );

    const riskAssessment = await assessLoginRisk({
      userId: user.id,
      email: user.email,
      ip,
      userAgent: req.headers.get('user-agent') || '',
      deviceFingerprint,
      timestamp: new Date(),
    });

    if (riskAssessment.shouldBlock) {
      await logSuspiciousLogin(user.id, {
        userId: user.id,
        email: user.email,
        ip,
        userAgent: req.headers.get('user-agent') || '',
        deviceFingerprint,
        timestamp: new Date(),
      }, riskAssessment);
      return jsonError('This login attempt was blocked for security reasons. Please try again or contact support.', 423, 'LOGIN_BLOCKED');
    }

    if (riskAssessment.shouldChallenge) {
      await logSuspiciousLogin(user.id, {
        userId: user.id,
        email: user.email,
        ip,
        userAgent: req.headers.get('user-agent') || '',
        deviceFingerprint,
        timestamp: new Date(),
      }, riskAssessment);
      // Still allow login but flag in audit log
    }

    await logAudit(user.id, 'auth.login', `role=${user.role}`);

    // Store device fingerprint in audit log metadata for future reference
    try {
      const { db } = await import('@/lib/db');
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'auth.login.device',
          category: 'auth',
          outcome: 'success',
          riskScore: riskAssessment.score,
          metadata: JSON.stringify({ deviceFingerprint, ip, riskScore: riskAssessment.score }),
          ip,
          userAgent: req.headers.get('user-agent')?.slice(0, 512),
          details: `risk=${riskAssessment.level} score=${riskAssessment.score}`,
        },
      });
    } catch {
      // Non-critical
    }

    const responseBody = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      subscriptionTier: user.subscriptionTier,
      isDemo: user.isDemo,
      isUserMinor,
      // Server truth for post-login routing (skip Welcome tour if already consented)
      consentAccepted: !!user.consentAccepted,
      dataProcessingConsent: !!user.dataProcessingConsent,
      aiTrainingConsent: !!user.aiTrainingConsent,
    };
    const res = jsonOk(responseBody);
    // Set session cookie (Supabase cookies if available, otherwise local session)
    for (const cookie of supabaseResponseCookies) {
      res.cookies.set(cookie.name, cookie.value, cookie.options as any);
    }
    // Always set the HMAC-signed kynthai-session cookie on success, regardless
    // of which auth path was used (Supabase or local). The edge middleware
    // trusts ONLY this cookie and signature-verified sb-* JWTs — a login that
    // sets neither would be invisible to the portal guard. Supabase sessions
    // rotate their sb-* tokens hourly, so the fixed 7-day kynthai-session
    // expiry is renewed here on each new login.
    const signedValue = await signSessionToken(user.id);
    if (!signedValue) {
      // Signing failed in production — abort rather than set an unsigned cookie
      return jsonError('Server configuration error', 500, 'INTERNAL_ERROR');
    }
    res.cookies.set('kynthai-session', signedValue, {
      httpOnly: true,
      secure: isSecureRequest(req),
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
    return res;
  } catch (error) {
    logger.phiSafeError(error, 'login.POST');
    return jsonError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}