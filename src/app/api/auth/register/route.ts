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
import { checkCsrf, isSecureRequest } from '@/lib/csrf';
import { signSessionToken } from '@/lib/session-signing';
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
    const role = body.role || 'patient';
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

    // ── Create user directly in database (bypasses Supabase Auth) ────────
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || ''
    const sbKey = SUPABASE_ANON_KEY

    // Hash password with bcrypt
    const bcrypt = await import('bcryptjs')
    const passwordHash = await bcrypt.hash(password, 12)

    // Check if user already exists
    const existingRes = await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id`, {
      headers: {
        'apikey': sbKey,
        'Authorization': `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
      },
    })
    const existingUsers = await existingRes.json()
    if (existingUsers && existingUsers.length > 0) {
      return jsonOk({
        message: 'If this email is available, a verification link has been sent. Please check your inbox.',
        verificationEmailSent: true,
      });
    }

    // Create user in database
    const userId = crypto.randomUUID()
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: {
        'apikey': sbKey,
        'Authorization': `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        id: userId,
        email,
        name,
        role: role || 'patient',
        phone: phone || null,
        password: passwordHash,
        dateOfBirth: dateOfBirth ? dateOfBirth.toISOString() : null,
        emailVerified: null,
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
        updatedAt: new Date().toISOString(),
      }),
    })

    if (!createRes.ok) {
      const errText = await createRes.text()
      console.error('User creation failed:', errText)
      return jsonError(`Failed to create user account: ${errText}`, 500, 'REGISTRATION_FAILED')
    }

    const created = await createRes.json()
    const newUser = Array.isArray(created) ? created[0] : created
    if (!newUser) { return jsonError('Failed to create user account', 500, 'REGISTRATION_FAILED') }

    await logAudit(newUser.id, 'auth.register', `role=${role}`)

    const responseBody = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      phone: newUser.phone,
      subscriptionTier: newUser.subscriptionTier,
      verificationEmailSent: false,
    };
    const res = jsonOk(responseBody);

    // Set session cookie
    const signedValue = await signSessionToken(newUser.id)
    if (signedValue) {
      res.cookies.set('kynthai-session', signedValue, {
        httpOnly: true,
        secure: isSecureRequest(req),
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      });
    }

    return res;
  } catch (error) {
    logger.phiSafeError(error, 'register.POST');
    return jsonError('Internal server error', 500);
  }
}

// Dummy to prevent syntax errors
function _unused() { return null; }