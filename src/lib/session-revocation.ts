import { randomUUID } from 'crypto';
import { createServerClient } from '@supabase/ssr';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api-helpers';
import { logAudit } from '@/lib/auth';
import { logger } from '@/lib/logger';

/** Local sessions have no per-session ID: existing readers revoke by userId. */
export async function revokeSessions(req: NextRequest, userId: string, all: boolean, reason: string) {
  let localRevoked = false;
  if (all) {
    // Persist before contacting the provider; a provider outage must not leave
    // the signed local fallback usable. Seven days matches its maximum lifetime.
    await db.revokedSession.create({ data: {
      userId, sessionJti: randomUUID(), reason,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    } });
    localRevoked = true;
  } else if (req.cookies.get('kynthai-session')?.value) {
    return jsonError('Local sessions do not support revoking other sessions while preserving the current one.', 501, 'UNSUPPORTED_SESSION_SCOPE');
  }

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => req.cookies.getAll(), setAll() {} } },
    );
    // getSession supplies the access JWT, NOT proof of identity. Independently
    // validate that JWT and bind it to the user authenticated by the shared guard.
    const { data, error } = await supabase.auth.getSession();
    const jwt = data.session?.access_token;
    if (error || !jwt) throw new Error('Provider access session unavailable');
    const validated = await supabase.auth.getUser(jwt);
    if (validated.error || validated.data.user?.id !== userId) throw new Error('Provider session identity mismatch');
    const result = await supabase.auth.admin.signOut(jwt, all ? 'global' : 'others');
    if (result.error) throw result.error;
  } catch (error) {
    logger.phiSafeError(error, 'auth.sessions.provider-revoke');
    return jsonError('Provider session revocation failed. Local revocation may already have been applied.', 502,
      { code: 'PROVIDER_REVOCATION_FAILED', localRevoked, providerRevoked: false });
  }
  await logAudit(userId, all ? 'auth.sessions.revoke_all' : 'auth.sessions.revoke_others', `reason=${reason}`);
  return jsonOk({ revokedAll: all, localRevoked, providerRevoked: true,
    message: 'Provider refresh sessions revoked. Existing access tokens remain valid until expiry.' });
}
