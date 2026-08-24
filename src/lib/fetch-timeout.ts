'use client';

/**
 * installFetchTimeout — patches global fetch with a timeout + credentials.
 * Auth routes get a longer budget (mobile + CAPTCHA + cold start).
 */
const DEFAULT_TIMEOUT = 15_000;
const AUTH_TIMEOUT = 45_000;

function resolveTimeoutMs(input: RequestInfo | URL, fallback: number): number {
  try {
    const raw =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const url = new URL(raw, typeof window !== 'undefined' ? window.location.origin : 'https://kynthai.app');
    if (url.pathname.startsWith('/api/auth/')) return AUTH_TIMEOUT;
    if (url.pathname.startsWith('/api/reminders')) return 20_000;
    return fallback;
  } catch {
    return fallback;
  }
}

export function installFetchTimeout(timeoutMs: number = DEFAULT_TIMEOUT) {
  if (typeof window === 'undefined') return;
  if ((window as unknown as { __fetchPatched?: boolean }).__fetchPatched) return;
  (window as unknown as { __fetchPatched?: boolean }).__fetchPatched = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    // Respect caller-provided signals (streaming, intentional cancel)
    if (init?.signal) {
      return originalFetch(input, {
        ...init,
        credentials: init.credentials ?? 'include',
      });
    }

    const budget = resolveTimeoutMs(input, timeoutMs);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try {
        controller.abort(new DOMException('Request timed out. Check your connection and try again.', 'TimeoutError'));
      } catch {
        controller.abort();
      }
    }, budget);

    return originalFetch(input, {
      ...init,
      signal: controller.signal,
      credentials: init?.credentials ?? 'include',
    }).finally(() => clearTimeout(timeoutId));
  };
}
