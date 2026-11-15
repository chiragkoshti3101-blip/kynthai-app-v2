import { NextRequest } from 'next/server';
import { logAudit } from '@/lib/auth';
import { applyStandardHeaders, jsonOk, jsonError } from '@/lib/api-helpers';
import { verifySessionToken } from '@/lib/session-signing';
import { getSupabaseProfile } from '@/lib/supabase/sync';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // ── 1. Try local HMAC session cookie ──────────────────────────────────
  const localSessionCookie = req.cookies.get('kynthai-session');
  if (localSessionCookie?.value) {
    const userId = await verifySessionToken(localSessionCookie.value);
    if (userId) {
      // Look up user from Supabase REST API
      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
      const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userId}&select=*`, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        })
        const users = await res.json()
        if (users && users.length > 0) {
          const user = users[0]
          return applyStandardHeaders(
            jsonOk({
              authenticated: true,
              user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                phone: user.phone,
                dateOfBirth: user.dateOfBirth?.toISOString?.() ?? user.dateOfBirth ?? null,
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
      } catch (e) {
        console.error('Auth me lookup failed:', e)
      }
    }
  }

  // ── 2. Not authenticated ─────────────────────────────────────────────────
  return applyStandardHeaders(jsonOk({ authenticated: false, user: null }));
}
