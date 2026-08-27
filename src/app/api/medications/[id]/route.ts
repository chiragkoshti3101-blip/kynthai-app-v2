import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/auth';
import { sanitizeText, rateLimit } from '@/lib/security';
import { parseTimes } from '@/lib/parse-times';
import {
  requireAuth,
  requireAuthWithCsrf,
  jsonError,
  jsonOk,
  readJson,
  audit,
} from '@/lib/api-helpers';
import { updateMedicationSchema } from '@/lib/schemas';
import { toISODateTime } from '@/lib/utils';
export const dynamic = 'force-dynamic';

// GET /api/medications/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req);
  if (limited) return limited;

  const { response, user } = await requireAuth(req);
  if (response || !user) return response!;
  const u = user!;

  const { id } = await params;
  const med = await db.medication.findUnique({ where: { id } });
  if (!med) return jsonError('Not found', 404);

  // IDOR: ownership check.
  if (med.userId && med.userId !== u.id) {
    // Maybe it belongs to a family member owned by this user.
    if (med.familyMemberId) {
      const member = await db.familyMember.findUnique({
        where: { id: med.familyMemberId },
        include: { family: true },
      });
      if (!member || member.family.ownerId !== u.id) {
        return jsonError('Forbidden', 403);
      }
    } else {
      return jsonError('Forbidden', 403);
    }
  }

  return jsonOk({ ...med, times: parseTimes(med.times) });
}

// PUT /api/medications/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req);
  if (limited) return limited;

  const { response, user } = await requireAuthWithCsrf(req);
  if (response || !user) return response!;
  const u = user!;

  const { id } = await params;
  const med = await db.medication.findUnique({ where: { id } });
  if (!med) return jsonError('Not found', 404);

  const owns =
    med.userId === u.id ||
    (med.familyMemberId
      ? !!(await db.familyMember.findFirst({
          where: { id: med.familyMemberId, family: { ownerId: u.id } },
        }))
      : false);
  if (!owns) return jsonError('Forbidden — you do not own this medication', 403);

  const rawBody = await readJson(req);
  if (!rawBody) return jsonError('Invalid JSON', 400, 'INVALID_JSON');
  const updResult = updateMedicationSchema.safeParse(rawBody);
  if (!updResult.success) {
    const _fields: Record<string, string> = {};
    for (const issue of updResult.error.issues) {
      _fields[String(issue.path.join('.') || 'body')] = issue.message;
    }
    return jsonError('Validation failed', 422, 'VALIDATION_ERROR', { _fields });
  }
  const body = updResult.data;

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = sanitizeText(body.name, 120);
  if (body.dosage !== undefined) data.dosage = sanitizeText(body.dosage, 60);
  if (body.times !== undefined) data.times = JSON.stringify(body.times);
  if (body.frequency !== undefined) data.frequency = sanitizeText(body.frequency, 60);
  if (body.instructions !== undefined)
    data.instructions = sanitizeText(body.instructions, 500) || null;
  if (body.notes !== undefined) data.notes = sanitizeText(body.notes, 500) || null;
  if (body.color !== undefined) data.color = sanitizeText(body.color, 30);
  if (body.active !== undefined) data.active = !!body.active;
  if (body.stockRemaining !== undefined) data.stockRemaining = Number(body.stockRemaining) ?? null;

  const updated = await db.medication.update({ where: { id }, data });

  // FIX #10: when dose times change, stale pending reminder rows keep firing
  // the OLD schedule while the med list shows the new one (and GET
  // /api/reminders then creates BOTH, which is the reported "two schedules for
  // one drug" bug). Drop pending rows from today onward — taken/missed history
  // is preserved — and regenerate today's rows from the new times immediately
  // (future days regenerate via the daily schedule cron/GET auto-create).
  if (body.times !== undefined) {
    try {
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      await db.reminder.deleteMany({
        where: { medicationId: id, date: { gte: todayDate }, status: 'pending' },
      });
      const times = parseTimes(updated.times);
      const todayIso = new Date(toISODateTime(todayDate.toISOString().slice(0, 10)));
      for (const t of times) {
        await db.reminder.upsert({
          where: { medicationId_date_time: { medicationId: id, date: todayIso, time: t } },
          update: {},
          create: { medicationId: id, date: todayIso, time: t, status: 'pending' },
        });
      }
    } catch (e) {
      console.warn('[medications] reminder regeneration failed', e);
    }
  }

  await logAudit(u.id, 'medication.update', `med=${id} fields=${Object.keys(data).join(',')}`);
  return jsonOk({ ...updated, times: parseTimes(updated.times) });
}

// DELETE /api/medications/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req);
  if (limited) return limited;

  const { response, user } = await requireAuthWithCsrf(req);
  if (response || !user) return response!;
  const u = user!;

  const { id } = await params;
  const med = await db.medication.findUnique({ where: { id } });
  if (!med) return jsonError('Not found', 404);

  const owns =
    med.userId === u.id ||
    (med.familyMemberId
      ? !!(await db.familyMember.findFirst({
          where: { id: med.familyMemberId, family: { ownerId: u.id } },
        }))
      : false);
  if (!owns) return jsonError('Forbidden — you do not own this medication', 403);

  await db.medication.delete({ where: { id } });
  await logAudit(u.id, 'medication.delete', `med=${id}`);
  return jsonOk({ success: true });
}
