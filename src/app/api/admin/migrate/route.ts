import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin, jsonOk, jsonError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/security';
export const dynamic = 'force-dynamic';

// Refresh: list Prisma client model names via introspection of the DB
// Compare information_schema columns vs what Prisma expects is impossible
// statically, so we scan the actual DB tables against schema.prisma.
// Instead: dump all columns present in each key table so we can see gaps.

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 5, 60000);
  if (limited) return limited;
  const { response, user } = await requireAdmin(req);
  if (response || !user) return response!;

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'columns';
    const out: any = { mode };

    if (mode === 'columns') {
      // Dump actual columns for key tables
      const tables = [
        'appointments','users','medications','prescriptions','reminders',
        'doctor_profiles','lab_profiles','lab_bookings','chat_messages',
        'consult_messages','family_members','notifications','payments'
      ];
      for (const t of tables) {
        try {
          const cols: any[] = await db.$queryRawUnsafe(
            `SELECT column_name FROM information_schema.columns WHERE table_name = '${t}' ORDER BY ordinal_position`
          );
          out[t] = cols.map(c => c.column_name);
        } catch (e: any) {
          out[t] = 'ERROR: ' + (e?.message?.slice(0, 80) || 'unknown');
        }
      }
    }

    return jsonOk(out);
  } catch (error: any) {
    return jsonError(error?.message?.slice(0, 300), 500);
  }
}