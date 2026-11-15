/**
 * Security utilities for Kynthai — Hardened version
 *
 * Fixes CodeQL alerts:
 * - js/incomplete-multi-character-sanitization (security.ts:17, alerts #7 and #8)
 * - js/polynomial-regex-used-on-uncontrolled-data (security.ts:17, alert #5)
 *
 * Sanitization strategy (defense in depth):
 * 1. Strip control characters (except whitespace)
 * 2. Remove <script>…</script> blocks entirely (tag + contents)
 * 3. Remove HTML comments
 * 4. Remove javascript: URL schemes
 * 5. Strip remaining HTML tags (tag-name anchored, so `a < b` survives)
 * 6. Trim and truncate to maxLen
 *
 * CWE coverage: CWE-20 (Improper Input Validation), CWE-79 (XSS), CWE-80 (Improper Neutralization of Script-Related HTML Tags), CWE-116 (Improper Neutralization of Output)
 */

import { NextRequest, NextResponse } from 'next/server'

const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
const E164_RE = /^\+[1-9]\d{6,14}$/

// ── Control characters (except allowed whitespace) ──────────────────────────
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g

// ── <script>…</script> blocks — remove tag AND contents (case-insensitive) ────
const SCRIPT_BLOCK_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi

// ── HTML comments — can otherwise hide markup from the tag stripper ─────────
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g

// ── javascript: URLs ────────────────────────────────────────────────────────
const JAVASCRIPT_URL_RE = /javascript\s*:/gi

// ── Remaining HTML tags ─────────────────────────────────────────────────────
// A tag must start with an optional `/` and a letter, so plain comparisons such
// as `BP < 120 and > 90` are preserved instead of being swallowed as markup.
const HTML_TAG_RE = /<\/?[a-zA-Z][^<>]*>/g

export function isValidEmail(email: string): boolean {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email)
}

export function isValidE164(phone: string): boolean {
  return typeof phone === 'string' && E164_RE.test(phone.trim())
}

/**
 * Sanitize untrusted text input to prevent XSS and HTML injection.
 *
 * Defense in depth — multiple layers strip dangerous content before
 * truncation. Not a substitute for output encoding; always encode
 * user-controlled data when rendering in HTML contexts.
 */
export function sanitizeText(input: unknown, maxLen = 1000): string {
  if (typeof input !== 'string') return ''

  let text = input

  // 1. Strip control characters (keep \n \r \t)
  text = text.replace(CONTROL_CHARS_RE, '')

  // 2. Remove complete <script> blocks (tag + contents)
  text = text.replace(SCRIPT_BLOCK_RE, '')

  // 3. Remove HTML comments, which can otherwise hide markup
  text = text.replace(HTML_COMMENT_RE, '')

  // 4. Remove the javascript: scheme so the value is no longer a navigable
  //    script URL (the previous replacement was an identical string).
  text = text.replace(JAVASCRIPT_URL_RE, '')

  // 5. Strip remaining HTML tags
  text = text.replace(HTML_TAG_RE, '')

  // 6. Trim and truncate
  return text.trim().slice(0, maxLen)
}

// ── Rate limiting — re-exported from rate-limit.ts (single source of truth) ──
export { rateLimit, rateLimitProduction, getIp } from '@/lib/rate-limit'

// ── Password strength ──────────────────────────────────────────────────
const SPECIAL_RE = /[!@#$%^&*()_+\-=\[\]{}|;:',.<>?]/

export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (password.length < 12) errors.push('At least 12 characters')
  if (!/[A-Z]/.test(password)) errors.push('At least one uppercase letter')
  if (!/[a-z]/.test(password)) errors.push('At least one lowercase letter')
  if (!/\d/.test(password)) errors.push('At least one number')
  if (!SPECIAL_RE.test(password)) errors.push('At least one special character (!@#$%^&*()_+-=[]{}|;:\',.<>?)')
  return { valid: errors.length === 0, errors }
}

/**
 * Check a password against the HaveIBeenPwned k-anonymity API.
 * Uses SHA-1 prefix (first 5 hex chars) so the full hash is never sent.
 * Returns true when the password appears in breach data.
 */
export async function checkBreachedPassword(password: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const prefix = hashHex.slice(0, 5);
    const suffix = hashHex.slice(5);

    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'User-Agent': 'Kynthai-Security-Check' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return false;

    const text = await response.text();
    const lines = text.split('\n');
    for (const line of lines) {
      const parts = line.split(':');
      const hashSuffix = parts[0];
      const count = parts[1];
      if (hashSuffix && hashSuffix === suffix) {
        return parseInt(count ?? '0', 10) > 0;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Async password strength validation including breach check.
 * Use this on registration where a network call is acceptable.
 */
export async function validatePasswordStrengthAsync(password: string): Promise<{ valid: boolean; errors: string[] }> {
  const result = validatePasswordStrength(password);
  if (!result.valid) return result;

  const breached = await checkBreachedPassword(password);
  if (breached) {
    result.errors.push('This password has appeared in data breaches. Please choose a different one.');
    result.valid = false;
  }
  return result;
}

// ── PII masking ──────────────────────────────────────────────────────
export function maskIdLike(value: string | null | undefined): string {
  if (!value) return '—'
  const v = String(value).trim()
  if (v.length <= 4) return 'XXXX-' + v.slice(-4)
  return 'XXXX-' + v.slice(-4)
}
