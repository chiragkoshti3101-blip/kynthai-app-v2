import { joinAuthorization, joinDenialResponse } from '@/lib/video-authorization';
import { NextRequest } from 'next/server';
import { sanitizeText, rateLimit } from '@/lib/security';
import { logAudit } from '@/lib/auth';
import { requireAuthWithCsrf, jsonError, jsonOk, readJson, audit } from '@/lib/api-helpers';
import crypto from 'crypto';
export const dynamic = 'force-dynamic';

// SECURITY: Never allow video tokens with a missing/empty secret.
// The check is lazy (inside the handler) so Next.js builds can pass
// without the env var; at runtime every request validates it.
function getVideoTokenSecret(): string | null {
  const secret = process.env.VIDEO_TOKEN_SECRET;
  if (!secret) return null;
  return secret;
}

// POST /api/video-call/token — generate a room name + mock token.
// In production this would integrate with LiveKit/TokenServer/Agora etc.
export async function POST(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return limited;

  const { response, user } = await requireAuthWithCsrf(req);
  if (response || !user) return response!;
  const u = user!;

  // SECURITY: enforce secret at request time (not module load, so builds pass).
  const secret = getVideoTokenSecret();
  if (!secret) return jsonError('Server misconfiguration: video token secret not set', 500);

  const body = await readJson<{ appointmentId?: string; roomName?: string }>(req);
  if (!body) return jsonError('Invalid JSON', 400);

  if (!body.appointmentId || typeof body.appointmentId !== 'string') return jsonError('appointmentId is required', 400);
  const join = await joinAuthorization(u, body.appointmentId);
  const denied = joinDenialResponse(join);
  if (denied) {
    if (join.reason === 'identity_required') {
      await logAudit(u.id, 'video-call.identity_required', {
        resourceType: 'VideoCall',
        metadata: { appointmentId: body.appointmentId, level: join.currentLevel },
      });
    }
    return jsonError(denied.message, denied.status, denied.code, denied.details);
  }
  const roomName = `kynthai-${body.appointmentId}`;
  const expiresAt = Date.now() + 60 * 60 * 1000;
  const payload = JSON.stringify({ uid: u.id, name: u.name, room: roomName, exp: expiresAt });
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const token = `${Buffer.from(payload).toString('base64url')}.${signature}`;

  await logAudit(u.id, 'video-call.token', `room=${roomName}`);
  return jsonOk({
    roomName,
    token,
    expiresAt: new Date(expiresAt).toISOString(),
    identity: u.id,
    name: u.name,
  });
}
