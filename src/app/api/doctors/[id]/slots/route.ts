import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, jsonError, jsonOk } from '@/lib/api-helpers'
import { rateLimit } from '@/lib/security'
import {
  buildDaySlots,
  clinicTimeZone,
  MAX_APPOINTMENT_MINUTES,
  resolveTimeZone,
  zonedTimeToUtc,
} from '@/lib/doctor-availability'
export const dynamic = 'force-dynamic'

// GET /api/doctors/[id]/slots?date=YYYY-MM-DD&timeZone=<IANA>&duration=<min>
//
// Returns the bookable instants for one day of the caller's calendar, built
// from the doctor's windows interpreted in the DOCTOR's zone. Each slot is an
// absolute instant the booking form submits verbatim, so the grid can never
// offer a time the POST gate rejects. No slot logic lives in the client.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!

  const { id: doctorId } = await params
  const url = new URL(req.url)
  const dateParam = url.searchParams.get('date') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return jsonError('A valid date (YYYY-MM-DD) is required', 400)
  }

  // Optional appointment length: the grid is spaced by it and a slot only
  // starts when the whole appointment fits the window, matching the gate for
  // visits longer than the default slot.
  const durationParam = Number(url.searchParams.get('duration') ?? '')
  const slotMinutes =
    Number.isFinite(durationParam) && durationParam > 0
      ? Math.min(MAX_APPOINTMENT_MINUTES, Math.max(5, durationParam))
      : undefined

  const doctor = await db.doctorProfile.findUnique({
    where: { id: doctorId },
    select: { id: true, user: { select: { timezone: true } } },
  })
  if (!doctor) return jsonError('Doctor not found', 404)

  const clinicZone = clinicTimeZone(doctor.user?.timezone)
  const viewerZone = resolveTimeZone(url.searchParams.get('timeZone'), clinicZone)

  // The viewer's day can straddle two clinic days, so every active window is
  // loaded and the clinic dates either side of it are scanned by buildDaySlots.
  const [year, month, day] = dateParam.split('-').map(Number)
  const dayStart = zonedTimeToUtc(year!, month!, day!, 0, 0, viewerZone)
  const dayEnd = zonedTimeToUtc(year!, month!, day! + 1, 0, 0, viewerZone)

  const [windows, appointments] = await Promise.all([
    db.doctorAvailabilitySlot.findMany({
      where: { doctorId, active: true },
      select: { day: true, start: true, end: true },
    }),
    db.appointment.findMany({
      where: {
        doctorId,
        status: { in: ['pending', 'confirmed', 'rescheduled'] },
        deletedAt: null,
        scheduledAt: {
          gte: new Date(dayStart.getTime() - 24 * 60 * 60 * 1000),
          lt: new Date(dayEnd.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      select: { scheduledAt: true, durationMinutes: true },
    }),
  ])

  const booked = appointments.map((a) => ({
    at: a.scheduledAt.toISOString(),
    durationMinutes: a.durationMinutes,
  }))

  return jsonOk({
    date: dateParam,
    clinicTimeZone: clinicZone,
    viewerTimeZone: viewerZone,
    slots: buildDaySlots({
      windows,
      viewerDate: dateParam,
      viewerTimeZone: viewerZone,
      clinicTimeZone: clinicZone,
      booked,
      slotMinutes,
    }),
  })
}
