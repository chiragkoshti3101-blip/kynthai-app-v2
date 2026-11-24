import { NextRequest } from 'next/server';
import { logAudit } from '@/lib/auth';
import { rateLimit } from '@/lib/security';
import { jsonError, jsonOk, requireAuth } from '@/lib/api-helpers';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// ── Presence bounds ──────────────────────────────────────────────────────────
const ONLINE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
const AWAY_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

// ── Derive display status from last_active timestamp ─────────────────────────
function derivePresenceStatus(lastActiveAt: Date | null): 'online' | 'away' | 'offline' {
  if (!lastActiveAt) return 'offline';
  const age = Date.now() - lastActiveAt.getTime();
  if (age <= ONLINE_THRESHOLD_MS) return 'online';
  if (age <= AWAY_THRESHOLD_MS) return 'away';
  return 'offline';
}

// ── POST /api/doctors/heartbeat ──────────────────────────────────────────────
// Authenticated doctor calls this endpoint to touch their lastActiveAt.
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 60, 300_000); // max 60 heartbeats per 5 min
  if (limited) return limited;

  const { response, user: session } = await requireAuth(req);
  if (response || !session) return response!;
  if (session.role !== 'doctor') return jsonError('Doctors only', 403);

  // Find the doctor profile for this user.
  const profile = await db.doctorProfile.findUnique({
    where: { userId: session.id },
    select: { id: true, lastActiveAt: true },
  });
  if (!profile) return jsonError('Doctor profile not found', 404);

  const now = new Date();
  await db.doctorProfile.update({
    where: { id: profile.id },
    data: { lastActiveAt: now },
  });

  await logAudit(session.id, 'doctor.heartbeat', `doctorProfile=${profile.id}`);

  return jsonOk({
    status: derivePresenceStatus(now),
    lastActiveAt: now.toISOString(),
  });
}
