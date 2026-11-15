import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/auth';
import {
  sanitizeText,
  isValidEmail,
  isValidE164,
  rateLimit,
  validatePasswordStrengthAsync,
  getIp,
} from '@/lib/security';
import { checkCsrf } from '@/lib/csrf';
import {
  jsonError,
  jsonOk,
  readJson,
  ensureDemoUsers,
  checkConsent,
} from '@/lib/api-helpers';
import { registerSchema } from '@/lib/schemas';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { syncSupabaseUser } from '@/lib/supabase/sync';
import { verifyTurnstileToken, isCaptchaConfigured } from '@/lib/captcha';
import { checkEnrollmentGate } from '@/lib/fraud-guard';
import { createSafeServerClient } from '@/lib/supabase/get-server-client';
import { withTimeout } from '@/lib/with-timeout';
export const dynamic = 'force-dynamic';

const WEAK_PASSWORDS = new Set([
  'password', '123456', '12345678', 'qwerty', 'abc123', '111111',
  '1234567', 'password1', '123456789', '12345', 'admin', 'letmein',
  'welcome', 'monkey', 'iloveyou', '000000', 'sunshine', 'princess',
  'football', 'baseball', 'password123', 'Password123', '@Password123',
]);

export async function POST(req: NextRequest) {
  try {
    const limited = rateLimit(req, 10, 60000, { globalKey: true });
    if (limited) return limited;

    const csrfErr = await checkCsrf(req);
    if (csrfErr) return csrfErr;

    const rawBody = await readJson(req);
    if (!rawBody) return jsonError('Invalid JSON', 400, 'INVALID_JSON');
    const parsed = registerSchema.safeParse(rawBody);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[String(issue.path.join('.') || 'body')] = issue.message;
      }
      return jsonError('Validation failed', 422, 'VALIDATION_ERROR', { fields });
    }
    const body = parsed.data;

    const email = sanitizeText(body.email, 254).toLowerCase();
    const password = String(body.password);
    const name = sanitizeText(body.name, 120);
    const phone = sanitizeText(body.phone, 30);
    if (!isValidE164(phone))
      return jsonError('Phone must be in E.164 format (e.g. +15551234567)', 400);

    // Age verification
    let dateOfBirth: Date | undefined;
    if (body.dateOfBirth) {
      const dob = new Date(body.dateOfBirth);
      if (isNaN(dob.getTime())) return jsonError('Invalid date of birth', 400);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;

      if (age < 18) {
        await logAudit('system', 'auth.register.minor', `email=${email} age=${age}`);
        return jsonError('You must be at least 18 years old to register', 400);
      }
      dateOfBirth = dob;
    }

    if (!isValidEmail(email)) return jsonError('Valid email is required', 400);

    // ── CAPTCHA verification ──────────────────────────────────────────
    if (isCaptchaConfigured()) {
      const raw = rawBody as Record<string, unknown>;
      const captchaToken = (raw.captchaToken || raw['cf-turnstile-response']) as string | undefined;
      if (!captchaToken) {
        return jsonError('CAPTCHA verification is required. Please complete the security check.', 400, 'CAPTCHA_REQUIRED');
      }
      const ip = getIp(req);
      const captchaResult = await verifyTurnstileToken(captchaToken, ip);
      if (!captchaResult.valid) {
        return jsonError(captchaResult.error || 'CAPTCHA verification failed', 400, 'CAPTCHA_FAILED');
      }
    }

    const strength = await validatePasswordStrengthAsync(password);
    if (!strength.valid) return jsonError(strength.errors.join('; '), 400);
    if (WEAK_PASSWORDS.has(password.toLowerCase())) {
      return jsonError('This password is too common — choose a stronger one', 400);
    }
    if (!name) return jsonError('Name is required', 400, 'VALIDATION_ERROR');

    // ── Fraud prevention gate ─────────────────────────────────────────
    // Reject new accounts that match known fraud signals (blocked identity,
    // reused phone, disposable email) BEFORE creating any Supabase account.
    const gate = await checkEnrollmentGate({ email, phone });
    if (!gate.allowed) {
      await logAudit('system', 'auth.register.blocked', `email=${email} code=${gate.code}`, 'security');
      // Generic message — never reveal WHY (prevents signal probing).
      return jsonError(
        'Registration is not available for this account. Contact support if you believe this is a mistake.',
        403,
        gate.code
      );
    }

    // Seed demo users
    if (process.env.ENABLE_DEMO === 'true') {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('ENABLE_DEMO=true forbidden in production');
      }
      await ensureDemoUsers();
    }

    // ── Supabase Auth: sign up ──────────────────────────────────────────
    let responseCookies: { name: string; value: string; options?: Record<string, unknown> }[] = [];
    const supabase = createSafeServerClient({
      getAll: () => req.cookies.getAll(),
      setAll: cookiesToSet => {
        cookiesToSet.forEach(({ name, value, options }) => {
          req.cookies.set({ name, value, ...options });
          responseCookies.push({ name, value, options });
        });
      },
    });
    if (!supabase) {
      return jsonError(
        'Authentication is not configured on the server. Please try again later.',
        503,
        'AUTH_NOT_CONFIGURED'
      );
    }

    const role = body.role || 'patient';
    // Bound the provider call: a slow/unreachable Supabase must not stall
    // registration. On timeout, degrade to an explicit 503 (provider
    // unavailable) instead of a generic 500 so callers — including the CI
    // disposable-DB runner — can distinguish "provider down" from "bug".
    let signUpResult: {
      data: { user?: { id?: string; email?: string; email_confirmed_at?: string | null } | null };
      error: { message?: string } | null;
    } | null = null;
    let providerUnavailable = false;
    try {
      signUpResult = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name, role },
            emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/callback`,
          },
        }),
        8000,
        'supabase.auth.signUp',
      );
    } catch {
      providerUnavailable = true;
    }
    const authData = signUpResult?.data;
    const authError = signUpResult?.error ?? null;
    if (providerUnavailable) {
      await logAudit('system', 'auth.register.provider_unavailable', `email=${email}`, 'security');
      return jsonError(
        'The account provider is temporarily unavailable. Please try again later.',
        503,
        'PROVIDER_UNAVAILABLE'
      );
    }

    // If email already exists in Supabase, return generic message to prevent email enumeration
    if (authError && authError.message?.includes('already registered')) {
      // Always return the same message regardless of whether email exists
      return jsonOk({
        message: 'If this email is available, a verification link has been sent. Please check your inbox.',
        verificationEmailSent: true,
      });
    } else if (authError) {
      // Provider-side failure (unreachable, misconfigured keys, rate-limited, etc.)
      // → explicit 503 with a GENERIC message. Never leak the provider's error
      // text (enumeration / internal-detail vector), and distinguish "provider
      // problem" from "client problem" for callers + the CI disposable-DB gate.
      await logAudit('system', 'auth.register.provider_error', `email=${email} provider=${authError.message?.slice(0, 120)}`, 'security');
      return jsonError(
        'The account service is temporarily unavailable. Please try again later.',
        503,
        'PROVIDER_UNAVAILABLE'
      );
    }

    if (!authData?.user) {
      return jsonError(
        'The account service is temporarily unavailable. Please try again later.',
        503,
        'PROVIDER_UNAVAILABLE'
      );
    }

    // ── Create profile via Supabase REST API ────────────────────────────
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || ''
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
    const sbKey = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY

    // Check if profile already exists
    let profileRes = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${authData.user.id}&select=*`, {
      headers: {
        'apikey': sbKey,
        'Authorization': `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
      },
    })
    let profiles = await profileRes.json()
    let profile = profiles && profiles.length > 0 ? profiles[0] : null

    if (!profile) {
      // US privacy / Health Data Protection: require consent flags
      const consentErr = checkConsent({
        consentAccepted: !!body.consentAccepted,
        dataProcessingConsent: !!body.dataProcessingConsent,
        aiTrainingConsent: !!body.aiTrainingConsent,
      });
      if (consentErr) return consentErr;

      const createRes = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
        method: 'POST',
        headers: {
          'apikey': sbKey,
          'Authorization': `Bearer ${sbKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          id: authData.user.id,
          email,
          name,
          role: role || 'patient',
          phone: phone || null,
          dateOfBirth: dateOfBirth ? dateOfBirth.toISOString() : null,
          password: null,
          emailVerified: authData.user.email_confirmed_at ? new Date(authData.user.email_confirmed_at).toISOString() : null,
          consentAccepted: !!body.consentAccepted,
          dataProcessingConsent: !!body.dataProcessingConsent,
          aiTrainingConsent: !!body.aiTrainingConsent,
          subscriptionTier: 'free',
          isDemo: false,
          failedLoginAttempts: 0,
          phoneVerified: false,
          identityConfirmed: false,
          idDocumentUploaded: false,
          idDocumentVerified: false,
          verificationLevel: 'unverified',
          emailOptOut: false,
        }),
      })
      if (!createRes.ok) {
        const errText = await createRes.text()
        console.error('Profile creation failed:', errText)
        return jsonError('Failed to create user profile', 500, 'PROFILE_CREATE_FAILED')
      }
      const created = await createRes.json()
      profile = Array.isArray(created) ? created[0] : created
    }

    await logAudit(profile.id, 'auth.register', `role=${role}`);


    const responseBody = {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role,
      phone: profile.phone,
      subscriptionTier: profile.subscriptionTier,
      verificationEmailSent: !authData.user.email_confirmed_at,
    };
    const res = jsonOk(responseBody);
    for (const cookie of responseCookies) {
      res.cookies.set(cookie.name, cookie.value, cookie.options as any);
    }
    return res;
  } catch (error) {
    logger.phiSafeError(error, 'auth.register');
    return jsonError('Internal server error', 500);
  }
}
