import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin, jsonOk, jsonError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/security';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 5, 60000);
  if (limited) return limited;
  const { response, user } = await requireAdmin(req);
  if (response || !user) return response!;

  try {
    const results: string[] = [];
    
    // Test: can we read appointments with patient relation?
    try {
      const appts = await db.appointment.findMany({ take: 1, include: { patient: true } });
      results.push('appointment read: OK, count=' + appts.length);
    } catch (e: any) {
      results.push('appointment read FAIL: ' + (e?.message?.slice(0, 200) || 'unknown'));
    }

    // Test: can we read doctorProfile?
    try {
      const doc = await db.doctorProfile.findFirst({ include: { user: true } });
      results.push('doctorProfile read: OK, name=' + (doc?.user?.name || 'none'));
    } catch (e: any) {
      results.push('doctorProfile read FAIL: ' + (e?.message?.slice(0, 200) || 'unknown'));
    }

    return jsonOk({ results });
  } catch (error: any) {
    return jsonError(error?.message?.slice(0, 200), 500);
  }
}
