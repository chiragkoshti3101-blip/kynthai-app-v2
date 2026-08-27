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

  const body = await req.json().catch(() => ({}));
  const out: any = {};

  if (body.mode === 'alltables') {
    const tables: any[] = await db.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`;
    out.tables = tables.map(t => t.table_name);
  }

  if (body.mode === 'test-prescribe-writes') {
    // Simulate the writes the prescribe flow does, but harmless
    const writes: string[] = [];
    // notificationLog
    try {
      const n = await db.notificationLog.create({ data: {
        userId: 'cmtaf5yqb000jib04hegbpwk1', channel: 'in-app', type: 'test',
        title: 't', body: 'b', recipient: 'x@y.com', status: 'sent', cost: 0,
      }});
      writes.push('notificationLog.create OK');
      await db.notificationLog.delete({ where: { id: n.id } });
    } catch(e:any) { writes.push('notificationLog FAIL: ' + e?.message?.slice(0,100)); }
    // auditLog
    try {
      await db.auditLog.create({ data: { userId: user.id, action: 'test' }});
      writes.push('auditLog.create OK');
      await db.auditLog.deleteMany({ where: { action: 'test' }});
    } catch(e:any) { writes.push('auditLog FAIL: ' + e?.message?.slice(0,100)); }
    out.writes = writes;
  }

  if (body.mode === 'test-medication-create') {
    try {
      const m = await db.medication.create({ data: {
        userId: user.id, name: 'Test Med', dosage: '10mg',
        times: JSON.stringify(['08:00']), frequency: 'Daily',
        instructions: 'test',
      }});
      out.medResult = 'OK id=' + m.id;
      await db.medication.delete({ where: { id: m.id } });
    } catch(e:any) { out.medResult = 'FAIL: ' + e?.message?.slice(0,150); }
  }

  return jsonOk(out);
}
