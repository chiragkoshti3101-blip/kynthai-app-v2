import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, jsonError, jsonOk } from '@/lib/api-helpers'
import { rateLimit } from '@/lib/security'
export const dynamic = 'force-dynamic'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// GET /api/doctors/[id]/slots?date=YYYY-MM-DD
//
// FIX #6: the booking dialogs previously showed a hardcoded static slot list
// that ignored both the doctor's availability windows and existing
// appointments — the server then rejected slots it had itself offered
// ("Doctor is not available at that time"). This endpoint returns the real
// picture: the doctor's availability windows for that weekday plus the
// booked instants so the client can mark taken slots unavailable. The server
// side ±30min conflict window on POST /api/appointments remains the
// authority; this endpoint just makes the UI honest.
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

  const doctor = await db.doctorProfile.findUnique({
    where: { id: doctorId },
    select: { id: true },
  })
  if (!doctor) return jsonError('Doctor not found', 404)

  // Weekday for the requested calendar date. Noon UTC avoids midnight/DST
  // edges shifting the day for near-dateline timezones.
  const weekday = DAY_NAMES[new Date(`${dateParam}T12:00:00Z`).getUTCDay()]

  // Booked instants: widen the scan to a ±1 day UTC window so bookings made
  // from far-offset timezones (e.g. UTC+13) still land inside the scan; the
  // client matches precisely against the slots it builds in its own timezone.
  const dayStart = new Date(`${dateParam}T00:00:00.000Z`)
  const [windows, appointments] = await Promise.all([
    db.doctorAvailabilitySlot.findMany({
      where: { doctorId, active: true, day: weekday },
      orderBy: { start: 'asc' },
      select: { day: true, start: true, end: true },
    }),
    db.appointment.findMany({
      where: {
        doctorId,
        status: { in: ['pending', 'confirmed'] },
        scheduledAt: {
          gte: new Date(dayStart.getTime() - 24 * 60 * 60 * 1000),
          lt: new Date(dayStart.getTime() + 2 * 24 * 60 * 60 * 1000),
        },
      },
      select: { scheduledAt: true },
    }),
  ])

  return jsonOk({
    date: dateParam,
    weekday,
    windows,
    booked: appointments.map((a) => a.scheduledAt.toISOString()),
  })
}
