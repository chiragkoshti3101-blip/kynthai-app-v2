/**
 * Kynthai Edge Proxy — Security, Rate-Limit, Audit & CORS
 *
 * Runs as Next.js Edge middleware on every matching request.
 *
 * Runs at the Edge on every matching request:
 * 1. Assigns X-Request-Id for distributed tracing
 * 2. Edge-level audit logging (health-data-safe: method + masked IP + path only)
 * 3. Rate limiting per user/IP
 * 4. Portal cross-role access block (SSR bypass defence)
 * 5. Auth-required path guard
 * 6. CORS preflight headers
 * 7. Audit API session guard
 * 8. Security headers + CSP
 * 9. Sensitive-data-safe query-param sanitisation in audit records
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimitWithInfo } from './lib/rate-limit';
import { validateEnv } from './lib/env';
// NOTE: audit-logger is imported lazily inside the function body to avoid
// pulling in PrismaClient at edge runtime (which is incompatible).
// import { recordAudit, AuditCategory } from './lib/audit-logger';
import { logger } from '@/lib/logger';
import { checkCsrf } from '@/lib/csrf';
import { verifySessionToken, signSessionToken, verifySupabaseJwt } from './lib/session-signing';
import { isDemoEnabled } from '@/lib/demo-mode';

// HMR-safe env validation (fail-loud in production, skip during build/edge)
let envValidated = false;
function ensureEnvValidated(): void {
  if (envValidated) return;
  // Skip validation during Next.js production build to allow builds without secrets
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    envValidated = true;
    return;
  }
  // Skip validation on Vercel Edge runtime where full env vars aren't available
  // and the middleware runs at the edge (not Node.js server)
  if (typeof process.env.VERCEL_ENV !== 'undefined' || process.env.NEXT_RUNTIME === 'edge') {
    envValidated = true;
    return;
  }
  // Also skip if we're not in a Node.js server context (e.g., edge function)
  if (typeof globalThis.WebSocket !== 'undefined' && !process.env.DATABASE_URL) {
    envValidated = true;
    return;
  }
  validateEnv();
  envValidated = true;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

function getUserAgent(req: NextRequest): string | undefined {
  const ua = req.headers.get('user-agent');
  return ua ? ua.slice(0, 512) : undefined;
}

function maskIp(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4) return parts[0] + '.' + parts[1] + '.***.***';
  return ip.length > 4 ? ip.slice(0, 4) + '***' : ip;
}

function getRequestId(): string {
  // crypto.randomUUID is available in Edge runtimes
  try {
    // @ts-ignore
    return crypto.randomUUID();
  } catch {
    // Fallback: CSPRNG via crypto.getRandomValues (preferred over Math.random)
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

// ── Sensitive Health Data Sanitisation ────────────────────────────────────────────

const SENSITIVE_HEALTH_DATA_QUERY_KEYS = new Set([
  'patientId',
  'userId',
  'doctorId',
  'memberId',
  'familyId',
  'email',
  'phone',
  'name',
  'search',
  'q',
  'query',
  'diagnosis',
  'symptoms',
  'medication',
  'condition',
  'dob',
  'dateOfBirth',
  'birthDate',
]);

function sanitizeAuditQuery(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of params.entries()) {
    if (SENSITIVE_HEALTH_DATA_QUERY_KEYS.has(key.toLowerCase())) {
      out[key] = '[REDACTED]';
    } else if (value.length > 100) {
      out[key] = value.slice(0, 100) + '...[truncated]';
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Mask resource IDs in URL paths before logging to audit records.
 * Paths like /api/medications/abc-123-patient-id leak resource correlations;
 * this replaces them with generic [id] placeholders while preserving
 * the route structure for debugging.
 */
function maskPathIds(pathname: string): string {
  return pathname.replace(/\/[a-f0-9]{8,}-[a-f0-9-]+/g, '/[id]');
}

// ── System-token API paths (cron / external schedulers) ───────────────────
// These endpoints self-authenticate via requireSystemToken (Bearer CRON_SECRET),
// so the proxy must NOT double-submit-CSRF them (cron can't hold a browser
// cookie) and must NOT require a session. They are still gated by the system
// token inside the route handler — in production requireSystemToken refuses
// any call whose bearer doesn't match CRON_SECRET.
//
// /api/auth/logout is listed here as a session-meta exemption: every client
// logout handler (patient, caretaker, doctor, lab, settings, AuthGuard 401
// cleanup) calls it as a bare POST with no CSRF token, and the double-submit
// gate was 403-ing every one of them — the session cookie survived logout and
// the mount-time /api/auth/me check (AuthGuard / portal clients) re-logged the
// user straight back in ("logout re-renders into demo mode"). CSRF on logout
// protects nothing (worst case: a cross-site POST ends the victim's own
// session — a nuisance, and SameSite=Strict cookies already block cross-site
// POSTs from carrying the session). ponytail: if logout is ever made to
// require auth, move it out of this set and add a CSRF fetch to the handlers.
const SYSTEM_API_PATHS = new Set([
  '/api/reminders/schedule',
  '/api/reminders/send',
  '/api/reminders/escalate',
  '/api/appointment-reminders',
  '/api/chat/cleanup',
  '/api/auth/logout',
  '/api/system/seed-demo',
]);

function isSystemApi(pathname: string): boolean {
  return SYSTEM_API_PATHS.has(pathname);
}

// ── Public API Paths ─────────────────────────────────────────────────────────
// Only true anonymous surfaces. Auth-required routes must NOT appear here —
// even if the route handler also calls requireAuth (defense in depth).
// GET-only public listings (doctors/labs directory) are method-gated below.
const PUBLIC_API_PATHS = new Set([
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/csrf',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
  '/api/auth/oauth',
  '/api/auth/oauth/callback',
  '/api/health',
  '/api/stripe/webhook',
  '/api/csp-report',
  '/api/newsletter',
  // API v1 variants
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/csrf',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/verify-email',
  '/api/v1/auth/resend-verification',
  '/api/v1/health',
  '/api/v1/stripe/webhook',
]);

/** Directory-style GET endpoints safe without a session (no PHI in list). */
const PUBLIC_GET_ONLY = new Set([
  '/api/doctors',
  '/api/labs',
  '/api/search-medicine',
  '/api/v1/doctors',
  '/api/v1/labs',
  '/api/v1/search-medicine',
]);

function isPublicApi(pathname: string, method: string = 'GET'): boolean {
  if (PUBLIC_API_PATHS.has(pathname)) return true;
  if (method === 'GET' && PUBLIC_GET_ONLY.has(pathname)) return true;
  return false;
}

// ── Auth-required prefixes ────────────────────────────────────────────────────

// Auth-required API prefixes (both /api/ and /api/v1/ variants).
// The /api/v1/ variants are rewritten to /api/ at the top of middleware(),
// but we keep them here for any edge case.
function buildAuthPrefixes(): string[] {
  const v0: string[] = [
    '/api/appointments',
    '/api/medications',
    '/api/consultation-prep',
    '/api/emergency',
    '/api/emergency-sos',
    '/api/family',
    '/api/lab-bookings',
    '/api/labs',
    '/api/payments',
    '/api/prescriptions',
    '/api/notifications',
    '/api/chat',
    '/api/insights',
    '/api/health-report',
    '/api/chronic',
    '/api/doctors',
    '/api/reminders',
    '/api/challenges',
    '/api/account',
    '/api/consent',
    '/api/me',
    '/api/monitoring',
    '/api/turn-credentials',
    '/api/ai',
    '/api/consult-messages',
    '/api/prescription-scan',
    '/api/identify-medicine',
    '/api/documents',
    '/api/upload',
    '/api/search-medicine',
  ];
  // Add /api/v1/ variants
  const v1: string[] = v0.map(p => '/api/v1' + p.slice(4));
  return [...v0, ...v1];
}

const AUTH_REQUIRED_PREFIXES = buildAuthPrefixes();

function requiresAuth(pathname: string): boolean {
  return AUTH_REQUIRED_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

// ── Portal role mapping ──────────────────────────────────────────────────────

const PORTAL_ROLE_MAP: Record<string, string> = {
  '/patient': 'patient',
  '/doctor': 'doctor',
  '/lab': 'lab',
  '/caretaker': 'caretaker',
  '/family': 'caretaker', // 'family' URL → caretaker DB role
  '/admin': 'admin',
};

function isPortalPath(pathname: string): boolean {
  return Object.keys(PORTAL_ROLE_MAP).some(p => pathname === p || pathname.startsWith(p + '/'));
}

function expectedRoleForPortal(pathname: string): string | null {
  for (const p of Object.keys(PORTAL_ROLE_MAP)) {
    if (pathname === p || pathname.startsWith(p + '/')) return PORTAL_ROLE_MAP[p] ?? null;
  }
  return null;
}

// ── Rate-limit helpers ────────────────────────────────────────────────────────

function getApiLimit(pathname: string): number {
  if (pathname === '/api/auth/me') return 60;
  if (pathname.startsWith('/api/auth/')) return 30;
  if (pathname.startsWith('/api/payments')) return 5;
  if (pathname.startsWith('/api/chat')) return 20;
  if (pathname.startsWith('/api/emergency')) return 100; // emergency is high-tolerance
  return 100;
}

function inferResourceType(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length >= 3) {
    const resource = parts[2] as string;
    const map: Record<string, string> = {
      medication: 'Medication',
      lab: 'LabResult',
      labs: 'LabResult',
      prescription: 'Prescription',
      appointments: 'Appointment',
      family: 'Family',
      user: 'User',
      health: 'HealthJournal',
      health_report: 'HealthJournal',
      chronic: 'ChronicCondition',
      emergency: 'EmergencyAlert',
      emergency_sos: 'EmergencyAlert',
      chat: 'ChatMessage',
      doctors: 'DoctorProfile',
      notifications: 'Notification',
      reminders: 'Reminder',
      payment: 'Payment',
    };
    return map[resource] ?? resource;
  }
  return 'Unknown';
}

function inferResourceId(pathname: string): string | undefined {
  const parts = pathname.split('/').filter(Boolean);
  return parts.length >= 4 ? parts[3] : undefined;
}

// ── Security headers ──────────────────────────────────────────────────────────

function applyHeaders(res: NextResponse, pathname: string, requestId: string) {
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-XSS-Protection', '1; mode=block');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-Request-Id', requestId);
  res.headers.set('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self)');

  // Static assets cache
  if (
    pathname.startsWith('/icon') ||
    pathname.startsWith('/apple') ||
    pathname.startsWith('/logo') ||
    pathname.endsWith('.woff2')
  ) {
    res.headers.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
  }

  // Static pages cache (landing, pricing, legal) — short cache for SEO + performance
  const staticPages = ['/' , '/pricing', '/privacy', '/terms', '/cookies', '/accessibility', '/medical-disclaimer', '/refund-cancellation'];
  if (staticPages.includes(pathname)) {
    res.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  }

  // API responses: never cache (may contain sensitive health data)
  if (pathname.startsWith('/api/')) {
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.headers.set('Pragma', 'no-cache');
    res.headers.set('Expires', '0');
  }

  const isProd = process.env.NODE_ENV === 'production';
  // ponytail: HSTS must only be emitted over a real TLS connection. Sending it
  // over plain HTTP permanently locks browsers (esp. Safari) into https:// for
  // this origin, breaking local/dev non-TLS serving. Determine TLS from the
  // forwarded proto / x-forwarded-proto header (Caddy/ELB) or req url.
  const isHttps =
    (res as any).requestProtocol === 'https' ||
    res.headers.get('x-forwarded-proto') === 'https' ||
    false;
  const csp = isProd
    ? [
        "default-src 'self'",
        // ponytail: Next.js injects inline bootstrap/hydration scripts, so
        // 'unsafe-inline' is required or the app never hydrates (stuck on the
        // static landing hero). Kept for parity with the app's dev CSP.
        // challenges.cloudflare.com: Cloudflare Turnstile script + iframe for CAPTCHA.
        // static.cloudflareinsights.com: Cloudflare Web Analytics beacon (injected as <script data-cf-beacon> by the CDN).
        "script-src 'self' 'unsafe-inline' https://js.stripe.com https://challenges.cloudflare.com https://static.cloudflareinsights.com https://www.googletagmanager.com https://cdn.mxpnl.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https: http:",
        "font-src 'self' data:",
        "connect-src 'self' https://api.stripe.com https://checkout.stripe.com https://*.upstash.com https://www.google-analytics.com https://analytics.google.com https://api.mixpanel.com https://fcm.googleapis.com https://*.googleapis.com https://updates.push.services.mozilla.com https://*.push.services.mozilla.com wss: stun: turn:",
        "frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://*.stripe.com https://challenges.cloudflare.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
        // ponytail: only upgrade when actually served over TLS, else this blocks local HTTP
        ...(isHttps ? ['upgrade-insecure-requests'] : []),
      ].join('; ')
    : [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://challenges.cloudflare.com https://static.cloudflareinsights.com https://www.googletagmanager.com https://cdn.mxpnl.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: http: https:",
        "font-src 'self' data:",
        "connect-src 'self' http: https: ws: wss: https://checkout.stripe.com https://*.upstash.com",
        "frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://*.stripe.com https://challenges.cloudflare.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join('; ') + " report-uri /api/csp-report";

  res.headers.set('Content-Security-Policy', csp);
  res.headers.set('X-Frame-Options', 'DENY');

  // ponytail: HSTS only over real TLS. Never over plain HTTP — it bricks the
  // origin in browsers (Safari caches the upgrade and can't fall back).
  if (isProd && isHttps) {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
}

// ── CORS preflight ──────────────────────────────────────────────────────────

function handleCorsPreflight(req: NextRequest): NextResponse | null {
  if (req.method !== 'OPTIONS') return null;
  const origin = req.headers.get('origin');
  const rawCorsOrigin = process.env.CORS_ORIGIN ?? '';
  const allowList = rawCorsOrigin
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
  let corsOrigin: string | null = null;

  if (!allowList.length) {
    corsOrigin = process.env.NODE_ENV !== 'production' ? (origin ?? '*') : null;
  } else if (origin && allowList.includes(origin)) {
    // SECURITY: enforce HTTPS origins in production
    if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://')) {
      return new NextResponse(null, { status: 204 });
    }
    corsOrigin = origin;
  }

  if (!corsOrigin) return new NextResponse(null, { status: 204 });

  const res = new NextResponse(null, { status: 204 });
  res.headers.set('Access-Control-Allow-Origin', corsOrigin);
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
  res.headers.set(
    'Access-Control-Expose-Headers',
    'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Request-Id'
  );
  res.headers.set('Access-Control-Max-Age', '86400');
  res.headers.set('Vary', 'Origin');
  return res;
}

// ── Main proxy ───────────────────────────────────────────────────────────────

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export default async function middleware(req: NextRequest): Promise<NextResponse> {
  ensureEnvValidated();

  let { pathname } = req.nextUrl;

  // ── API versioning: transparently rewrite /api/v1/* to /api/* ─────────
  // This allows consuming /api/v1/doctors, /api/v1/medications, etc.
  // while keeping the current route handlers at their existing paths.
  // New endpoint development can target /api/v1/ going forward.
  const V1_PREFIX = '/api/v1/';
  if (pathname.startsWith(V1_PREFIX)) {
    pathname = '/api/' + pathname.slice(V1_PREFIX.length);
  }
  const method = req.method;
  const isApi = pathname.startsWith('/api/');
  const rawIp = getClientIp(req); // unmasked — used for rate-limiting keys
  const ip = maskIp(rawIp); // masked — used for audit logs only
  const ua = getUserAgent(req);
  const requestId = getRequestId();

  // Block dangerous methods that should never be proxied to app handlers
  const safeMethods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
  if (!safeMethods.includes(method)) {
    return new NextResponse(null, { status: 405 });
  }

  // All responses get trace + security headers
  const res = NextResponse.next();
  res.headers.set('X-Request-Id', requestId);

  // ── Supabase Auth: check session presence ──────────────────────────────
  // Parse user ID from the cookie JWT. The sb-*-auth-token cookie is only
  // trusted after verifying its signature — HS256 against SUPABASE_JWT_SECRET,
  // or ES256 against the project's public signing key
  // (SUPABASE_JWT_ES256_PUBLIC_JWK) for projects migrated to asymmetric keys.
  // Previously the middleware base64-decoded the cookie and trusted any
  // JSON payload, so an attacker could forge `sb-x-auth-token` claiming any
  // user id (bypassing the login-redirect guard, keying rate limits to a
  // victim, and poisoning audit logs with fake ids). Unverifiable cookies
  // fail closed to unauthenticated. When no verification secret is
  // configured the sb-* cookie is ignored entirely; every real login path
  // also sets the HMAC-verified kynthai-session cookie, so the gate still
  // works. There is no network call — pure WebCrypto at the edge.
  let supabaseUser: { id: string } | null = null;
  try {
    const cookies = req.cookies.getAll();
    const sessionCookie = cookies.find(c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (sessionCookie?.value && jwtSecret) {
      const rawJwk = process.env.SUPABASE_JWT_ES256_PUBLIC_JWK;
      const es256Jwk: JsonWebKey | null = rawJwk ? (JSON.parse(rawJwk) as JsonWebKey) : null;
      const verified = await verifySupabaseJwt(sessionCookie.value, jwtSecret, es256Jwk);
      if (verified) {
        supabaseUser = verified;
        // Sliding renewal: make sure the HMAC-verified kynthai-session cookie
        // exists too, so the portal guard keeps working even if the sb-*
        // refresh window outlives it and SUPABASE_JWT_SECRET is absent.
        const localSessionCookie = cookies.find(c => c.name === 'kynthai-session');
        if (!localSessionCookie?.value || !(await verifySessionToken(localSessionCookie.value))) {
          const signed = await signSessionToken(verified.id);
          if (signed) {
            // Same cookie policy as the login route; Secure only behind a TLS
            // proxy so local/CI http testing still stores it.
            const secure =
              req.headers.get('x-forwarded-proto') === 'https' ||
              req.headers.get('x-forwarded-ssl') === 'on';
            res.cookies.set('kynthai-session', signed, {
              httpOnly: true,
              secure,
              sameSite: 'strict',
              maxAge: 60 * 60 * 24 * 7,
              path: '/',
            });
          }
        }
      }
      // Verification failed OR no secret configured → sb-* cookie not trusted.
    }
    // Local session cookie (kynthai-session) — HMAC verified
    if (!supabaseUser) {
      const localSessionCookie = cookies.find(c => c.name === 'kynthai-session');
      if (localSessionCookie?.value) {
        const verifiedUserId = await verifySessionToken(localSessionCookie.value);
        if (verifiedUserId) {
          supabaseUser = { id: verifiedUserId };
        }
        // If verifySessionToken returns null the cookie is tampered — treat as unauth
      }
    }
  } catch {
    // Cookie parsing failed — treat as unauthenticated
  }

  // ── Static assets ──────────────────────────────────────────────────────
  if (pathname.startsWith('/_next/static/')) {
    res.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    return res;
  }
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/icon') ||
    pathname.startsWith('/logo') ||
    pathname.startsWith('/manifest') ||
    pathname.startsWith('/sw.js') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/apple')
  ) {
    applyHeaders(res, pathname, requestId);
    return res;
  }

  // ── CORS preflight ─────────────────────────────────────────────────────
  const corsResponse = handleCorsPreflight(req);
  if (corsResponse !== null) {
    corsResponse.headers.set('Vary', 'Origin');
    applyHeaders(corsResponse, pathname, requestId);
    return corsResponse;
  }

  // ── Audit endpoint: session cookie required ─────────────────────────────
  if (pathname === '/api/audit' || pathname.startsWith('/api/audit/')) {
    // SECURITY: verify the JWT, not just cookie presence — prevents forged sb-* cookies
    if (!supabaseUser) {
      // Edge-safe audit logging (no DB access at edge)
      console.log(`[AUDIT] audit_endpoint_unauthorized | method=${method} | path=${pathname} | ip=${ip} | req=${requestId}`);
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
  }

  // ── Edge audit log API requests (health-data-safe) ────────────────────────────
  if (isApi && !isPublicApi(pathname, method)) {
    const origin = req.headers.get('origin') ?? 'direct';
    // Edge-safe audit logging (no DB access at edge)
    console.log(`[AUDIT] request.edge | method=${method} | path=${maskPathIds(pathname)} | ip=${ip}`);
  }

  // ── Portal role guard ─────────────────────────────────────────────────
  // Role-based access is enforced by each portal's client-side auth guard.
  // The proxy only checks session presence (supabaseUser above).
  // Demo mode: allow portal access without session cookie.
  const isDemoMode = isDemoEnabled();
  if (isPortalPath(pathname) && !isApi && !supabaseUser && !isDemoMode) {
    const redirect = NextResponse.redirect(new URL('/login', req.url));
    applyHeaders(redirect, pathname, requestId);
    return redirect;
  }

  // ── Rate limit ──────────────────────────────────────────────────────────
  if (isApi) {
    const limit = getApiLimit(pathname);
    const sessionUserId = supabaseUser?.id;
    const rateLimitKey = sessionUserId ?? rawIp; // unmasked IP for precise per-IP limiting
    const rateLimitResult = await rateLimitWithInfo(
      'proxy:' + rateLimitKey + ':' + pathname,
      limit,
      60_000 // window: 60 seconds
    );

    if (rateLimitResult.allowed) {
      res.headers.set('X-RateLimit-Limit', String(limit));
      res.headers.set('X-RateLimit-Remaining', String(rateLimitResult.remaining));
      res.headers.set('X-RateLimit-Reset', String(rateLimitResult.reset));
    } else {
      // Edge-safe audit logging (no DB access at edge)
      console.log(`[AUDIT] rate_limit | method=${method} | path=${pathname} | ip=${ip} | limit=${limit}`);
      rateLimitResult.response!.headers.set('X-RateLimit-Limit', String(limit));
      rateLimitResult.response!.headers.set('X-RateLimit-Remaining', '0');
      rateLimitResult.response!.headers.set('X-RateLimit-Reset', String(rateLimitResult.reset));
      applyHeaders(rateLimitResult.response!, pathname, requestId);
      return rateLimitResult.response!;
    }
  }

  // ── CSRF enforcement ──────────────────────────────────────────────────
  // Enforce double-submit CSRF token on all state-changing requests.
  // Public auth endpoints are included — the client fetches /api/auth/csrf
  // before submitting credentials.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && isApi && !isSystemApi(pathname)) {
    const csrfError = await checkCsrf(req);
    if (csrfError) {
      applyHeaders(csrfError, pathname, requestId);
      return csrfError;
    }
  }

  // ── Auth-required path guard ───────────────────────────────────────────
  if (requiresAuth(pathname)) {
    const sessionUser = supabaseUser;

    if (!sessionUser && !isPublicApi(pathname, method) && !isSystemApi(pathname)) {
      applyHeaders(res, pathname, requestId);
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (sessionUser && !isPublicApi(pathname, method)) {
      const resourceType = inferResourceType(pathname);
      const resourceId = inferResourceId(pathname);
      try {
        // Edge-safe audit logging (no DB access at edge)
        console.log(`[AUDIT] resource.access | user=${sessionUser.id} | resource=${resourceType} | path=${maskPathIds(pathname)}`);
      } catch {
        // non-blocking audit failure
      }
    }
  }

  applyHeaders(res, pathname, requestId);
  return res;
}
