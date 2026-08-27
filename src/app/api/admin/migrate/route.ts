import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin, jsonOk, jsonError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/security';
export const dynamic = 'force-dynamic';

// One-time schema-fix endpoint: adds columns the Prisma schema declares
// but no migration ever created (matches the updatedAt/trigger class of bug).

const FIXES: Array<{ table: string; column: string; ddl: string }> = [
  // appointments
  { table: 'appointments', column: 'lastReminderSentAt', ddl: `ALTER TABLE "appointments" ADD COLUMN "lastReminderSentAt" TIMESTAMP(3)` },
  // lab_bookings (8 missing)
  { table: 'lab_bookings', column: 'deliveryAddress', ddl: `ALTER TABLE "lab_bookings" ADD COLUMN "deliveryAddress" TEXT` },
  { table: 'lab_bookings', column: 'deliveryCity', ddl: `ALTER TABLE "lab_bookings" ADD COLUMN "deliveryCity" TEXT` },
  { table: 'lab_bookings', column: 'deliveryZip', ddl: `ALTER TABLE "lab_bookings" ADD COLUMN "deliveryZip" TEXT` },
  { table: 'lab_bookings', column: 'deliveryDistanceMi', ddl: `ALTER TABLE "lab_bookings" ADD COLUMN "deliveryDistanceMi" DOUBLE PRECISION` },
  { table: 'lab_bookings', column: 'deliveryFee', ddl: `ALTER TABLE "lab_bookings" ADD COLUMN "deliveryFee" INTEGER NOT NULL DEFAULT 0` },
  { table: 'lab_bookings', column: 'deliveryPlatformFee', ddl: `ALTER TABLE "lab_bookings" ADD COLUMN "deliveryPlatformFee" INTEGER NOT NULL DEFAULT 0` },
  { table: 'lab_bookings', column: 'stripePaymentIntentId', ddl: `ALTER TABLE "lab_bookings" ADD COLUMN "stripePaymentIntentId" TEXT` },
  { table: 'lab_bookings', column: 'paymentStatus', ddl: `ALTER TABLE "lab_bookings" ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'pending'` },
];

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 5, 60000);
  if (limited) return limited;
  const { response, user } = await requireAdmin(req);
  if (response || !user) return response!;

  const results: string[] = [];
  for (const fix of FIXES) {
    try {
      const colExists: any[] = await db.$queryRawUnsafe(
        `SELECT column_name FROM information_schema.columns WHERE table_name = '${fix.table}' AND column_name = '${fix.column}'`
      );
      if (colExists.length === 0) {
        await db.$executeRawUnsafe(fix.ddl);
        results.push(`ADDED ${fix.table}.${fix.column}`);
      } else {
        results.push(`exists ${fix.table}.${fix.column}`);
      }
    } catch (e: any) {
      results.push(`SKIP ${fix.table}.${fix.column}: ${e?.message?.slice(0, 100) || 'unknown'}`);
    }
  }

  // Verify the appointments read now works
  try {
    const appts = await db.appointment.findMany({ take: 1, include: { patient: true } });
    results.push('appointment read: OK, count=' + appts.length);
  } catch (e: any) {
    results.push('appointment read FAIL: ' + (e?.message?.slice(0, 120) || 'unknown'));
  }

  return jsonOk({ results });
}