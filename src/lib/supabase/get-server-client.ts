/**
 * Safe Supabase server-client factory.
 *
 * The raw `createServerClient(url!, key!, ...)` pattern throws an uncaught
 * error when the Supabase env vars are missing — which surfaces as a bare HTTP
 * 500 with an empty body on every auth-backed route (signup, login, /me,
 * interactions, …). That's happened in local dev where the anon/service keys
 * aren't present in `.env.local`.
 *
 * This helper returns `null` when the required env is missing instead of
 * throwing, so handlers can return a clean, actionable error (503) rather than
 * a silent 500. Routes that legitimately need Supabase can short-circuit on
 * `null`. Production is unaffected (env is always set there) — this only turns
 * a hard crash into a graceful, diagnosable failure.
 */
import { createServerClient } from '@supabase/ssr';
import { type CookieMethodsServer } from '@supabase/ssr';

export function getSupabaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || null;
}

export function getSupabaseServerKey(): string | null {
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || null;
  if (serviceKey) return serviceKey;
  if (process.env.NODE_ENV === 'production') return null;
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    null
  );
}

/** True when the Supabase env needed for a server client is present. */
export function isSupabaseConfigured(): boolean {
  return !!(getSupabaseUrl() && getSupabaseServerKey());
}

/**
 * Create a Supabase server client for a route handler, or `null` when the
 * Supabase env vars are absent (so the caller can return a clean 503 instead
 * of crashing with an uncaught 500).
 */
export function createSafeServerClient(cookieStore: CookieMethodsServer) {
  const url = getSupabaseUrl();
  const key = getSupabaseServerKey();
  if (!url || !key) return null;
  return createServerClient(url, key, { cookies: cookieStore });
}
