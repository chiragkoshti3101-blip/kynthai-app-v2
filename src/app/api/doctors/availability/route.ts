import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { recordAuditSync } from '@/lib/audit-logger'
import { rateLimit } from '@/lib/security'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk, readJson } from '@/lib/api-helpers'
import { logAudit } from '@/lib/auth'
import { availabilityUpdateSchema } from '@/lib/schemas/security'
import { clinicTimeZone } from '@/lib/doctor-availability'
export const dynamic = 'force-dynamic'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

// GET /api/doctors/availability?doctorId=...
// Returns the doctor's weekly availability schedule from DB.
export async function GET(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  const u = user!

  await logAudit(user.id, 'doctor.availability.read', { resourceType: 'DoctorProfile' })

  let doctorId = req.nextUrl.searchParams.get('doctorId')

  // If the caller is a doctor and no doctorId is provided, use their own profile.
  let me: { id: string } | null = null
  if (!doctorId && user.role === 'doctor') {
    me = await db.doctorProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
    if (me) doctorId = me.id
  }

  // A doctor with no profile yet simply has no availability — not a bad request.
  if (!doctorId && user.role === 'doctor' && !me) {
    const schedule: Record<string, { start: string; end: string }[]> = {}
    for (const day of DAYS) schedule[day] = []
    return jsonOk({
      doctorId: null,
      schedule,
      timeZone: user.timezone ?? null,
      clinicTimeZone: clinicTimeZone(user.timezone),
    })
  }

  if (!doctorId) return jsonError('doctorId is required', 400)

  // Allow doctors to view their own availability, or any authenticated user to
  // view a doctor's public availability. The stored clinic zone comes back
  // with the profile lookup this check already needs, so there is no third
  // query just to read it. `timeZone` stays null when never set;
  // `clinicTimeZone` is the zone the windows are actually interpreted in.
  let timeZone: string | null = null
  if (user.role !== 'doctor') {
    const profile = await db.doctorProfile.findUnique({
      where: { id: doctorId },
      select: { verified: true, user: { select: { timezone: true } } },
    })
    if (!profile?.verified) return jsonError('Doctor not found or not verified', 404)
    timeZone = profile.user?.timezone ?? null
  } else {
    const own = await db.doctorProfile.findUnique({
      where: { userId: user.id },
      select: { id: true, user: { select: { timezone: true } } },
    })
    if (own && own.id !== doctorId) return jsonError('Forbidden', 403)
    timeZone = own?.user?.timezone ?? null
  }

  const slots = await db.doctorAvailabilitySlot.findMany({ where: { doctorId, active: true }, orderBy: { day: 'asc' } })

  const schedule: Record<string, { start: string; end: string }[]> = {}
  for (const day of DAYS) schedule[day] = []
  for (const s of slots) {
    if (s.day in schedule) {
      ;(schedule[s.day] as { start: string; end: string }[]).push({ start: s.start, end: s.end })
    }
  }

  return jsonOk({ doctorId, schedule, timeZone, clinicTimeZone: clinicTimeZone(timeZone) })
}

// POST /api/doctors/availability
// Replaces the doctor's availability schedule in DB.
export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  if (user.role !== 'doctor') return jsonError('Only doctors may update availability', 403)

  await recordAuditSync(user.id, 'doctor.availability.update', { resourceType: 'DoctorProfile' })

  const profile = await db.doctorProfile.findUnique({ where: { userId: user.id } })
  if (!profile) return jsonError('Doctor profile not found', 404)

  const rawBody = await readJson(req)
  if (!rawBody) return jsonError('Invalid JSON', 400, 'INVALID_JSON')
  const parsed = availabilityUpdateSchema.safeParse(rawBody)
  if (!parsed.success) {
    const fields: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      fields[String(issue.path.join('.') || 'body')] = issue.message
    }
    return jsonError('Validation failed', 422, 'VALIDATION_ERROR', { fields })
  }
  const body = parsed.data

  // Clinic zone for the weekly windows. Writing it on the doctor's own user
  // row is what makes the booking gate read the hours in the right zone.
  if (body.timeZone !== undefined) {
    await db.user.update({
      where: { id: user.id },
      data: { timezone: body.timeZone },
    })
  }

  // Replace every window for each submitted day. A day may carry more than one
  // window (e.g. morning and afternoon), so the previous "first window only"
  // upsert is replaced by delete-then-create per day.
  for (const entry of body.schedule) {
    const day = entry.day
    const slots = entry.slots
    if (typeof db.doctorAvailabilitySlot.deleteMany === 'function') {
      await db.doctorAvailabilitySlot.deleteMany({ where: { doctorId: profile.id, day } })
    } else if (typeof db.doctorAvailabilitySlot.updateMany === 'function') {
      await db.doctorAvailabilitySlot.updateMany({
        where: { doctorId: profile.id, day },
        data: { active: false },
      })
    }
    if (slots.length === 0) continue
    if (typeof db.doctorAvailabilitySlot.create === 'function') {
      for (const slot of slots) {
        await db.doctorAvailabilitySlot.create({
          data: { doctorId: profile.id, day, start: slot.start, end: slot.end, active: true },
        })
      }
    } else if (typeof db.doctorAvailabilitySlot.createMany === 'function') {
      await db.doctorAvailabilitySlot.createMany({
        data: slots.map((slot) => ({
          doctorId: profile.id,
          day,
          start: slot.start,
          end: slot.end,
          active: true,
        })),
      })
    }
  }

  // Mark days not in the submitted schedule as inactive.
  const submittedDays = new Set(body.schedule.map((s) => (s as { day: string }).day))
  await db.doctorAvailabilitySlot.updateMany({
    where: { doctorId: profile.id, day: { notIn: Array.from(submittedDays) } },
    data: { active: false },
  })

  const slots = await db.doctorAvailabilitySlot.findMany({ where: { doctorId: profile.id, active: true }, orderBy: { day: 'asc' } })
  const schedule: Record<string, { start: string; end: string }[]> = {}
  for (const day of DAYS) schedule[day] = []
  for (const s of slots) {
    if (s.day in schedule) {
      ;(schedule[s.day] as { start: string; end: string }[]).push({ start: s.start, end: s.end })
    }
  }

  return jsonOk({
    doctorId: profile.id,
    schedule,
    timeZone: body.timeZone !== undefined ? body.timeZone : user.timezone ?? null,
    clinicTimeZone: clinicTimeZone(body.timeZone !== undefined ? body.timeZone : user.timezone),
  })
}
