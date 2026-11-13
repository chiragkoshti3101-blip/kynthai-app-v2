const SYSTEM_API_PATHS = new Set([
  '/api/reminders/schedule',
  '/api/reminders/send',
  '/api/reminders/escalate',
  '/api/appointment-reminders',
  '/api/chat/cleanup',
  '/api/auth/logout',
  '/api/system/seed-demo',
  '/api/system/test-dose',
  '/api/notifications/fcm-register',
  '/api/newsletter',
]);

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

const PUBLIC_GET_ONLY = new Set([
  '/api/doctors',
  '/api/labs',
  '/api/search-medicine',
  '/api/v1/doctors',
  '/api/v1/labs',
  '/api/v1/search-medicine',
]);

export function isSystemApiPath(pathname: string): boolean {
  return SYSTEM_API_PATHS.has(pathname);
}

export function isPublicApiPath(pathname: string, method = 'GET'): boolean {
  if (PUBLIC_API_PATHS.has(pathname)) return true;
  if (method === 'GET' && PUBLIC_GET_ONLY.has(pathname)) return true;
  return false;
}

/** Default-deny: all /api/* require a session unless explicitly public or system. */
export function requiresAuthenticatedApi(pathname: string, method = 'GET'): boolean {
  if (!pathname.startsWith('/api/')) return false;
  if (isSystemApiPath(pathname)) return false;
  if (isPublicApiPath(pathname, method)) return false;
  return true;
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
