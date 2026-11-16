import { afterEach, describe, expect, it, vi } from 'vitest';
import { signSessionToken, verifySessionToken, sessionIssuedAt } from '../session-signing';
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe('local session validity and revocation cutoff', () => {
  it('authenticates signed tokens and derives issuance for old-session-only revocation', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
    vi.stubEnv('SESSION_SIGNING_SECRET', 'unit-test-only-secret');
    const old = (await signSessionToken('owner'))!;
    expect(await verifySessionToken(old)).toBe('owner');
    const revokedAt = new Date();
    expect(sessionIssuedAt(old).getTime()).toBeLessThanOrEqual(revokedAt.getTime());
    vi.advanceTimersByTime(1000);
    const fresh = (await signSessionToken('owner'))!;
    expect(sessionIssuedAt(fresh).getTime()).toBeGreaterThan(revokedAt.getTime());
    expect(await verifySessionToken(fresh)).toBe('owner');
    expect(await verifySessionToken(old.replace(/.$/, 'z'))).toBeNull();
    expect(await verifySessionToken(old.replace('owner:', 'victim:'))).toBeNull();
    vi.advanceTimersByTime(7 * 86400000);
    expect(await verifySessionToken(old)).toBeNull();
  });
});
