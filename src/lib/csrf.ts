/**
 * CSRF Protection — Double-Submit Cookie Pattern (Hardened)
 *
 * For state-changing requests (POST, PUT, PATCH, DELETE), the client must
 * send an `X-CSRF-Token` header that matches the `kynthai-csrf` cookie value.
 *
 * The token is generated on first GET request (via /api/auth/csrf) and stored
 * as an HttpOnly cookie. The frontend reads the token from the JSON response
 * body (not document.cookie) and includes it in all mutating requests.
 *
 * This protects against Cross-Site Request Forgery (CSRF) attacks where a
 * malicious site tricks the browser into sending authenticated requests.
 *
 * Usage in API routes:
 *   import { checkCsrf } from '@/lib/csrf'
 *   const csrfError = await checkCsrf(req)
 *   if (csrfError) return csrfError
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
// Web Crypto API (available in Edge Runtime)

const CSRF_COOKIE = 'kynthai-csrf'
const CSRF_HEADER = 'x-csrf-token'
const TOKEN_LENGTH = 32

// ── Security headers for rate-limit responses (avoids circular import) ── NO, keep
// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Is this request over HTTPS? Used to decide whether sensitive cookies get the
 * `Secure` flag. We can't rely on NODE_ENV alone: the production build also
 * runs on http://localhost during local dev and CI e2e, where WebKit refuses to
 * store Secure cookies over plain http (Chrome/Firefox make a localhost
 * exemption). Reading the proxy proto keeps prod (https) cookies Secure while
 * letting local http testing work identically across browsers.
 */
export function isSecureRequest(req: { headers: { get(h: string): string | null } }): boolean {
  return req.headers.get('x-forwarded-proto') === 'https' || req.headers.get('x-forwarded-ssl') === 'on';
}

/** Generate a cryptographically random CSRF token. */
export async function generateCsrfToken(): Promise<string> {
  const bytes = new Uint8Array(TOKEN_LENGTH)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Set the CSRF cookie on the response. Called by the /api/auth/csrf endpoint.
 *
 * SECURITY: Cookie is HttpOnly (not readable via document.cookie), Secure over
 * HTTPS, and SameSite=strict. The frontend reads the token from the JSON
 * response body of /api/auth/csrf, not from document.cookie.
 */
export async function setCsrfCookie(req: { headers: { get(h: string): string | null } }): Promise<{ token: string }> {
  // During Next.js build (page data collection), cookies() throws
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return { token: 'build-dummy-token' }
  }
  const cookieStore = await cookies()
  const store: any = cookieStore
  const existing = store?.get(CSRF_COOKIE)?.value
  if (existing) return { token: existing }

  const token = await generateCsrfToken()
  store?.set(CSRF_COOKIE, token, {
      httpOnly: true,
      secure: isSecureRequest(req),
      sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
  return { token }
}

/**
 * Verify CSRF token on state-changing requests.
 * Returns null if valid, or a 403 NextResponse if invalid/missing.
 *
 * Only call this on POST/PUT/PATCH/DELETE routes — not on GET.
 *
 * SECURITY: No build-phase bypass. CSRF is always enforced at runtime.
 */
export async function checkCsrf(req: NextRequest): Promise<NextResponse | null> {
  // Read CSRF cookie from the raw Cookie header (works in both Node.js and Edge runtime).
  // Using cookies() from next/headers fails in Edge middleware (proxy.ts).
  const cookieHeader = req.headers.get('cookie') ?? ''
  const cookieMatch = cookieHeader.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]*)`))
  const cookieToken = cookieMatch ? decodeURIComponent(cookieMatch[1] ?? '') : undefined

  const headerToken = req.headers.get(CSRF_HEADER)
  // Both tokens must be present and match
  if (!cookieToken || !headerToken) {
    return NextResponse.json(
      { error: 'CSRF token missing. Fetch /api/auth/csrf first.' },
      { status: 403 }
    )
  }

  // Use timing-safe comparison to prevent timing attacks
  const cookieBytes = new TextEncoder().encode(cookieToken)
  const headerBytes = new TextEncoder().encode(headerToken)

  if (cookieBytes.length !== headerBytes.length) {
    return NextResponse.json(
      { error: 'CSRF token mismatch.' },
      { status: 403 }
    )
  }

  let diff = 0
  for (let i = 0; i < cookieBytes.length; i++) {
    diff |= (cookieBytes[i]!) ^ (headerBytes[i]!)
  }
  if (diff !== 0) {
    return NextResponse.json(
      { error: 'CSRF token mismatch.' },
      { status: 403 }
    )
  }

  return null // Valid — allow the request
}
