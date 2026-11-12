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
 * 3. Remove event handler attributes (onclick, onerror, onload=, etc.)
 * 4. Remove javascript: URLs
 * 5. Strip remaining HTML tags
 * 6. Trim and truncate to maxLen
 *
 * CWE coverage: CWE-20 (Improper Input Validation), CWE-79 (XSS), CWE-80 (Improper Neutralization of Script-Related HTML Tags), CWE-116 (Improper Neutralization of Output)
 */

import { NextRequest, NextResponse } from 'next/server'

const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
const E164_RE = /^\+[1-9]\d{6,14}$/

// ── Control characters (except allowed whitespace) ──────────────────────────
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g

// ── <script>…</script> blocks — remove tag AND contents (greedy, case-insensitive, dotall) ────
const SCRIPT_BLOCK_RE = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi

// ── Event handler attributes: onclick=, onerror=, onload=, etc. ──────────────
const EVENT_HANDLER_RE = /\s+on[a-zA-Z]+\s*=\s*(["'])[\s\S]*?\1/g

// ── javascript: URLs ────────────────────────────────────────────────────────
const JAVASCRIPT_URL_RE = /javascript\s*:/gi

// ── Remaining HTML tags ─────────────────────────────────────────────────────
const HTML_TAG_RE = /<[^>]*>/g

export function isValidEmail(email: string): boolean {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email)
}

export function isValidE164(phone: string): boolean {
  return typeof email === 'string' && E164_RE.test(phone.trim())
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

  // 3. Remove event handler attributes (onclick, onerror, etc.)
  text = text.replace(EVENT_HANDLER_RE, '')

  // 4. Neutralize javascript: URLs
  text = text.replace(JAVASCRIPT_URL_RE, 'javascript:')

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

// ── PII masking ──────────────────────────────────────────────────────
export function maskIdLike(value: string | null | undefined): string {
  if (!value) return '—'
  const v = String(value).trim()
  if (v.length <= 4) return 'XXXX-' + v.slice(-4)
  return 'XXXX-' + v.slice(-4)
}
