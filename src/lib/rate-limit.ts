/**
 * Unified rate limiting — single source of truth.
 *
 * Two functions:
 *   - rateLimit(req, max, windowMs) — synchronous, in-memory, for API route imports
 *   - rateLimitProduction(req, limit, windowMs) — async, Redis-backed, for auth helpers
 *
 * Both use HMR-safe global buckets and extract IP from trusted-proxy headers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// ── HMR-safe in-memory buckets ────────────────────────────────────────
interface RateBucket { count: number; resetAt: number }
const memBuckets = new Map<string, RateBucket>()
const globalForRate = globalThis as unknown as { __rateBuckets?: Map<string, RateBucket> }
const buckets = globalForRate.__rateBuckets ?? memBuckets
globalForRate.__rateBuckets = buckets

// ── Redis-backed limiter (production) ─────────────────────────────────
let redisLimiter: Ratelimit | null = null
const redisPrefix = 'kynthai:ratelimit'

// Reject placeholder / sample config (mirrors nvidia.ts isRealProviderKey)
// so a template value falls back to in-memory instead of failing Redis
// calls on every request.
function isRealUpstashConfig(url: string | undefined, token: string | undefined): boolean {
  if (!url || !token) return false
  if (url.length < 16 || token.length < 16) return false
  return !/PLACEHOLDER|placeholder|xxx|changeme|sample/i.test(url + token)
}

export function isDistributedRateLimitActive(): boolean {
  return getRedisLimiter() !== null
}

function getRedisLimiter(): Ratelimit | null {
  if (redisLimiter) return redisLimiter
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!isRealUpstashConfig(url, token)) return null
  const redis = new Redis({ url, token })
  redisLimiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(100, '1 m'), analytics: true, prefix: redisPrefix })
  return redisLimiter
}

// ── IP extraction (trusts X-Forwarded-For from Caddy) ────────────────
export function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

// ── Minimal security headers for rate-limit responses (avoids circular import) ──
function applyRateLimitSecurityHeaders(res: NextResponse, req: NextRequest): void {
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.headers.set('Pragma', 'no-cache')
  res.headers.set('Expires', '0')
  const origin = req.headers.get('origin')
  if (origin) {
    res.headers.set('Access-Control-Allow-Origin', origin)
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token')
    res.headers.set('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Request-Id')
    res.headers.set('Access-Control-Max-Age', '86400')
    res.headers.set('Vary', 'Origin')
  }
}

// ── Synchronous in-memory rate limit ─────────────────────────────────
export function rateLimit(req: NextRequest, max = 60, windowMs = 60000, opts?: { globalKey?: boolean }): NextResponse | null {
  // Skip rate limiting in CI/E2E test environments to avoid false positives from
  // the same-IP test runner. Production is unaffected (CI env var not set).
  if (process.env.CI === 'true' || process.env.NODE_ENV === 'test') return null;
  const ip = getIp(req)
  const key = opts?.globalKey ? `global:${ip}` : `${ip}:${req.nextUrl.pathname}`
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < now) { bucket = { count: 0, resetAt: now + windowMs }; buckets.set(key, bucket) }
  bucket.count++
  if (bucket.count > max) {
    const res = NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((bucket.resetAt - now) / 1000)) } }
    )
    applyRateLimitSecurityHeaders(res, req)
    return res
  }
  return null
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  reset: number
  response: NextResponse | null
}

// ── Async awareness rate limit with info (used by proxy) ────────────
export async function rateLimitWithInfo(reqOrKey: NextRequest | string, limit = 60, windowMs = 60000): Promise<RateLimitResult> {
  const key = typeof reqOrKey === 'string' ? reqOrKey : getIp(reqOrKey) + ':' + (reqOrKey as NextRequest).nextUrl.pathname
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < now) { bucket = { count: 0, resetAt: now + windowMs }; buckets.set(key, bucket) }
  bucket.count++
  const remaining = Math.max(0, limit - bucket.count)
  if (bucket.count > limit) {
    const res = NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((bucket.resetAt - now) / 1000)) } }
    )
    return {
      allowed: false,
      remaining: 0,
      reset: bucket.resetAt,
      response: res,
    }
  }
  return { allowed: true, remaining, reset: bucket.resetAt, response: null }
}

// ── Async Redis-backed rate limit (production) ───────────────────────
export async function rateLimitProduction(req: NextRequest, limit = 100, windowMs = 60000): Promise<NextResponse | null> {
  const ip = getIp(req)

  // Try Redis first — wrapped so a Redis outage, revoked/stale Upstash token,
  // malformed URL (new Redis() throws synchronously), or network error can
  // NEVER take down every authenticated route (requireAuth calls this first).
  // On any failure we log and fall through to the in-memory limiter below.
  try {
    const limiter = getRedisLimiter()
    if (limiter) {
      const { success, reset } = await limiter.limit(ip)
      if (!success) {
        const retryAfter = Math.ceil((reset - Date.now()) / 1000)
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          { status: 429, headers: { 'Retry-After': String(retryAfter), 'X-RateLimit-Limit': String(limit), 'X-RateLimit-Remaining': '0' } }
        )
      }
      return null
    }
  } catch (err) {
    // Redis backend unavailable/misconfigured. Keep the API up with the
    // in-memory limiter; the cached client is stateless, so a transient
    // blip self-heals on the next request without re-construction.
    console.error('[rate-limit] Redis backend error — using in-memory fallback', err)
  }

  // Fallback: in-memory limiter (dev AND production).
  // Production historically fail-closed with a 503 when Upstash was unset,
  // which took down EVERY authenticated route (requireAuth calls this).
  // The in-memory bucket still rate-limits (per-instance), so we never brick
  // the whole API when the Redis backend is unavailable/misconfigured.
  if (process.env.NODE_ENV === 'production') {
    console.warn('Rate limiting backend unavailable in production — using in-memory fallback')
  }
  const key = `${ip}:${req.nextUrl.pathname}`
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < now) { bucket = { count: 0, resetAt: now + windowMs }; buckets.set(key, bucket) }
  bucket.count++
  if (bucket.count > limit) {
    const res = NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((bucket.resetAt - now) / 1000)) } }
    )
    applyRateLimitSecurityHeaders(res, req)
    return res
  }
  return null
}
