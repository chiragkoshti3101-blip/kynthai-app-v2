/**
 * Single source of truth for edge middleware API access:
 * - System paths: no session, CSRF-exempt (cron, webhooks, logout, etc.)
 * - Public paths: no session; may still enforce CSRF when not system
 */

/** Paths that skip session auth and CSRF (provider/cron cannot send CSRF). */
export const SYSTEM_API_PATHS = [
  '/api/reminders/schedule',
  '/api/reminders/send',
  '/api/reminders/escalate',
  '/api/appointment-reminders',
  '/api/chat/cleanup',
  '/api/auth/logout',
  '/api/system/seed-demo',
  '/api/system/email-capture',
  '/api/system/test-dose',
  '/api/notifications/fcm-register',
  '/api/newsletter',
  '/api/stripe/webhook',
  '/api/csp-report',
  '/api/v1/stripe/webhook',
] as const;

/** Anonymous access for any HTTP method. */
export const PUBLIC_API_ALL_METHODS = [
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
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/csrf',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/verify-email',
  '/api/v1/auth/resend-verification',
  '/api/v1/health',
  '/api/v1/stripe/webhook',
  '/api/v1/newsletter',
] as const;

/** GET without session (exact path). */
export const PUBLIC_GET_EXACT = [
  '/api/doctors',
  '/api/labs',
  '/api/search-medicine',
  '/api/auth/me',
  '/api/invite',
  '/api/admin/bootstrap-schema',
  '/api/debug',
  '/api/v1/doctors',
  '/api/v1/labs',
  '/api/v1/search-medicine',
  '/api/v1/auth/me',
  '/api/v1/invite',
] as const;

/** POST without session (handler may still 404 in prod, rate-limit, or verify signatures). */
export const PUBLIC_POST_EXACT = [
  '/api/feedback',
  '/api/auth/demo-login',
  '/api/v1/feedback',
  '/api/v1/auth/demo-login',
] as const;

/**
 * Second path segment under /api/doctors/* that is NOT a public profile id lookup.
 * `/api/doctors/{cuid}` is public; `/api/doctors/availability` is not.
 */
export const DOCTOR_PUBLIC_PROFILE_DENY_SEGMENTS = [
  'ai-notes',
  'availability',
  'dashboard',
  'heartbeat',
  'insights',
  'me',
  'notes',
  'nudge',
  'patients',
  'prescribe',
  'prescription-pdf',
  'subscribe',
  'templates',
] as const;

const systemSet = new Set<string>(SYSTEM_API_PATHS);
const publicAllSet = new Set<string>(PUBLIC_API_ALL_METHODS);
const publicGetSet = new Set<string>(PUBLIC_GET_EXACT);
const publicPostSet = new Set<string>(PUBLIC_POST_EXACT);
const doctorDenySet = new Set<string>(DOCTOR_PUBLIC_PROFILE_DENY_SEGMENTS);

export function isSystemApiPath(pathname: string): boolean {
  return systemSet.has(pathname);
}

function isPublicDoctorOrLabProfileGet(pathname: string): boolean {
  const m = pathname.match(/^\/api\/(doctors|labs)\/([^/]+)$/);
  if (!m) return false;
  const kind = m[1]!;
  const segment = m[2]!;
  if (kind === 'labs' && segment === 'dashboard') return false;
  if (kind === 'doctors' && doctorDenySet.has(segment)) return false;
  return true;
}

export function isPublicApiPath(pathname: string, method = 'GET'): boolean {
  if (publicAllSet.has(pathname)) return true;
  const m = method.toUpperCase();
  if (m === 'GET' && publicGetSet.has(pathname)) return true;
  if (m === 'POST' && publicPostSet.has(pathname)) return true;
  if (m === 'GET' && isPublicDoctorOrLabProfileGet(pathname)) return true;
  return false;
}

/** Default-deny: all /api/* require a session unless explicitly public or system. */
export function requiresAuthenticatedApi(pathname: string, method = 'GET'): boolean {
  if (!pathname.startsWith('/api/')) return false;
  if (isSystemApiPath(pathname)) return false;
  if (isPublicApiPath(pathname, method)) return false;
  return true;
}

/** Full allowlist for ops/docs and regression tests. */
export function getApiPublicAccessAllowlist(): {
  systemPaths: readonly string[];
  publicAllMethods: readonly string[];
  publicGetExact: readonly string[];
  publicPostExact: readonly string[];
  publicGetDynamic: string;
  doctorProfileDenySegments: readonly string[];
} {
  return {
    systemPaths: SYSTEM_API_PATHS,
    publicAllMethods: PUBLIC_API_ALL_METHODS,
    publicGetExact: PUBLIC_GET_EXACT,
    publicPostExact: PUBLIC_POST_EXACT,
    publicGetDynamic: 'GET /api/doctors/{id} and GET /api/labs/{id} (single segment, not deny-listed)',
    doctorProfileDenySegments: DOCTOR_PUBLIC_PROFILE_DENY_SEGMENTS,
  };
}

const PORTAL_ROLE_MAP: Record<string, string> = {
  '/patient': 'patient',
  '/doctor': 'doctor',
  '/lab': 'lab',
  '/caretaker': 'caretaker',
  '/family': 'caretaker',
  '/admin': 'admin',
};

export function expectedPortalRole(pathname: string): string | null {
  for (const prefix of Object.keys(PORTAL_ROLE_MAP)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return PORTAL_ROLE_MAP[prefix] ?? null;
    }
  }
  return null;
}

export function portalRoleAllowed(sessionRole: string | null | undefined, pathname: string): boolean {
  const expected = expectedPortalRole(pathname);
  if (!expected) return true;
  if (!sessionRole) return false;
  if (expected === 'caretaker') {
    return sessionRole === 'caretaker' || sessionRole === 'patient';
  }
  return sessionRole === expected;
}
