/**
 * src/lib/captcha.ts — HARDENED
 *
 * Fix: CAPTCHA verification is now REQUIRED in production.
 * If Turnstile keys are not configured, verification fails closed
 * (blocks login/registration) rather than skipping verification.
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileVerifyResult {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

export async function verifyTurnstileToken(
  token: string,
  ip?: string
): Promise<{ valid: boolean; error?: string }> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // FAIL CLOSED: if no secret key configured in production, block verification
  if (!secretKey) {
    if (process.env.NODE_ENV === 'production') {
      return {
        valid: false,
        error: 'CAPTCHA not configured on server. Please contact support.',
      };
    }
    // Dev mode: skip verification
    return { valid: true };
  }

  if (!token) {
    return { valid: false, error: 'CAPTCHA token is required.' };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (ip) {
      formData.append('remoteip', ip);
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const result: TurnstileVerifyResult = await response.json();

    if (result.success) {
      return { valid: true };
    }

    const errorCodes = result['error-codes'] || [];
    return {
      valid: false,
      error: errorCodes.includes('timeout-or-duplicate')
        ? 'CAPTCHA expired. Please try again.'
        : 'CAPTCHA verification failed. Please try again.',
    };
  } catch (error) {
    // Network error — fail closed (block the request)
    return {
      valid: false,
      error: 'CAPTCHA verification unavailable. Please try again.',
    };
  }
}

export function isCaptchaConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY &&
    process.env.TURNSTILE_SECRET_KEY
  );
}

/**
 * Returns true if CAPTCHA is required for this request.
 * In production, CAPTCHA is always required.
 */
export function isCaptchaRequired(): boolean {
  return process.env.NODE_ENV === 'production';
}
