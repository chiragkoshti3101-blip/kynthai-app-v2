import { expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { rateLimit } from '../rate-limit'
it('enforces request throttling even when CI is set', () => { vi.stubEnv('CI', 'true'); const req = new NextRequest(`http://localhost/api/test-${crypto.randomUUID()}`); expect(rateLimit(req, 1)).toBeNull(); const blocked = rateLimit(req, 1); expect(blocked?.status).toBe(429); expect(Number(blocked?.headers.get('Retry-After'))).toBeGreaterThan(0); vi.unstubAllEnvs() })
