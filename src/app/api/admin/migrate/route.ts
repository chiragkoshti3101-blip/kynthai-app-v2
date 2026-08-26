import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin, jsonOk, jsonError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/security';
export const dynamic = 'force-dynamic';

// POST /api/admin/migrate — one-time migration endpoint
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 2, 60000);
  if (limited) return limited;
  const { response, user } = await requireAdmin(req);
  if (response || !user) return response!;

  try {
    const result: any[] = await db.$queryRaw`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'doctor_profiles' AND column_name = 'rejectionReason'
    `;
    
    if (result.length > 0) {
      return jsonOk({ message: 'Column already exists', migrated: false });
    }

    await db.$executeRaw`ALTER TABLE "doctor_profiles" ADD COLUMN "rejectionReason" TEXT`;
    await db.$executeRaw`ALTER TABLE "lab_profiles" ADD COLUMN "rejectionReason" TEXT`;
    
    return jsonOk({ message: 'Migration applied', migrated: true });
  } catch (error: any) {
    return jsonError(error.message?.slice(0, 200), 500);
  }
}
