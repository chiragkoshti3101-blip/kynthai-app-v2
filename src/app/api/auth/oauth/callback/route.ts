/**
 * GET /api/auth/oauth/callback
 *
 * OAuth callback endpoint — handles the redirect from Google/Apple after
 * the user authorizes. Exchanges the auth code for a Supabase session,
 * syncs the user profile, and redirects to the appropriate portal.
 *
 * Query params:
 *   - code: authorization code from provider
 *   - next: optional redirect path after auth (e.g., /patient, /doctor)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { logAudit } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { signSessionToken } from '@/lib/session-signing';
import { setPortalRoleCookie } from '@/lib/portal-role-cookie';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams, origin } = req.nextUrl;
    const code = searchParams.get('code');
    const next = searchParams.get('next') || '/patient';

    if (!code) {
      return NextResponse.redirect(`${origin}/auth?error=no_code`);
    }

    // Cookie store for the exchange response
    let responseCookies: { name: string; value: string; options?: Record<string, unknown> }[] = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return req.cookies.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              responseCookies.push({ name, value, options });
            });
          },
        },
      }
    );

    // Exchange the auth code for a session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      logger.phiSafeError(error, 'auth.oauth.callback.exchange');
      return NextResponse.redirect(`${origin}/auth?error=exchange_failed`);
    }

    const user = data.user;

    // Sync the user profile to Prisma
    try {
      const { syncSupabaseUser } = await import('@/lib/supabase/sync');
      const profile = await syncSupabaseUser(user);

      // Determine the correct portal redirect based on role
      const role = profile?.role || 'patient';
      const portalMap: Record<string, string> = {
        patient: '/patient',
        doctor: '/doctor',
        lab: '/lab',
        caretaker: '/caretaker',
        admin: '/admin',
      };
      const portalPath = portalMap[role] || '/patient';

      await logAudit(user.id, 'auth.oauth.login', `OAuth via provider=${user.app_metadata?.provider || 'unknown'}`);

      // Build the redirect response with Supabase session cookies
      const res = NextResponse.redirect(`${origin}${portalPath}`);

      // Apply cookies from the session exchange
      for (const { name, value, options } of responseCookies) {
        res.cookies.set(name, value, options as any);
      }

      // Also set the HMAC-signed kynthai-session cookie (same rationale as
      // /auth/callback): the edge middleware only trusts verified cookies.
      const signedValue = await signSessionToken(profile?.id ?? user.id);
      if (signedValue) {
        const secure =
          req.headers.get('x-forwarded-proto') === 'https' ||
          req.headers.get('x-forwarded-ssl') === 'on';
        res.cookies.set('kynthai-session', signedValue, {
          httpOnly: true,
          secure,
          sameSite: 'strict',
          maxAge: 60 * 60 * 24 * 7,
          path: '/',
        });
        if (profile?.role) {
          setPortalRoleCookie(res, profile.role, secure);
        }
      }

      return res;
    } catch (syncError) {
      logger.phiSafeError(syncError, 'auth.oauth.callback.sync');
      // Even if sync fails, user can still be redirected
      await logAudit(user.id, 'auth.oauth.login', 'OAuth login (profile sync deferred)');
      const res = NextResponse.redirect(`${origin}${next}`);
      for (const { name, value, options } of responseCookies) {
        res.cookies.set(name, value, options as any);
      }
      return res;
    }
  } catch (error) {
    logger.phiSafeError(error, 'auth.oauth.callback');
    return NextResponse.redirect(`${req.nextUrl.origin}/auth?error=internal`);
  }
}
