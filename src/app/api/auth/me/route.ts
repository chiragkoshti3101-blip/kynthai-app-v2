import { NextRequest } from 'next/server';
import { logAudit } from '@/lib/auth';
import { applyStandardHeaders, jsonOk, jsonError } from '@/lib/api-helpers';
import { getSupabaseProfile } from '@/lib/supabase/sync';
import { verifySessionToken } from '@/lib/session-signing';
import { createSafeServerClient } from '@/lib/supabase/get-server-client';
import { db } from '@/lib/db';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // ── 1. Try Supabase auth first ──────────────────────────────────────────
  const supabase = createSafeServerClient({
    getAll: () => req.cookies.getAll(),
    setAll: () => {},
  });
  // Missing Supabase env (e.g. local dev without keys) is NOT fatal: fall
  // straight through to the local HMAC session path below instead of throwing
  // an uncaught 500.
  const supabaseUser = supabase
    ? (await supabase.auth.getUser()).data.user
    : null;

  if (supabaseUser) {
    const profile = await getSupabaseProfile(supabaseUser);
    if (!profile) {
      return applyStandardHeaders(jsonOk({ authenticated: false, user: null }));
    }

    await logAudit(profile.id, 'auth.me');

    return applyStandardHeaders(
      jsonOk({
        authenticated: true,
        user: {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          role: profile.role,
          phone: profile.phone,
          // `profile` here is already an AuthUser (see getSupabaseProfile),
          // whose dateOfBirth is an ISO string — not the raw Prisma row.
          dateOfBirth: profile.dateOfBirth ?? null,
          subscriptionTier: profile.subscriptionTier,
          emailVerified: !!supabaseUser.email_confirmed_at,
          consentAccepted: profile.consentAccepted,
          dataProcessingConsent: profile.dataProcessingConsent,
          aiTrainingConsent: profile.aiTrainingConsent,
          isDemo: profile.isDemo,
        },
      })
    );
  }

  // ── 2. Fallback: local HMAC session cookie ──────────────────────────────
  const localSessionCookie = req.cookies.get('kynthai-session');
  if (localSessionCookie?.value) {
    const userId = await verifySessionToken(localSessionCookie.value);
    if (userId) {
      // Look up user from Prisma
      const user = await db.user.findUnique({ where: { id: userId } });
      if (user) {
        await logAudit(user.id, 'auth.me');

        return applyStandardHeaders(
          jsonOk({
            authenticated: true,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              phone: user.phone,
              dateOfBirth: user.dateOfBirth?.toISOString() ?? null,
              subscriptionTier: user.subscriptionTier,
              emailVerified: !!user.emailVerified,
              consentAccepted: user.consentAccepted,
              dataProcessingConsent: user.dataProcessingConsent,
              aiTrainingConsent: user.aiTrainingConsent,
              isDemo: user.isDemo,
            },
          })
        );
      }
    }
  }

  // ── 3. Not authenticated ─────────────────────────────────────────────────
  return applyStandardHeaders(jsonOk({ authenticated: false, user: null }));
}
