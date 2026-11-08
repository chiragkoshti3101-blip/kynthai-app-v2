import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Regression tests for the requireAdmin demo/known-credential block
 * (security/audit-fixes, PR #51).
 *
 * Threat model: admin@demo.kynthai.app is seeded with a KNOWN password
 * (Demo@2024) and CAPTCHA is skipped for @demo. accounts. An attacker who
 * learns that credential must NOT reach admin WRITE endpoints on a real
 * production deployment. The security decision lives entirely in the pure
 * predicate `isDemoAdminBlockedInProduction` (keyed on VERCEL_ENV, not
 * NODE_ENV, so the E2E `next start` harness keeps working), which is what
 * these tests lock down deterministically.
 */

import { isDemoAdminBlockedInProduction } from '../api-helpers';

describe('isDemoAdminBlockedInProduction', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'production');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('blocks the seeded demo admin email on a real production deployment', () => {
    expect(
      isDemoAdminBlockedInProduction({ email: 'admin@demo.kynthai.app', isDemo: true })
    ).toBe(true);
  });

  it('blocks ANY flagged demo account, even with role=admin', () => {
    expect(isDemoAdminBlockedInProduction({ email: 'qa-admin@kynthai.app', isDemo: true })).toBe(
      true
    );
  });

  it('lets a real (non-demo) admin through on production', () => {
    expect(isDemoAdminBlockedInProduction({ email: 'real@kynthai.app', isDemo: false })).toBe(
      false
    );
  });

  it('does NOT block on the E2E next-start harness (no VERCEL_ENV)', () => {
    vi.stubEnv('VERCEL_ENV', undefined as unknown as string);
    expect(
      isDemoAdminBlockedInProduction({ email: 'admin@demo.kynthai.app', isDemo: true })
    ).toBe(false);
  });
});
