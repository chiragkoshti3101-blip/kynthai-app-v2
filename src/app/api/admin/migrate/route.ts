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
    // Direct SQL update to approve doctor — bypasses Prisma column bug
    const result: any = await db.$executeRaw`
      UPDATE doctor_profiles 
      SET "verified" = true, "verificationStatus" = 'approved', "rejectionReason" = NULL 
      WHERE id = 'cmtaf5yqb000jib04hegbpwk1'
    `;
    
    // Verify
    const profile: any[] = await db.$queryRaw`
      SELECT id, verified, "verificationStatus" FROM doctor_profiles 
      WHERE id = 'cmtaf5yqb000jib04hegbpwk1'
    `;
    
    return jsonOk({ updated: result, profile: profile[0] });
  } catch (error: any) {
    return jsonError(error?.message?.slice(0, 200), 500);
  }
}
