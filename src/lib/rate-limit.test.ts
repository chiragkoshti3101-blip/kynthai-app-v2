import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock Upstash so rateLimitProduction's Redis path is exercised without a real
// backend. The factory pushes constructed instances so tests can configure the
// mocked `limit()` result. `slidingWindow` is stubbed so `new Ratelimit(...)`
// works inside getRedisLimiter().
vi.mock('@upstash/ratelimit', () => {
  class MockRatelimit {
    static slidingWindow = vi.fn((count: number, unit: string) => ({ count, unit }));
    static instances: MockRatelimitInstance[] = [];
    limit: ReturnType<typeof vi.fn>;
    opts: Record<string, unknown>;
    constructor(opts: Record<string, unknown>) {
      this.opts = opts;
      // Default allow, so the very first rateLimitProduction call (which
      // constructs the cached limiter) doesn't trip on an unmocked limit().
      this.limit = vi.fn().mockResolvedValue({ success: true, reset: 0 });
      MockRatelimit.instances.push(this);
    }
  }
  return { Ratelimit: MockRatelimit };
});

vi.mock('@upstash/redis', () => {
  class MockRedis {
    constructor(_opts: unknown) {}
  }
  return { Redis: MockRedis };
});

import {
  getIp,
  rateLimit,
  rateLimitWithInfo,
  rateLimitProduction,
} from './rate-limit';
import { Ratelimit } from '@upstash/ratelimit';

interface MockRatelimitInstance {
  opts: Record<string, unknown>;
  limit: ReturnType<typeof vi.fn>;
}

const MOCK_RATELIMIT = Ratelimit as unknown as {
  slidingWindow: ReturnType<typeof vi.fn>;
  instances: MockRatelimitInstance[];
};

function req(path = '/api/chat', ip = '1.2.3.4', origin?: string): NextRequest {
  const headers: Record<string, string> = { 'x-forwarded-for': ip };
  if (origin) headers.origin = origin;
  return new NextRequest(`https://kynthai.test${path}`, { headers });
}

beforeEach(() => {
  // Ensure CI env var is unset so the rate limiter works normally in unit tests.
  delete process.env.CI;
  // Fresh bucket state per test (buckets live on globalThis for HMR safety).
  (globalThis as unknown as { __rateBuckets?: Map<string, unknown> }).__rateBuckets?.clear();
  // NOTE: do NOT clear MOCK_RATELIMIT.instances here — getRedisLimiter() caches
  // a single limiter for the module lifetime, so the Redis describe captures
  // the instance once in beforeAll and reuses it across its tests.
});

describe('getIp', () => {
  it('takes the first X-Forwarded-For value', () => {
    const r = new NextRequest('https://kynthai.test/x', {
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
    });
    expect(getIp(r)).toBe('10.0.0.1');
  });

  it('falls back to X-Real-IP, then unknown', () => {
    const viaRealIp = new NextRequest('https://kynthai.test/x', {
      headers: { 'x-real-ip': '10.0.0.9' },
    });
    expect(getIp(viaRealIp)).toBe('10.0.0.9');
    expect(getIp(new NextRequest('https://kynthai.test/x'))).toBe('unknown');
  });
});

describe('rateLimit (sync, in-memory)', () => {
  it('returns null while under the limit', () => {
    const r = req('/api/chat', '1.1.1.1');
    expect(rateLimit(r, 2, 60000)).toBeNull();
    expect(rateLimit(r, 2, 60000)).toBeNull();
  });

  it('returns 429 with Retry-After once the limit is exceeded', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    try {
      const r = req('/api/chat', '1.1.1.1');
      expect(rateLimit(r, 1, 60000)).toBeNull();
      const blocked = rateLimit(r, 1, 60000)!;
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get('Retry-After')).toBe('60');
      const body = await blocked.json();
      expect(body.error).toBe('Too many requests');
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies security + CORS headers on 429 (with Origin present)', () => {
    const r = req('/api/chat', '1.1.1.1', 'https://app.kynthai.test');
    rateLimit(r, 1, 60000);
    const blocked = rateLimit(r, 1, 60000)!;
    expect(blocked.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(blocked.headers.get('X-Frame-Options')).toBe('DENY');
    expect(blocked.headers.get('Cache-Control')).toContain('no-store');
    expect(blocked.headers.get('Access-Control-Allow-Origin')).toBe('https://app.kynthai.test');
    expect(blocked.headers.get('Vary')).toBe('Origin');
  });

  it('buckets by IP per pathname', () => {
    expect(rateLimit(req('/api/chat', '1.1.1.1'), 1, 60000)).toBeNull();
    expect(rateLimit(req('/api/chat', '2.2.2.2'), 1, 60000)).toBeNull();
    expect(rateLimit(req('/api/meds', '1.1.1.1'), 1, 60000)).toBeNull();
    expect(rateLimit(req('/api/chat', '1.1.1.1'), 1, 60000)?.status).toBe(429);
    expect(rateLimit(req('/api/meds', '1.1.1.1'), 1, 60000)?.status).toBe(429);
  });

  it('globalKey makes the bucket IP-wide across paths', () => {
    const opts = { globalKey: true };
    expect(rateLimit(req('/api/chat', '1.1.1.1'), 1, 60000, opts)).toBeNull();
    expect(rateLimit(req('/api/meds', '1.1.1.1'), 1, 60000, opts)?.status).toBe(429);
  });

  it('resets the window after windowMs elapses', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    try {
      const r = req('/api/chat', '1.1.1.1');
      expect(rateLimit(r, 1, 60000)).toBeNull();
      expect(rateLimit(r, 1, 60000)?.status).toBe(429);
      vi.advanceTimersByTime(60_001);
      expect(rateLimit(r, 1, 60000)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('rateLimitWithInfo (async, in-memory)', () => {
  it('reports allowed with a decrementing remaining count', async () => {
    const r = req('/api/proxy', '1.1.1.1');
    const first = await rateLimitWithInfo(r, 3, 60000);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);
    expect(first.response).toBeNull();
    expect(first.reset).toBeGreaterThan(0);

    const second = await rateLimitWithInfo(r, 3, 60000);
    expect(second.remaining).toBe(1);
  });

  it('blocks with remaining 0 and a 429 response once exceeded', async () => {
    const r = req('/api/proxy', '1.1.1.1');
    await rateLimitWithInfo(r, 2, 60000);
    await rateLimitWithInfo(r, 2, 60000);
    const blocked = await rateLimitWithInfo(r, 2, 60000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.response?.status).toBe(429);
    expect(blocked.response?.headers.get('Retry-After')).toBe('60');
  });

  it('accepts raw string keys', async () => {
    const first = await rateLimitWithInfo('device:abc-123', 1, 60000);
    expect(first.allowed).toBe(true);
    const second = await rateLimitWithInfo('device:abc-123', 1, 60000);
    expect(second.allowed).toBe(false);
    // A different string key has its own bucket.
    const other = await rateLimitWithInfo('device:xyz-999', 1, 60000);
    expect(other.allowed).toBe(true);
  });
});

describe('rateLimitProduction (in-memory fallback)', () => {
  beforeAll(() => {
    // Ensure the Redis backend is unconfigured so we hit the fallback.
    // MUST run before the Redis-path describe (see note below).
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('allows requests under the limit (no Upstash configured)', async () => {
    expect(await rateLimitProduction(req('/api/auth/me', '1.1.1.1'), 2, 60000)).toBeNull();
  });

  it('enforces 429 with security headers in the fallback path', async () => {
    const r = req('/api/auth/me', '1.1.1.1', 'https://app.kynthai.test');
    expect(await rateLimitProduction(r, 1, 60000)).toBeNull();
    const blocked = await rateLimitProduction(r, 1, 60000);
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get('Retry-After')).toBe('60');
    expect(blocked?.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('warns when the in-memory fallback is used in production', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      vi.stubEnv('NODE_ENV', 'production');
      await rateLimitProduction(req('/api/auth/me', '1.1.1.1'), 5, 60000);
      expect(warn).toHaveBeenCalledWith(
        'Rate limiting backend unavailable in production — using in-memory fallback'
      );
    } finally {
      warn.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});

// NOTE on ordering: getRedisLimiter() caches the limiter at module level once
// UPSTASH_* env vars are set, and the mocked limiter is constructed exactly
// once. This describe block MUST run after the in-memory fallback describe.
describe('rateLimitProduction (Redis path)', () => {
  let redisInstance: MockRatelimitInstance;

  beforeAll(async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'kynthai-test-token-0123456789abcdef');
    // First call constructs (and caches) the mocked limiter.
    await rateLimitProduction(req('/api/auth/me', '9.9.9.9'));
    redisInstance = MOCK_RATELIMIT.instances[0]!;
    expect(redisInstance).toBeDefined();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('constructs the limiter with the kynthai prefix', () => {
    expect(redisInstance.opts.prefix).toBe('kynthai:ratelimit:100:60000');
    expect(MOCK_RATELIMIT.slidingWindow).toHaveBeenCalledWith(100, '60 s');
  });

  it('honors distinct route policies and window durations', async () => {
    await rateLimitProduction(req('/api/auth/login', '8.8.8.8'), 7, 120000);
    expect(MOCK_RATELIMIT.slidingWindow).toHaveBeenCalledWith(7, '120 s');
    expect(MOCK_RATELIMIT.instances.some(i => i.opts.prefix === 'kynthai:ratelimit:7:120000')).toBe(true);
  });

  it('returns null when the Redis limiter allows', async () => {
    redisInstance.limit.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });
    const r = req('/api/auth/me', '5.5.5.5');
    expect(await rateLimitProduction(r)).toBeNull();
    expect(redisInstance.limit).toHaveBeenCalledWith('5.5.5.5:/api/auth/me');
  });

  it('returns 429 with rate-limit headers when the Redis limiter blocks', async () => {
    redisInstance.limit.mockResolvedValue({ success: false, reset: Date.now() + 60_000 });
    const blocked = await rateLimitProduction(req('/api/auth/me', '6.6.6.6'));
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(blocked?.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(blocked?.headers.get('Retry-After')).toBe('60');
  });

  it('falls back to in-memory limiting (never 500s) when the Redis call throws', async () => {
    // Stale/revoked Upstash credentials make limit() reject. An unhandled
    // throw here took down EVERY requireAuth route in production
    // (chat, medications, search-medicine) with an empty-body 500.
    await rateLimitProduction(req('/api/auth/me', '7.7.7.7'), 1, 60000);
    const policyInstance = MOCK_RATELIMIT.instances.find(i => i.opts.prefix === 'kynthai:ratelimit:1:60000')!;
    policyInstance.limit.mockRejectedValue(new Error('Upstash auth failed'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const r = req('/api/auth/me', '7.7.7.7');
      // 1st request: Redis throws → in-memory fallback allows (under limit).
      expect(await rateLimitProduction(r, 1, 60000)).toBeNull();
      // 2nd request: same in-memory bucket now over limit → 429, not a 500.
      const blocked = await rateLimitProduction(r, 1, 60000);
      expect(blocked?.status).toBe(429);
      expect(blocked?.headers.get('Retry-After')).toBe('60');
    } finally {
      errSpy.mockRestore();
      // Restore allow behaviour for any subsequent tests in this describe.
      redisInstance.limit.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });
    }
  });
});
