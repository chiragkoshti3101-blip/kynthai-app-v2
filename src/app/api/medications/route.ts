import { NextRequest } from 'next/server';
// import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/auth';
import { sanitizeText, rateLimit } from '@/lib/security';
import { parseTimes } from '@/lib/parse-times'
import { ensureTodayRemindersForMed, localReminderDate } from '@/lib/ensure-reminders';
import {
  requireAuth,
  requireAuthWithCsrf,
  jsonError,
  jsonOk,
  readJson,
  audit,
  checkConsent,
  jsonPage,
} from '@/lib/api-helpers';
import { createMedicationSchema, medicationsQuerySchema } from '@/lib/schemas';
export const dynamic = 'force-dynamic';

// SECURITY: cap the number of reminder times per medication to prevent
// runaway reminder creation (each time → a daily Reminder row per med).
const MAX_TIMES_PER_MED = 12;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// GET /api/medications?userId=...&familyMemberId=...
// Returns medications for the session user (or a family member they own).
export async function GET(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return limited;

  const { response, user } = await requireAuth(req);
  if (response || !user) return response!;
  const u = user!;

  const consentErr = checkConsent(u);
  if (consentErr) return consentErr;

  const sp = req.nextUrl.searchParams;
  const userId = sp.get('userId')?.trim();
  const familyMemberId = sp.get('familyMemberId')?.trim();
  const activeParam = sp.get('active')?.trim();

  // Validate query with Zod
  const qpResult = medicationsQuerySchema.safeParse({
    userId: userId || undefined,
    familyMemberId: familyMemberId || undefined,
    active: activeParam || undefined,
    cursor: sp.get('cursor')?.trim() || undefined,
    limit: sp.get('limit') || undefined,
    fields: sp.get('fields')?.trim() || undefined,
  });
  if (!qpResult.success) {
    const issues = qpResult.error.issues.map((i: any) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return jsonError('Invalid query parameters', 400, 'VALIDATION_ERROR', { issues });
  }
  const { cursor, limit, fields: _fields } = qpResult.data;
  const _active = qpResult.data.active;

  if (userId && userId !== u.id) {
    return jsonError('Forbidden — userId must match session', 403);
  }

  // Build where clause — if familyMemberId is provided, ONLY return that member's meds
  let where: any;
  if (familyMemberId) {
    // IDOR: ensure family member belongs to a family owned by this user.
    const member = await db.familyMember.findUnique({
      where: { id: familyMemberId },
      include: { family: true },
    });
    if (!member || (member as any).family.ownerId !== u.id) {
      return jsonError('Forbidden — family member does not belong to your family', 403);
    }
    // ONLY return this family member's medications
    where = { familyMemberId };
  } else {
    // Return the user's own medications
    where = { userId: u.id };
  }

  const take = limit + 1; // fetch one extra to determine hasMore
  const findArgs: any = { where, orderBy: { createdAt: 'desc' }, take };
  if (cursor) {
    findArgs.cursor = { id: cursor };
    findArgs.skipCursor = true;
  }
  const meds = await db.medication.findMany(findArgs);
  const hasMore = meds.length > limit;
  const page = hasMore ? meds.slice(0, limit) : meds;
  const nextCursor = hasMore && page.length > 0 ? page[page.length - 1]!.id : null;

  const serialized = page.map((m: any) => ({ ...m, times: parseTimes(m.times) }));

  return jsonPage(serialized, { cursor: nextCursor, limit, hasMore });
}

// POST /api/medications — create a medication
export async function POST(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return limited;

  const { response, user } = await requireAuthWithCsrf(req);
  if (response || !user) return response!;
  const u = user!;

  const consentErr = checkConsent(u);
  if (consentErr) return consentErr;

  const rawBody = await readJson(req);
  if (!rawBody) return jsonError('Invalid JSON', 400, 'INVALID_JSON');
  const schemaResult = createMedicationSchema.safeParse(rawBody);
  if (!schemaResult.success) {
    const fields: Record<string, string> = {};
    for (const issue of schemaResult.error.issues) {
      fields[String(issue.path.join('.') || 'body')] = issue.message;
    }
    return jsonError('Validation failed', 422, 'VALIDATION_ERROR', { fields });
  }
  const body = schemaResult.data as Record<string, unknown>;
  const name = sanitizeText(body.name as string, 120);
  const dosage = sanitizeText(body.dosage as string, 60);
  if (!name) return jsonError('Medication name is required', 400);
  if (!dosage) return jsonError('Dosage is required', 400);

  // Free-tier cap: enforce server-side (the UI shows the limit but the
  // backend must also enforce it — clients can be bypassed).
  const FREE_MED_LIMIT = 10; // lets users experience full value before hitting paywall
  if (u.subscriptionTier === 'free' || !u.subscriptionTier) {
    const existingCount = await db.medication.count({
      where: { userId: u.id, active: true },
    });
    if (existingCount >= FREE_MED_LIMIT) {
      return jsonError(
        `Free tier allows up to ${FREE_MED_LIMIT} medications. Upgrade to Plus for unlimited medications.`,
        403
      );
    }
  }

  const times: string[] =
    Array.isArray(body.times) && body.times.length
      ? body.times
          .slice(0, MAX_TIMES_PER_MED)
          .map((t: any) => sanitizeText(String(t), 10))
          .filter(t => TIME_RE.test(t))
      : ['09:00'];
  if (times.length === 0) times.push('09:00');

  let familyMemberId: string | null = null;
  let reminderTimezone = u.timezone;
  if (body.familyMemberId) {
    const member = await db.familyMember.findUnique({
      where: { id: body.familyMemberId as string },
      include: { family: true },
    });
    if (!member || member.family.ownerId !== u.id) {
      return jsonError('Forbidden — family member does not belong to your family', 403);
    }
    familyMemberId = member.id;
    const owner = await db.user.findUnique({
      where: { id: member.family.ownerId },
      select: { timezone: true },
    });
    reminderTimezone = owner?.timezone || reminderTimezone;
  }

  const med = await db.medication.create({
    data: {
      userId: u.id,
      familyMemberId,
      name,
      dosage,
      times: JSON.stringify(times),
      frequency: sanitizeText(body.frequency, 60) || 'Daily',
      instructions: sanitizeText(body.instructions, 500) || null,
      notes: sanitizeText(body.notes, 500) || null,
      color: sanitizeText(body.color, 30) || 'emerald',
      stockRemaining:
        body.stockRemaining !== undefined ? (Number(body.stockRemaining) ?? null) : undefined,
      timeWindowEnd: (body.timeWindowEnd as string) || '09:00',
      reminderInterval: Number(body.reminderInterval) || 10,
      active: true,
    },
  });

  await logAudit(u.id, 'medication.create', `med=${med.id}`);
  try {
    await ensureTodayRemindersForMed(med.id, times, localReminderDate(reminderTimezone));
  } catch {
    /* reminder rows are best-effort; cron backfills */
  }
  return jsonOk({ ...med, times: parseTimes(med.times) });
}
