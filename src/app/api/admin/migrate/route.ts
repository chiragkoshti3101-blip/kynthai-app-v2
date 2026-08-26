import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin, jsonOk, jsonError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/security';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 2, 60000);
  if (limited) return limited;
  const { response, user } = await requireAdmin(req);
  if (response || !user) return response!;

  try {
    // Get full column info for doctor_profiles
    const cols: any[] = await db.$queryRaw`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'doctor_profiles' 
      ORDER BY ordinal_position
    `;
    
    // Try a direct update to see the exact error
    let testResult = 'not attempted';
    try {
      const profile = await db.doctorProfile.findFirst({ where: { verified: false } });
      if (profile) {
        await db.doctorProfile.update({
          where: { id: profile.id },
          data: { verified: true, verificationStatus: 'approved', rejectionReason: null },
        });
        testResult = 'SUCCESS';
        // Revert
        await db.doctorProfile.update({
          where: { id: profile.id },
          data: { verified: false, verificationStatus: 'pending' },
        });
      }
    } catch (e: any) {
      testResult = e?.message?.slice(0, 300) || 'unknown error';
    }

    return jsonOk({ columns: cols.map(c => c.column_name), testResult });
  } catch (error: any) {
    return jsonError(error?.message?.slice(0, 200), 500);
  }
}
