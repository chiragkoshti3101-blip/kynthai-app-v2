import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { sanitizeText, rateLimit } from '@/lib/security'
import { parseTimes } from '@/lib/parse-times'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk, readJson, audit, checkConsent } from '@/lib/api-helpers'
import { ReminderStatus } from '@prisma/client'
import { todayStr, toISODateTime } from '@/lib/utils'
export const dynamic = 'force-dynamic'

// GET /api/reminders?date=YYYY-MM-DD&familyMemberId=...
// Auto-creates pending reminders from medication schedules for the given date.
export async function GET(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  const u = user!

  const consentErr = checkConsent(u)
  if (consentErr) return consentErr

  const sp = req.nextUrl.searchParams
  const rawDate = sp.get('date') || todayStr()
  // Client may send YYYY-MM-DD; Prisma DateTime columns need ISO-8601 with time.
  const date = rawDate.includes('T') ? rawDate : toISODateTime(rawDate)
  const familyMemberId = sp.get('familyMemberId')?.trim()

  // IDOR: if familyMemberId, ensure owned by user.
  let memberFilter: { familyMemberId?: string; userId?: string } = {}
  if (familyMemberId) {
    const member = await db.familyMember.findUnique({
      where: { id: familyMemberId },
      include: { family: true },
    })
    if (!member || member.family.ownerId !== u.id) {
      return jsonError('Forbidden — family member not owned', 403)
    }
    memberFilter = { familyMemberId }
  } else {
    memberFilter = { userId: u.id }
  }

  const meds = await db.medication.findMany({
    where: { active: true, ...memberFilter },
  })

  // Batch auto-create: gather all (medicationId, time) candidates, fetch the
  // existing set in one query, then createMany with skipDuplicates as a safety
  // net (unique(medicationId, date, time) already exists in the schema).
  // ponytail: previously a serial per-med x per-time findUnique+create loop
  // (~17s with many meds); this is O(1) queries regardless of med/time count.
  const medIds = meds.map((m) => m.id)
  const candidates: { medicationId: string; date: string; time: string }[] = []
  for (const med of meds) {
    // ponytail: parseTimes tolerates legacy comma-format rows instead of
    // skipping them (previous behavior) — a corrupt row degrades to 09:00.
    const times = parseTimes(med.times)
    for (const t of times) candidates.push({ medicationId: med.id, date, time: t })
  }

  if (candidates.length) {
    const existing = await db.reminder.findMany({
      where: { date, medicationId: { in: medIds } },
      select: { medicationId: true, time: true },
    })
    const existingKeys = new Set(existing.map((e) => `${e.medicationId}|${e.time}`))
    const toCreate = candidates.filter((c) => !existingKeys.has(`${c.medicationId}|${c.time}`))
    if (toCreate.length) {
      await db.reminder.createMany({
        data: toCreate.map((c) => ({ ...c, status: 'pending' })),
        skipDuplicates: true,
      })
    }
  }
  const reminders = medIds.length
    ? await db.reminder.findMany({
        where: { date, medicationId: { in: medIds } },
        include: { medication: true },
        orderBy: { time: 'asc' },
      })
    : []

  return jsonOk(
    reminders.map((r) => ({
      ...r,
      medication: r.medication ? { ...r.medication, times: parseTimes(r.medication.times) } : null,
    })),
  )
}

// POST /api/reminders
export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!

  const body = await readJson<{ medicationId?: string; date?: string; time?: string; status?: string }>(req)
  if (!body || !body.medicationId || !body.date || !body.time || !body.status) {
    return jsonError('medicationId, date, time, status are required', 400)
  }
  const status = sanitizeText(body.status, 30) as ReminderStatus
  if (!['pending', 'taken', 'skipped'].includes(status)) {
    return jsonError('Invalid status', 400)
  }
  // reminder.date is a DateTime column — the caretaker app sends date-only
  // ("2026-08-11"); normalize to full ISO-8601 or Prisma rejects the upsert.
  const date = body.date.includes('T') ? body.date : toISODateTime(body.date)

  // IDOR: ensure med belongs to user.
  const med = await db.medication.findUnique({ where: { id: body.medicationId } })
  if (!med) return jsonError('Medication not found', 404)
  const owns = med.userId === u.id || (med.familyMemberId
    ? !!(await db.familyMember.findFirst({
        where: { id: med.familyMemberId, family: { ownerId: u.id } },
      }))
    : false)
  if (!owns) return jsonError('Forbidden', 403)

  // FIX #1/#32: "taken" is terminal for a dose — a stale client (or a re-fired
  // alarm) must never downgrade taken → skipped/pending and null out takenAt.
  const existing = await db.reminder.findUnique({
    where: { medicationId_date_time: { medicationId: body.medicationId, date, time: body.time } },
    select: { id: true, status: true },
  })
  if (existing && existing.status === 'taken' && status !== 'taken') {
    const current = await db.reminder.findUnique({ where: { id: existing.id } })
    return jsonOk(current)
  }

  const reminder = await db.reminder.upsert({
    where: { medicationId_date_time: { medicationId: body.medicationId, date, time: body.time } },
    update: { status, takenAt: status === 'taken' ? new Date() : null },
    create: {
      medicationId: body.medicationId,
      date,
      time: body.time,
      status,
      takenAt: status === 'taken' ? new Date() : null,
    },
  })

  await logAudit(u.id, 'reminder.mark', `med=${body.medicationId} date=${body.date} time=${body.time} status=${status}`)
  return jsonOk(reminder)
}
