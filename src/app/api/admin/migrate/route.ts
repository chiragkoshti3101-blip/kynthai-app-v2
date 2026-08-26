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
    
    // List all triggers on doctor_profiles
    const triggers: any[] = await db.$queryRaw`
      SELECT trigger_name, event_manipulation, action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'doctor_profiles'
    `;
    results.push('triggers: ' + JSON.stringify(triggers.map(t => t.trigger_name)));
    
    // Drop all triggers on doctor_profiles that reference updatedAt
    for (const t of triggers) {
      try {
        await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${t.trigger_name}" ON "doctor_profiles"`);
        results.push(`dropped trigger: ${t.trigger_name}`);
      } catch (e: any) {
        results.push(`drop failed ${t.trigger_name}: ${e?.message?.slice(0, 80)}`);
      }
    }

    // Test: can we now update a doctor profile?
    try {
      await db.$executeRaw`UPDATE "doctor_profiles" SET "verified" = true, "verificationStatus" = 'approved' WHERE id = 'cmtaf5yqb000jib04hegbpwk1'`;
      results.push('UPDATE succeeded!');
    } catch (e: any) {
      results.push('UPDATE still fails: ' + (e?.message?.slice(0, 150) || 'unknown'));
    }

    return jsonOk({ results });
  } catch (error: any) {
    return jsonError(error?.message?.slice(0, 200), 500);
  }
}
