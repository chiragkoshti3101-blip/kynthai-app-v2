import { z, ZodError } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifySessionToken } from './session-signing';
import { logAudit, getSessionUser } from './auth';
import { recordAudit, recordAuditSync, AuditContext, AuditCategory } from './audit-logger';
import { rateLimit, rateLimitProduction, getIp } from './security';
import { checkCsrf } from './csrf';
import { db } from './db';
import type { User } from '@prisma/client';

// Production requires ADMIN_EMAILS env var. Dev uses demo fallback.
const rawAdminEmails = process.env.ADMIN_EMAILS;
if (!rawAdminEmails && process.env.NODE_ENV === 'production') {
  console.error('CRITICAL: ADMIN_EMAILS env var not set. Admin access disabled.');
}
export const ADMIN_EMAILS = rawAdminEmails
  ? rawAdminEmails.split(',').map(e => e.trim())
  : process.env.NODE_ENV === 'production'
    ? []
    : ['admin@demo.kynthai.app', 'admin@demo.com'];

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
// NEVER fall back to a wildcard origin. If CORS_ORIGIN is not set, reflecting
// the request Origin is used (already same-origin for the SPA in production).
// An explicit comma-separated list in CORS_ORIGIN (e.g. "https://a.com,https://b.com")
// restricts responding origins to that allowlist.
const CORS_ORIGIN_LIST = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
      .map(o => o.trim())
      .filter(Boolean)
  : [];

function resolveCorsOrigin(req: NextRequest): string | null {
  const origin = req.headers.get('origin');
  if (!origin) return null;
  if (CORS_ORIGIN_LIST.length === 0) {
    // SECURITY: In production, require explicit CORS_ORIGIN.
    // Reflecting arbitrary origins enables CSRF via cross-origin requests with the victim's cookies.
    if (process.env.NODE_ENV === 'production') {
      console.error('SECURITY: CORS_ORIGIN not set in production — rejecting cross-origin request');
      return null;
    }
    // Dev: reflect localhost origins only (reject non-localhost origins accidentally sent by browsers)
    if (!origin.startsWith('http://localhost') && !origin.startsWith('http://127.0.0.1')) {
      return null;
    }
    return origin;
  }
  // SECURITY: enforce HTTPS origins in production
  if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://')) {
    return null;
  }
  return CORS_ORIGIN_LIST.includes(origin) ? origin : null;
}

// ---------------------------------------------------------------------------
// Security headers shared by every API response
// ---------------------------------------------------------------------------
const API_SECURITY_HEADERS: Record<string, string> = {
  // Prevent MIME-type sniffing — browsers must honour Content-Type.
  'X-Content-Type-Options': 'nosniff',
  // Disallow embedding in iframes (clickjacking defence).
  'X-Frame-Options': 'DENY',
  // Do not send the full referrer URL across origins; send only the origin.
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Permissions-Policy is controlled by middleware (proxy.ts) at the edge so it
  // is not overridden per-API-response here. Re-declaring it in API responses
  // can accidentally break features like video calls (camera/mic) when those
  // endpoints are fetched from the same browsing context.
};

/**
 * Apply security + CORS headers to every API response.
 *
 * CORS origin is resolved per-request:
 *   - If CORS_ORIGIN env var is set → allow-listed origins only.
 *   - If CORS_ORIGIN is unset → reflect the request Origin (SPA, same-origin).
 *   - Wildcard ('*') is never used.
 */
export function applyStandardHeaders(
  res: NextResponse,
  req?: NextRequest,
  rateLimitRemaining?: number
): NextResponse {
  // ── CORS ──────────────────────────────────────────────────────────────────
  if (req) {
    const corsOrigin = resolveCorsOrigin(req);
    if (corsOrigin) {
      res.headers.set('Access-Control-Allow-Origin', corsOrigin);
      res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
      res.headers.set('Access-Control-Max-Age', '86400');
      res.headers.set('Vary', 'Origin');
    }
  } else if (CORS_ORIGIN_LIST.length > 0) {
    // Fallback when req is unavailable (tests, etc.) — use first allow-listed origin.
    res.headers.set('Access-Control-Allow-Origin', CORS_ORIGIN_LIST[0]!);
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    res.headers.set(
      'Access-Control-Expose-Headers',
      'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Request-Id'
    );
    res.headers.set('Access-Control-Max-Age', '86400');
    res.headers.set('Vary', 'Origin');
  }

  // ── Security headers (applied regardless of CORS) ──────────────────────────
  for (const [key, value] of Object.entries(API_SECURITY_HEADERS)) {
    res.headers.set(key, value);
  }
  res.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  // Request ID — prefer upstream (middleware-propagation) or generate locally
  const incomingRequestId = req?.headers.get('x-request-id');
  const finalRequestId =
    incomingRequestId ??
    (() => {
      try {
        // @ts-ignore
        return crypto.randomUUID();
      } catch {
        return Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      }
    })();
  res.headers.set('X-Request-Id', finalRequestId);

  // ── Rate-limit headers ─────────────────────────────────────────────────────
  if (typeof rateLimitRemaining === 'number') {
    res.headers.set('X-RateLimit-Remaining', String(rateLimitRemaining));
  }
  res.headers.set('Vary', 'Origin');

  return res;
}

/** Standardised error response: { error, code, details? } */
/**
 * Standardised error response: { error, code, details? }
 *
 * Backwards-compatible: a plain object passed as the 3rd arg is merged as extras.
 *
 * Canonical (v2):
 *   jsonError('Not found', 404, 'NOT_FOUND', { resource: 'appointment' })
 *
 * Legacy (still supported):
 *   jsonError('Not found', 404, { code: 'NF' })
 */
export function jsonError(
  message: string,
  status = 400,
  codeOrExtras?: string | Record<string, unknown>,
  details?: unknown
): NextResponse {
  let code = inferErrorCode(status);
  const extras: Record<string, unknown> = {};
  if (typeof codeOrExtras === 'string') {
    code = codeOrExtras;
  } else if (codeOrExtras) {
    Object.assign(extras, codeOrExtras);
  }
  if (details !== undefined) extras.details = details;
  const res = NextResponse.json({ error: message, code, ...extras }, { status });
  return applyStandardHeaders(res);
}

function inferErrorCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 410:
      return 'GONE';
    case 422:
      return 'VALIDATION_ERROR';
    case 423:
      return 'LOCKED';
    case 429:
      return 'RATE_LIMITED';
    case 500:
      return 'INTERNAL_ERROR';
    case 502:
      return 'BAD_GATEWAY';
    default:
      return 'ERROR';
  }
}

export function jsonOk(data: unknown, status = 200): NextResponse {
  const res = NextResponse.json(data, { status });
  return applyStandardHeaders(res);
}

/** Paginated list envelope — use for all list GET endpoints */
export function jsonPage<T>(
  items: T[],
  opts: { cursor?: string | null; limit: number; hasMore: boolean; totalCount?: number }
): NextResponse {
  const res = NextResponse.json({
    data: items,
    meta: {
      hasMore: opts.hasMore,
      nextCursor: opts.hasMore ? opts.cursor : null,
      limit: opts.limit,
      ...(opts.totalCount !== undefined ? { totalCount: opts.totalCount } : {}),
    },
  });
  return applyStandardHeaders(res);
}

export async function requireAuth(
  req: NextRequest,
  opts?: { skipConsentCheck?: boolean }
): Promise<{ response: NextResponse | null; user: User | null }> {
  const limited = await rateLimitProduction(req);
  if (limited) return { response: limited, user: null };

  // Use Supabase auth for session validation
  const { createServerClient } = await import('@supabase/ssr');
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll() {},
      },
    }
  );
  const { data: { user: supabaseUser }, error } = await supabase.auth.getUser();

  // Fallback: local kynthai-session cookie for dev/demo mode — HMAC verified
  let userId: string | null = null
  if (error || !supabaseUser) {
    const kynthaiSession = req.cookies.get('kynthai-session')
    if (kynthaiSession?.value) userId = await verifySessionToken(kynthaiSession.value)
    // verifySessionToken returns null on any tampering — fail closed (treat as unauth)
  } else {
    userId = supabaseUser.id
  }

  if (!userId) return { response: jsonError('Unauthorized', 401), user: null }

  // Look up Prisma profile
  let profile: any = null
  if (supabaseUser && !error) {
    const { getSupabaseProfile } = await import('@/lib/supabase/sync')
    profile = await getSupabaseProfile(supabaseUser)
  } else {
    // Local session fallback: look up user by ID directly
    const { db } = await import('@/lib/db')
    profile = await db.user.findUnique({ where: { id: userId } })
  }

  // C3: load the patient's allergies (plain JSON string or comma list) so the
  // drug-allergy safety checks in chat/interactions/symptom-analyze actually
  // fire. `getSupabaseProfile` strips them, so fetch the two columns directly.
  let allergies: string | null = null
  try {
    const { db } = await import('@/lib/db')
    const row = await db.user.findUnique({
      where: { id: userId },
      select: { allergies: true, allergies_enc: true },
    })
    if (row) {
      if (row.allergies_enc) {
        const { decryptValue } = await import('@/lib/encryption')
        const dec = decryptValue(row.allergies_enc)
        allergies = dec || row.allergies
      } else {
        allergies = row.allergies
      }
    }
  } catch {
    // Non-fatal: fall back to whatever the profile carried (or null).
    allergies = (profile as any)?.allergies ?? null
  }

  // Build a minimal User object for downstream code
  const user = {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    name_enc: null,
    role: profile.role as any,
    phone: profile.phone ?? null,
    phone_enc: null,
    password: null,
    emailVerified: profile.emailVerified ?? null,
    subscriptionTier: (profile.subscriptionTier ?? 'free') as any,
    stripeCustomerId: null,
    sessionToken: null,
    sessionExpiry: null,
    consentAccepted: profile.consentAccepted ?? false,
    dataProcessingConsent: profile.dataProcessingConsent ?? false,
    aiTrainingConsent: profile.aiTrainingConsent ?? false,
    notificationPrefs: null,
    emailOptOut: false,
    isDemo: profile.isDemo ?? false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    dateOfBirth: null,
    dateOfBirth_enc: null,
    allergies: allergies,
    allergies_enc: null,
    passwordResetToken: null,
    passwordResetToken_enc: null,
    passwordResetExpires: null,
    emailVerificationToken: null,
    emailVerificationToken_enc: null,
    emailVerificationExpires: null,
    phoneVerified: false,
    identityConfirmed: false,
    identityConfirmedAt: null,
    idDocumentUploaded: false,
    idDocumentVerified: false,
    verificationLevel: profile.verificationLevel ?? 'unverified',
    verificationRejectedReason: profile.verificationRejectedReason ?? null,
    idDocumentRef: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as User;

  // US privacy enforcement: block any unconsented user from accessing sensitive health data endpoints.
  // The consent-granting endpoint itself (PATCH /api/user/consent) opts out via
  // skipConsentCheck — otherwise a user who has never consented could never
  // consent (chicken-and-egg lockout).
  const consentErr = opts?.skipConsentCheck ? null : checkConsent(user, req);
  if (consentErr) return { response: consentErr, user: null };

  // Fraud prevention: a hard-blocked user is denied app-wide (any API call).
  if (user.verificationLevel === 'blocked') {
    return {
      response: jsonError('This account has been blocked for security reasons.', 403, 'ACCOUNT_BLOCKED'),
      user: null,
    };
  }

  return { response: null, user };
}

/**
 * requireAuthWithVerified: same as requireAuth but ALSO enforces email
 * verification. Use this for sensitive health data endpoints that require verified identity.
 */
export async function requireAuthWithVerified(
  req: NextRequest
): Promise<{ response: NextResponse | null; user: User | null }> {
  const r = await requireAuth(req);
  if (r.response || !r.user) return r;
  if (!r.user.emailVerified) {
    return {
      response: jsonError('Email verification required. Please verify your email first.', 403),
      user: null,
    };
  }
  return r;
}

export async function requireRole(
  req: NextRequest,
  roles: string[]
): Promise<{ response: NextResponse | null; user: User | null }> {
  const r = await requireAuth(req);
  if (r.response || !r.user) return r;
  if (!roles.includes(r.user.role)) {
    return { response: jsonError('Forbidden', 403), user: null };
  }
  return r;
}

export async function requireAdmin(
  req: NextRequest
): Promise<{ response: NextResponse | null; user: User | null }> {
  const r = await requireAuth(req);
  if (r.response || !r.user) return r;
  const isRoleAdmin = r.user.role === 'admin';
  const isEmailAdmin = ADMIN_EMAILS.length > 0 && ADMIN_EMAILS.includes(r.user.email);
  if (!isRoleAdmin && !isEmailAdmin) {
    return { response: jsonError('Forbidden — admin only', 403), user: null };
  }
  // Break-glass email admins should still be explicitly listed; prefer role=admin.
  if (isEmailAdmin && !isRoleAdmin && process.env.NODE_ENV === 'production') {
    console.warn(`[security] admin access via ADMIN_EMAILS for ${r.user.email} (role=${r.user.role})`);
  }
  return r;
}

export async function requireAuthWithCsrf(
  req: NextRequest,
  opts?: { skipConsentCheck?: boolean }
): Promise<{ response: NextResponse | null; user: User | null }> {
  const csrfError = await checkCsrf(req);
  if (csrfError) return { response: csrfError, user: null };
  return requireAuth(req, opts);
}

/**
 * Verify a system/cron bearer token for machine-to-machine endpoints
 * (e.g. /api/reminders/schedule). Either a `CRON_SECRET` env var match
 * (via Authorization: Bearer <token>) OR an admin session is accepted.
 * The admin-session fallback keeps the dev demo flow working without
 * an env var, while blocking every other authenticated user.
 *
 * SECURITY: this closes a privilege-escalation where ANY authenticated
 * user could trigger cross-tenant reminder creation for ALL users' meds
 * via /api/reminders/schedule.
 */
export async function requireSystemToken(req: NextRequest) {
  const limited = rateLimit(req, 10, 60000);
  if (limited) {
    return { response: applyStandardHeaders(limited, req), user: null };
  }

  // 1) Bearer-token path: caller is a cron job / external scheduler.
  const authHeader = req.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  const cronSecret = process.env.CRON_SECRET;
  if (bearer && cronSecret && bearer === cronSecret) {
    // Token matches — return a synthetic "system" user for audit logging.
    const systemUser: User = {
      id: 'system',
      email: 'system@cron',
      name: 'System',
      name_enc: null,
      role: 'admin',
      phone: null,
      phone_enc: null,
      password: null,
      emailVerified: new Date(),
      subscriptionTier: 'free',
      stripeCustomerId: null,
      sessionToken: null,
      sessionExpiry: null,
      consentAccepted: true,
      dataProcessingConsent: true,
      aiTrainingConsent: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      dateOfBirth: null,
      dateOfBirth_enc: null,
      allergies: null,
      allergies_enc: null,
      isDemo: false,
      emailOptOut: false,
      notificationPrefs: null,
      phoneVerified: false,
      identityConfirmed: false,
      identityConfirmedAt: null,
      idDocumentUploaded: false,
      idDocumentVerified: false,
      verificationLevel: 'unverified',
      smsVerificationCode: null,
      smsCodeExpiresAt: null,
      verificationRejectedReason: null,
      idDocumentRef: null,
      deletedAt: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      passwordResetToken: null,
      passwordResetToken_enc: null,
      passwordResetExpires: null,
      emailVerificationToken: null,
      emailVerificationToken_enc: null,
      emailVerificationExpires: null,
    };
    return { response: null, user: systemUser };
  }

  // 2) Admin-session fallback (dev only — requires EXPLICIT opt-in via ALLOW_ADMIN_AS_SYSTEM).
  //    In production, CRON_SECRET MUST be configured; no exception.
  //    We also never accept admin-session fallback if CRON_SECRET isn't set —
  //    this prevents accidental privilege escalation in staging environments.
  if (process.env.NODE_ENV === 'production') {
    return {
      response: jsonError('Forbidden — CRON_SECRET is required in production', 403),
      user: null,
    };
  }
  if (!cronSecret || process.env.ALLOW_ADMIN_AS_SYSTEM !== 'true') {
    return {
      response: jsonError(
        'Forbidden — system token required (enable ALLOW_ADMIN_AS_SYSTEM in dev)',
        403
      ),
      user: null,
    };
  }
  const r = await requireAuth(req);
  if (r.response || !r.user) return r;
  if (r.user.role !== 'admin' && !ADMIN_EMAILS.includes(r.user.email)) {
    return {
      response: jsonError('Forbidden — system token or admin role required', 403),
      user: null,
    };
  }
  return r;
}

/** Check whether a user record indicates the user is under 18. Used by
 *  family-governance and restricted-feature endpoints to apply minor protections.
 */
export function isUserMinor(user: { dateOfBirth: Date | null }): boolean {
  if (!user.dateOfBirth) return false;
  const dob = new Date(user.dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
  return age < 18;
}

/** Verify the userId in the request body/query matches the authenticated session user. */
export function assertOwnership(sessionUserId: string, resourceUserId?: string | null): boolean {
  if (!resourceUserId || resourceUserId !== sessionUserId) return false;
  return true;
}

/**
 * Check that the user has consented to data processing (health data).
 * Returns a NextResponse error (400/403) if consent is missing, or null if OK.
 * Call this in any endpoint that returns or processes sensitive health data.
 */
export function checkConsent(
  user: {
    consentAccepted: boolean;
    dataProcessingConsent: boolean;
    aiTrainingConsent: boolean;
    isDemo?: boolean;
  },
  req?: NextRequest
): NextResponse | null {
  // Demo accounts bypass consent ONLY in dev — never in production, even if ENABLE_DEMO=true.
  // This prevents accidental privacy violations if demo mode is misconfigured.
  if (user.isDemo && process.env.NODE_ENV !== 'production') return null;

  if (!user.consentAccepted) {
    return applyStandardHeaders(
      NextResponse.json(
        { error: 'You must accept the Terms of Service to use this feature.' },
        { status: 403 }
      )
    );
  }
  if (!user.dataProcessingConsent) {
    return applyStandardHeaders(
      NextResponse.json(
        { error: 'You must consent to data processing to use health features.' },
        { status: 403 }
      )
    );
  }
  if (!user.aiTrainingConsent) {
    return applyStandardHeaders(
      NextResponse.json(
        { error: 'You must consent to AI data processing to use AI-powered features.' },
        { status: 403 }
      )
    );
  }
  return null;
}

/**
 * Enforce AI feature tier limits. Free users get 3 AI-powered feature calls per day
 * (chat, symptom analysis, interactions, insights, identify, scan, voice, etc.).
 * Plus/Family Pro users get unlimited.
 *
 * Returns a NextResponse error (403) if the limit is exceeded, or null if OK.
 * Uses the same daily counter as the chat route (counts 'llm' source messages).
 */
export async function checkAiTier(user: User, featureName: string): Promise<NextResponse | null> {
  const tier = user.subscriptionTier;
  if (tier === 'plus' || tier === 'family_pro' || tier === 'pro') return null; // unlimited

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const usedToday = await db.chatMessage.count({
    where: { userId: user.id, source: 'llm', createdAt: { gte: todayStart, lte: todayEnd } },
  });

  const FREE_DAILY_LIMIT = 3;
  if (usedToday >= FREE_DAILY_LIMIT) {
    return applyStandardHeaders(
      NextResponse.json(
        {
          error: `Free tier allows ${FREE_DAILY_LIMIT} AI ${featureName} per day. Upgrade to Plus for unlimited access.`,
          limitReached: true,
          dailyLimit: FREE_DAILY_LIMIT,
          usedToday,
        },
        { status: 403 }
      )
    );
  }
  return null;
}

/** Read JSON body safely; returns null on parse error. */
export async function readJson<T = Record<string, unknown>>(req: NextRequest): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function audit(
  userId: string,
  action: string,
  detailsOrContext?: string | Partial<AuditContext>,
  ip?: string
): Promise<void> {
  if (typeof detailsOrContext === 'string') {
    // Backward-compat: old 3-arg signature (userId, action, details)
    const isAuthAction = action.startsWith('auth.') || action.startsWith('session.');
    if (isAuthAction) {
      await recordAuditSync(userId, action, { outcome: 'success', ip });
    } else {
      await recordAudit(userId, action, { outcome: 'success', ip });
    }
  } else {
    // New signature: (userId, action, AuditContext)
    await logAudit(userId, action, detailsOrContext);
  }
}

/**
 * Audit sensitive health data access — specifically for record reads/copies (health data access).
 * Records resource type, resource ID, and access outcome.
 */
export async function auditSensitiveHealthDataAccess(
  userId: string,
  resourceType: string,
  resourceId: string,
  action = 'record.access',
  context: Partial<AuditContext> = {}
): Promise<void> {
  await logAudit(userId, action, {
    ...context,
    resourceType,
    resourceId,
    category: AuditCategory.ACCESS,
    outcome: context.outcome ?? 'success',
  });
}

/**
 * Audit sensitive health data modification — for create/update/delete operations.
 * Uses synchronous write to ensure the audit trail is not lost.
 */
export async function auditSensitiveHealthDataModify(
  userId: string,
  resourceType: string,
  resourceId: string,
  action: string,
  context: Partial<AuditContext> = {}
): Promise<void> {
  await recordAuditSync(userId, action, {
    ...context,
    resourceType,
    resourceId,
    category: AuditCategory.MODIFY,
    outcome: context.outcome ?? 'success',
  });
}

/**
 * Audit a security/failure event.
 */
export async function auditSecurity(
  userId: string | undefined,
  action: string,
  context: Partial<AuditContext> = {}
): Promise<void> {
  await recordAuditSync(userId ?? null, action, {
    ...context,
    category: AuditCategory.SECURITY,
    outcome: context.outcome ?? 'failure',
  });
}

/**
 * Build a small set of demo seed users if not present (for demo logins).
 *
 * SECURITY: Gated by ENABLE_DEMO=true (not just NODE_ENV). This prevents
 * accidental demo account creation if NODE_ENV is misconfigured.
 * Demo accounts are NEVER created in production regardless of flags.
 */
export async function ensureDemoUsers(): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;
  if (process.env.ENABLE_DEMO !== 'true') return;
  const { hashPassword } = await import('./auth');
  const DEMO_PASSWORD = await hashPassword('Demo@2024');
  const demos = [
    { email: 'patient@demo.kynthai.app', name: 'Demo Patient', role: 'patient' },
    { email: 'caretaker@demo.kynthai.app', name: 'Demo Family', role: 'caretaker' },
    { email: 'priya@demo.kynthai.app', name: 'Demo Doctor', role: 'doctor' },
    { email: 'pathlabs@demo.kynthai.app', name: 'Demo Lab', role: 'lab' },
    { email: 'admin@demo.kynthai.app', name: 'Demo Admin', role: 'admin' },
  ];
  for (const d of demos) {
    const existing = await db.user.findUnique({ where: { email: d.email } });
    if (existing) {
      // Always keep demo passwords in sync so dev/demo login never silently breaks
      // when the hashing implementation changes.
      await db.user.update({
        where: { id: existing.id },
        data: { password: DEMO_PASSWORD, isDemo: true },
      });
      // Ensure pre-existing demo accounts have full consent so sensitive health data routes don't 403.
      await db.user.update({
        where: { id: existing.id },
        data: {
          consentAccepted: existing.consentAccepted ?? true,
          dataProcessingConsent: existing.dataProcessingConsent ?? true,
          aiTrainingConsent: existing.aiTrainingConsent ?? true,
          emailVerified: existing.emailVerified ?? new Date(),
        },
      });
    } else {
      await db.user.create({
        data: {
          email: d.email,
          name: d.name,
          role: d.role as User['role'],
          password: DEMO_PASSWORD,
          isDemo: true,
                  consentAccepted: true,
                  dataProcessingConsent: true,
                  aiTrainingConsent: true,
                  emailVerified: new Date(),
        },
      });
    }
  }
}

/** Helper to safely parse a JSON string column. */
export function parseJsonCol<T = unknown>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

// ── Zod validation helpers ─────────────────────────────────────────────────

/**
 * Parse JSON body and validate with a Zod schema.
 * Returns the parsed data on success, or a NextResponse error on failure.
 *
 * Usage:
 *   const body = await validateBody(req, createMedicationSchema)
 *   if (isResponseError(body)) return body
 *   // body is now typed as z.infer<typeof createMedicationSchema>
 */
export async function validateBody<T extends z.ZodTypeAny>(
  req: NextRequest,
  schema: T
): Promise<z.infer<T> | NextResponse> {
  const raw = await req.text().catch(() => null);
  if (!raw) return jsonError('Request body is empty', 400, 'EMPTY_BODY');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return jsonError('Invalid JSON — body must be valid JSON', 400, 'INVALID_JSON');
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || 'body';
      fieldErrors[path] = issue.message;
    }
    return jsonError('Validation failed', 422, 'VALIDATION_ERROR', {
      fields: fieldErrors,
      issues: result.error.issues.map(i => ({ path: i.path, message: i.message })),
    });
  }
  return result.data;
}

/** Type guard: check if validateBody returned an error response */
export function isResponseError(v: unknown): v is NextResponse {
  return v instanceof NextResponse;
}

/** Parse cursor + limit + optional fields from query string */
export function parsePagination(req: NextRequest, defaultLimit = 20, maxLimit = 100) {
  const sp = req.nextUrl.searchParams;
  return {
    cursor: sp.get('cursor')?.trim() || undefined,
    limit: Math.min(
      Math.max(parseInt(sp.get('limit') || String(defaultLimit), 10) || defaultLimit, 1),
      maxLimit
    ),
  };
}

/** Parse comma-separated field list from ?fields= query param */
export function parseFields(req: NextRequest): string[] | undefined {
  const sp = req.nextUrl.searchParams;
  const raw = sp.get('fields');
  if (!raw) return undefined;
  return raw
    .split(',')
    .map(f => f.trim())
    .filter(Boolean);
}

/** Pick only the requested fields from an object, or return the full object if no fields specified. */
export function pickFields<T extends Record<string, unknown>>(
  obj: T,
  fields: string[] | undefined
): T {
  if (!fields || fields.length === 0) return obj;
  const picked: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in obj) picked[f] = obj[f];
  }
  return picked as T;
}
