import { NextRequest } from 'next/server';
import { rateLimit } from '@/lib/security';
import { requireAuthWithCsrf, jsonError, readJson } from '@/lib/api-helpers';
import { revokeSessions } from '@/lib/session-revocation';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
const REASONS = ['user_initiated', 'password_change', 'logout_all', 'suspicious_activity'];

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, 10, 60000, { globalKey: true });
    if (limited) return limited;
    const { response, user } = await requireAuthWithCsrf(req);
    if (response || !user) return response!;
    const body = await readJson<{ revokeAll?: boolean; sessionJti?: string; reason?: string }>(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return jsonError('Invalid request body', 400);
    const reason = body.reason ?? 'user_initiated';
    if (!REASONS.includes(reason)) return jsonError('Invalid revocation reason', 400);
    // A caller-supplied JTI cannot be ownership-verified and local readers do
    // not filter by JTI. Do not silently turn targeted revocation into global.
    if (body.sessionJti !== undefined) return jsonError('Targeted session revocation is not supported.', 501, 'UNSUPPORTED_SESSION_SCOPE');
    if (body.revokeAll !== true) return jsonError('Provide revokeAll: true', 400);
    return await revokeSessions(req, user.id, true, reason);
  } catch (error) {
    logger.phiSafeError(error, 'auth.revoke-sessions');
    return jsonError('Internal server error', 500);
  }
}
