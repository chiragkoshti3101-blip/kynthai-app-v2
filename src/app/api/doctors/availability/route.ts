import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { recordAuditSync } from '@/lib/audit-logger'
import { rateLimit } from '@/lib/security'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk, readJson } from '@/lib/api-helpers'
import { logAudit } from '@/lib/auth'
import { availabilityUpdateSchema } from '@/lib/schemas/security'
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
    return jsonOk({ doctorId: null, schedule })
  }

  if (!doctorId) return jsonError('doctorId is required', 400)

  // Allow doctors to view their own availability, or any authenticated user to view a doctor's public availability.
  if (user.role !== 'doctor') {
    const profile = await db.doctorProfile.findUnique({ where: { id: doctorId } })
    if (!profile?.verified) return jsonError('Doctor not found or not verified', 404)
  } else {
    const me = await db.doctorProfile.findUnique({ where: { userId: user.id } })
    if (me && me.id !== doctorId) return jsonError('Forbidden', 403)
  }

  const slots = await db.doctorAvailabilitySlot.findMany({ where: { doctorId, active: true }, orderBy: { day: 'asc' } })

  const schedule: Record<string, { start: string; end: string }[]> = {}
  for (const day of DAYS) schedule[day] = []
  for (const s of slots) {
    if (s.day in schedule) {
      ;(schedule[s.day] as { start: string; end: string }[]).push({ start: s.start, end: s.end })
    }
  }

  return jsonOk({ doctorId, schedule })
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

  // Upsert each day slot: find existing by doctorId+day, update or create.
  for (const entry of body.schedule) {
    const day = entry.day
    const slots = entry.slots
    const existing = await db.doctorAvailabilitySlot.findFirst({
      where: { doctorId: profile.id, day },
    })
    const start = slots[0]?.start ?? '00:00'
    const end = slots[0]?.end ?? '23:59'
    const active = slots.length > 0
    if (existing) {
      await db.doctorAvailabilitySlot.update({
        where: { id: existing.id },
        data: { start, end, active },
      })
    } else {
      await db.doctorAvailabilitySlot.create({
        data: { doctorId: profile.id, day, start, end, active },
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

  return jsonOk({ doctorId: profile.id, schedule })
}
