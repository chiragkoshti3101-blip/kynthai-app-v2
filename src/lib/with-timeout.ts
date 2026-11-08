/**
 * Bounded provider calls.
 *
 * Auth-critical Supabase calls (getUser / signInWithPassword / signUp) must
 * never stall the request pipeline: a slow or unreachable provider would
 * otherwise hang EVERY auth-dependent request (login, /api/auth/me,
 * requireAuth-guarded API routes) for the duration of the underlying
 * network attempt (minutes, when the host is black-holed).
 *
 * `withTimeout` races the call against a deadline and rejects with a
 * `ProviderTimeoutError`; callers catch it and fast-fail into their local
 * fallback (HMAC-signed kynthai-session cookie, bcrypt credential check)
 * instead of hanging.
 */
export class ProviderTimeoutError extends Error {
  constructor(
    public readonly label: string,
    public readonly ms: number,
  ) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'ProviderTimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new ProviderTimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, guard]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * Shared deadline for auth-critical Supabase calls. Long enough for a healthy
 * provider (typical <200ms), short enough that a black-holed host can't stall
 * the whole auth pipeline.
 */
export const SUPABASE_AUTH_TIMEOUT_MS = 8000;
