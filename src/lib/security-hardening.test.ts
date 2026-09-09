import { describe, expect, it, beforeAll } from 'vitest';
import {
  hashSmsCode,
  verifySmsCode,
  generateSmsCode,
  SMS_CODE_TTL_MS,
  SMS_MAX_ATTEMPTS,
  isValidSmsCode,
} from './patient-verify';
import {
  tierFromClaim,
  amountMatchesTier,
  legacyAmountMatchesTier,
  PRICING,
  LEGACY_PRICING,
} from './currency';

beforeAll(() => {
  // hashSmsCode requires an HMAC key; provide a stable one for tests.
  process.env.SMS_CODE_HMAC_KEY = 'test-hmac-key-for-vitest-only';
});

describe('SMS verification code hardening', () => {
  it('generates 6-digit numeric codes', () => {
    for (let i = 0; i < 25; i++) {
      const code = generateSmsCode();
      expect(code).toMatch(/^\d{6}$/);
      expect(isValidSmsCode(code)).toBe(true);
    }
  });

  it('rejects malformed codes before any hashing work', () => {
    expect(isValidSmsCode('12345')).toBe(false);
    expect(isValidSmsCode('1234567')).toBe(false);
    expect(isValidSmsCode('12a456')).toBe(false);
    expect(isValidSmsCode('')).toBe(false);
  });

  it('never stores the plaintext code', () => {
    const code = '123456';
    const hash = hashSmsCode(code);
    expect(hash).not.toContain(code);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('verifies a correct code and rejects a wrong one', () => {
    const code = generateSmsCode();
    const hash = hashSmsCode(code);
    expect(verifySmsCode(code, hash)).toBe(true);
    expect(verifySmsCode('000000', hash)).toBe(false);
  });

  it('produces a stable hash for the same code', () => {
    const code = '654321';
    expect(hashSmsCode(code)).toBe(hashSmsCode(code));
  });

  it('exposes sane TTL and attempt limits', () => {
    expect(SMS_CODE_TTL_MS).toBeGreaterThan(0);
    expect(SMS_MAX_ATTEMPTS).toBeGreaterThan(0);
    expect(SMS_MAX_ATTEMPTS).toBeLessThanOrEqual(10);
  });
});

describe('Stripe tier claim mapping', () => {
  it('maps client and webhook claims to canonical keys', () => {
    expect(tierFromClaim('plus')).toBe('plus');
    expect(tierFromClaim('family')).toBe('family_pro');
    expect(tierFromClaim('family_pro')).toBe('family_pro');
  });

  it('rejects unknown claims', () => {
    expect(tierFromClaim('enterprise')).toBeNull();
    expect(tierFromClaim('free')).toBeNull();
    expect(tierFromClaim(undefined)).toBeNull();
    expect(tierFromClaim(null)).toBeNull();
    expect(tierFromClaim('')).toBeNull();
  });
});

describe('Stripe amount-to-tier verification', () => {
  it('accepts the published monthly and yearly prices', () => {
    const usdPlus = PRICING.USD.plus;
    expect(amountMatchesTier(usdPlus.monthly, 'usd', 'plus')).toBe(true);
    expect(amountMatchesTier(usdPlus.yearly, 'usd', 'plus')).toBe(true);

    const usdFamily = PRICING.USD.family_pro;
    expect(amountMatchesTier(usdFamily.monthly, 'usd', 'family_pro')).toBe(true);
    expect(amountMatchesTier(usdFamily.yearly, 'usd', 'family_pro')).toBe(true);
  });

  it('rejects a cheaper tier paid for a pricier claim (the upgrade-underpay attack)', () => {
    const plusMonthly = PRICING.USD.plus.monthly; // 19.99
    // Attacker pays the Plus price but claims Family → must NOT verify
    expect(amountMatchesTier(plusMonthly, 'usd', 'family_pro')).toBe(false);
  });

  it('rejects unknown currencies and off-by amounts', () => {
    expect(amountMatchesTier(19.99, 'xxx', 'family_pro')).toBe(false);
    // 19.98 is within the 0.01 float tolerance; 19.97 (2¢ off) must not pass
    expect(amountMatchesTier(19.97, 'usd', 'family_pro')).toBe(false);
    expect(amountMatchesTier(0, 'usd', 'plus')).toBe(false);
  });

  it('honours grandfathered amounts only via the explicit legacy check', () => {
    // Founding members keep their original rate, so a legacy renewal must
    // verify through legacyAmountMatchesTier.
    expect(legacyAmountMatchesTier(LEGACY_PRICING.USD.plus.monthly, 'usd', 'plus')).toBe(true);
    expect(legacyAmountMatchesTier(LEGACY_PRICING.USD.plus.yearly, 'usd', 'plus')).toBe(true);
    expect(
      legacyAmountMatchesTier(LEGACY_PRICING.USD.family_pro.monthly, 'usd', 'family_pro')
    ).toBe(true);

    // Legacy amounts must NOT satisfy the standard check, otherwise the new
    // Individual price ($19.99 == legacy Family price) would grant Family.
    expect(amountMatchesTier(LEGACY_PRICING.USD.plus.monthly, 'usd', 'plus')).toBe(false);

    // Cross-tier underpay stays rejected on the legacy path too.
    expect(
      legacyAmountMatchesTier(LEGACY_PRICING.USD.plus.monthly, 'usd', 'family_pro')
    ).toBe(false);
  });

  it('supports non-USD currencies defined in PRICING', () => {
    expect(amountMatchesTier(PRICING.EUR.plus.monthly, 'EUR', 'plus')).toBe(true);
    expect(amountMatchesTier(PRICING.GBP.family_pro.yearly, 'gbp', 'family_pro')).toBe(true);
  });
});
