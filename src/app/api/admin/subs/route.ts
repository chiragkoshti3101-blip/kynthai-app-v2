import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin, jsonOk } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/security';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return limited;
  const { response, user } = await requireAdmin(req);
  if (response || !user) return response!;
  const subs = await db.pushSubscription.findMany({ include: { user: { select: { email: true, id: true } } } });
  return jsonOk({
    total: subs.length,
    subs: subs.map(s => ({ user: s.user?.email || s.userId, endpoint: String(s.endpoint||'').slice(0,50), createdAt: s.createdAt })),
  });
}
