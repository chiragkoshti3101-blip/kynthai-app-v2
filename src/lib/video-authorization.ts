import { db } from '@/lib/db'

/** Authorize both token issuance and the actual signaling transport identically. */
export async function canJoinAppointment(user: { id: string; role: string }, appointmentId: string): Promise<boolean> {
  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { patientId: true, doctorId: true, status: true, deletedAt: true },
  })
  if (!appointment || appointment.deletedAt || !['confirmed', 'rescheduled'].includes(appointment.status)) return false
  if (appointment.patientId === user.id) return true
  if (user.role === 'doctor') {
    const doctor = await db.doctorProfile.findUnique({ where: { userId: user.id }, select: { id: true, verified: true } })
    return Boolean(doctor?.verified && doctor.id === appointment.doctorId)
  }
  // Family access is an explicit accepted caretaker relationship, not mere
  // membership (or a pending invite) in the patient's family.
  const memberships = await db.familyMember.findMany({
    where: { userId: user.id, role: 'caretaker', inviteStatus: 'accepted' },
    select: { familyId: true },
  })
  if (!memberships.length) return false
  return Boolean(await db.familyMember.findFirst({
    where: { familyId: { in: memberships.map(m => m.familyId) }, userId: appointment.patientId, inviteStatus: 'accepted' },
    select: { id: true },
  }))
}
