/**
 * Session Cookie Signing — HMAC-SHA256 integrity for local auth fallback
 *
 * Format: "{userId}:{hmac_hex}"
 * hmac = HMAC-SHA256(userId, signingSecret)
 *
 * Secret resolution order:
 *   1. SESSION_SIGNING_SECRET (preferred, explicit)
 *   2. SUPABASE_SERVICE_ROLE_KEY (fallback — always set in prod)
 *   3. 'kynthai-dev-fallback-secret' (dev only — refuses to sign in production)
 *
 * Also exports verifySupabaseJwt: cryptographic verification of the
 * Supabase sb-*-auth-token cookie (HS256 via SUPABASE_JWT_SECRET, or ES256 via
 * the project's public signing key) for use at the Edge middleware. A cookie
 * whose signature does not verify (or that is not a JWT at all) MUST be
 * treated as unauthenticated — the old base64-JSON decode trusted arbitrary
 * forged payloads.
 */

function getSigningSecret(): string | null {
  const env = process.env;
  if (env.SESSION_SIGNING_SECRET) return env.SESSION_SIGNING_SECRET;
  if (env.SUPABASE_SERVICE_ROLE_KEY) return env.SUPABASE_SERVICE_ROLE_KEY;
  if (env.NODE_ENV !== 'production') return 'kynthai-dev-fallback-secret';
  // Production with no secret — refuse to sign (fail-closed)
  return null;
}

/**
 * Sign a userId → returns "userId:hmacHex" or null if signing unavailable in prod.
 */
export async function signSessionToken(userId: string): Promise<string | null> {
  const secret = getSigningSecret();
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[session-signing] CRITICAL: No SESSION_SIGNING_SECRET or SUPABASE_SERVICE_ROLE_KEY set in production. ' +
        'Session cookies cannot be signed. Either set SESSION_SIGNING_SECRET or ensure Supabase is reachable.'
      );
    }
    return null;
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(userId));
  const hmac = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${userId}:${hmac}`;
}

/**
 * Verify a signed token → returns userId if valid, null if tampered or malformed.
 * Fails closed: any parsing/verification error returns null (unauthenticated).
 */
export async function verifySessionToken(signed: string): Promise<string | null> {
  if (!signed || typeof signed !== 'string') return null;
  const colonIdx = signed.indexOf(':');
  if (colonIdx === -1) return null;
  const userId = signed.slice(0, colonIdx);
  const providedHmac = signed.slice(colonIdx + 1);
  if (!userId || !providedHmac || providedHmac.length !== 64) return null;
  const secret = getSigningSecret();
  if (!secret) return null;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(userId));
  const expectedHmac = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  // Constant-time comparison
  const providedHmacParts: string[] = (providedHmac.match(/.{2}/g) ?? []) as unknown as string[];
  if (providedHmacParts.length === 0) return null;
  const expectedHmacParts: string[] = (expectedHmac.match(/.{2}/g) ?? []) as unknown as string[];
  if (expectedHmacParts.length === 0) return null;
  const provided = new Uint8Array(providedHmacParts.map(b => parseInt(b, 16)));
  const expected = new Uint8Array(expectedHmacParts.map(b => parseInt(b, 16)));
  if (provided.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= (provided[i]!) ^ (expected[i]!);
  }
  if (diff !== 0) return null;
  
  // Check if session has been revoked
  try {
    const revoked = await db.revokedSession.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    if (revoked) return null;
  } catch (err) {
    console.error('[session] Revocation check failed:', err);
    // Fail closed on database error
    return null;
  }
  
  return userId;
}

// ── Supabase auth-token cookie verification ─────────────────────────────────

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
  const bin = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Verify a Supabase `sb-*-auth-token` cookie value and extract the user id.
 *
 * Cookie shape (GoTrue): `base64-` + base64url(JSON { access_token, ... }) —
 * the `access_token` field is the JWT to verify. A bare JWT cookie value is
 * also accepted.
 *
 * Signature verification is per the JWT header `alg`:
 *  - HS256: HMAC-SHA256 with the project's SUPABASE_JWT_SECRET. IMPORTANT:
 *    Supabase signs with the secret's UTF-8 string bytes — do NOT base64-decode
 *    the secret first (verified against the project's real anon key).
 *  - ES256: ECDSA P-256 with the project's PUBLIC signing key
 *    (SUPABASE_JWT_ES256_PUBLIC_JWK). The private key never leaves Supabase;
 *    the public JWK is safe to embed (it is public by design). Projects that
 *    migrated to asymmetric keys have `alg: ES256` session tokens — HS256-only
 *    verification silently fails for them.
 *  - anything else → fail closed.
 *
 * Returns { id } (from `sub`, falling back to `user.id`) on success, null on
 * ANY failure (wrong secret, tampered payload, expired, malformed, unknown
 * alg) — always fail closed. Expiry is enforced against the JWT `exp` claim.
 */
export async function verifySupabaseJwt(
  cookieValue: string,
  secret: string,
  es256PublicJwk?: (JsonWebKey & { kid?: string }) | null
): Promise<{ id: string } | null> {
  if (!cookieValue || !secret) return null;
  try {
    // 1. Unwrap the cookie: base64- prefixed envelope (JSON) or bare JWT.
    const raw = cookieValue.startsWith('base64-')
      ? cookieValue.slice('base64-'.length)
      : cookieValue;
    const decoded = new TextDecoder().decode(base64UrlToBytes(raw));
    // Envelopes start with `{` (JSON); a bare JWT never does (starts with a
    // base64url character). The envelope's access_token alone may contain two
    // dots, so counting dots on the whole decoded value is ambiguous.
    let jwt: string;
    if (decoded.startsWith('{')) {
      const envelope = JSON.parse(decoded); // { access_token, refresh_token, ... }
      const at = typeof envelope?.access_token === 'string' ? envelope.access_token : null;
      if (!at || at.split('.').length !== 3) return null;
      jwt = at;
    } else {
      jwt = decoded; // bare JWT stored directly
    }

    // 2. Verify the JWT signature per its alg.
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
    const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerB64))) as {
      alg?: string;
      kid?: string;
    };
    const alg = header.alg;
    const kid = typeof header.kid === 'string' ? header.kid : null;
    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

    let valid = false;
    if (alg === 'HS256') {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );
      valid = await crypto.subtle.verify('HMAC', key, base64UrlToBytes(sigB64), signingInput);
    } else if (alg === 'ES256') {
      if (
        !es256PublicJwk ||
        es256PublicJwk.kty !== 'EC' ||
        es256PublicJwk.crv !== 'P-256'
      ) {
        return null;
      }
      // If both the token and the configured key carry a kid, they must match.
      if (kid && es256PublicJwk.kid && kid !== es256PublicJwk.kid) return null;
      const key = await crypto.subtle.importKey(
        'jwk',
        es256PublicJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      // JOSE ES256 signatures are raw R||S (64 bytes) — WebCrypto's expected form.
      valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        base64UrlToBytes(sigB64),
        signingInput
      );
    } else {
      // Unknown/unexpected alg → fail closed.
      return null;
    }
    if (!valid) return null;

    // 3. Payload checks: shape, expiry, identity.
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadB64)));
    if (typeof payload !== 'object' || payload === null) return null;
    // Reject expired tokens (exp is seconds since epoch)
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null;
    const id =
      typeof payload.sub === 'string' && payload.sub
        ? payload.sub
        : typeof payload.user?.id === 'string'
          ? payload.user.id
          : null;
    return id ? { id } : null;
  } catch {
    // Malformed base64 / invalid JWT shape / JSON parse failure → fail closed
    return null;
  }
}
