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
    // Add missing updatedAt column to doctor_profiles and lab_profiles
    // A DB trigger references NEW.updatedAt but the column was never created.
    const results: string[] = [];
    
    try {
      await db.$executeRaw`ALTER TABLE "doctor_profiles" ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT NOW()`;
      results.push('doctor_profiles.updatedAt added');
    } catch (e: any) {
      if (e?.message?.includes('already exists')) results.push('doctor_profiles.updatedAt already exists');
      else throw e;
    }
    
    try {
      await db.$executeRaw`ALTER TABLE "lab_profiles" ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT NOW()`;
      results.push('lab_profiles.updatedAt added');
    } catch (e: any) {
      if (e?.message?.includes('already exists')) results.push('lab_profiles.updatedAt already exists');
      else throw e;
    }

    // Now try the doctor approval
    try {
      await db.$executeRaw`
        UPDATE doctor_profiles 
        SET "verified" = true, "verificationStatus" = 'approved', "rejectionReason" = NULL 
        WHERE id = 'cmtaf5yqb000jib04hegbpwk1'
      `;
      results.push('doctor approved!');
    } catch (e: any) {
      results.push('approve failed: ' + (e?.message?.slice(0, 100) || 'unknown'));
    }

    return jsonOk({ results });
  } catch (error: any) {
    return jsonError(error?.message?.slice(0, 200), 500);
  }
}
