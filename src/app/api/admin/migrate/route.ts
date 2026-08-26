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
    
    // Find ALL triggers that reference updatedAt across all tables
    const triggers: any[] = await db.$queryRaw`
      SELECT trigger_name, event_object_table, action_statement
      FROM information_schema.triggers
      WHERE action_statement LIKE '%updatedAt%' OR trigger_name LIKE '%updated_at%'
    `;
    results.push('found: ' + triggers.map(t => `${t.event_object_table}.${t.trigger_name}`).join(', '));
    
    for (const t of triggers) {
      try {
        await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${t.trigger_name}" ON "${t.event_object_table}"`);
        results.push(`dropped: ${t.trigger_name} on ${t.event_object_table}`);
      } catch (e: any) {
        results.push(`drop failed: ${t.trigger_name}: ${e?.message?.slice(0, 80)}`);
      }
    }

    // Test appointment creation
    try {
      const appt: any[] = await db.$queryRaw`SELECT id FROM doctor_profiles WHERE verified = true LIMIT 1`;
      if (appt.length) {
        await db.$executeRawUnsafe(`INSERT INTO appointments (id, "doctorId", "patientId", "scheduledAt", status, type, price, commission, reason, "createdAt") VALUES (gen_random_uuid()::text, '${appt[0].id}', (SELECT id FROM users WHERE email='patient@kynthai.app' LIMIT 1), '2026-08-28T10:00:00Z', 'pending', 'video', 150, 0, 'test', NOW())`);
        results.push('appointment INSERT succeeded!');
      }
    } catch (e: any) {
      results.push('appointment test: ' + (e?.message?.slice(0, 150) || 'unknown'));
    }

    return jsonOk({ results });
  } catch (error: any) {
    return jsonError(error?.message?.slice(0, 200), 500);
  }
}
