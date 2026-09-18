import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import { requireAuth, jsonError, jsonOk } from '@/lib/api-helpers'
import { doctorLoyaltyTier, effectiveFeePct, DOCTOR_BASE_FEE_PCT } from '@/lib/commission'
import { getDoctorTierConfig } from '@/lib/doctor-subscription'
import { isDemoUser } from '@/lib/demo-mode'
import { ensureDemoDoctorProfile } from '@/lib/demo-profiles'
export const dynamic = 'force-dynamic'

// GET /api/doctors/dashboard
// Returns comprehensive doctor dashboard with real metrics.
export async function GET(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  if (user.role !== 'doctor') return jsonError('Forbidden — doctor portal access only', 403)
  const u = user!

  await logAudit(user.id, 'doctor.dashboard.read', { resourceType: 'DoctorProfile' })

  let profile = await db.doctorProfile.findUnique({ where: { userId: u.id }, include: { user: true } })
  // Demo accounts are seeded without a provider profile; backfill it so the
  // portal renders instead of dead-ending on a 404. Real accounts are untouched.
  if (!profile && isDemoUser(u)) {
    await ensureDemoDoctorProfile(u.id)
    profile = await db.doctorProfile.findUnique({ where: { userId: u.id }, include: { user: true } })
  }
  if (!profile) return jsonError('Doctor profile not found. Submit verification first.', 404)
  if (!profile.verified) return jsonError('Your profile is pending verification. Please wait for admin approval.', 403)

  const tierConfig = getDoctorTierConfig(profile.subscriptionTier)

  // ── Appointments ────────────────────────────────────────────────────────
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1)

  const appointments = await db.appointment.findMany({
    where: { doctorId: profile.id },
    include: { patient: true },
    orderBy: { scheduledAt: 'desc' },
    take: 200,
  })

  const todayAppts = appointments.filter((a: any) => {
    const d = new Date(a.scheduledAt)
    return d >= todayStart && d < todayEnd && (a.status === 'pending' || a.status === 'confirmed')
  })

  const completed = appointments.filter((a: any) => a.status === 'completed')
  const upcoming = appointments.filter((a: any) => a.status === 'pending' || a.status === 'confirmed')
  const pending = appointments.filter((a: any) => a.status === 'pending')
  const cancelled = appointments.filter((a: any) => a.status === 'cancelled')
  const lifetimeCompleted = completed.length
  const loyalty = doctorLoyaltyTier(lifetimeCompleted)

  // ── Revenue Analytics ───────────────────────────────────────────────────
  const thisMonthAppts = completed.filter((a: any) => new Date(a.scheduledAt) >= monthStart)
  const lastMonthAppts = completed.filter((a: any) => {
    const d = new Date(a.scheduledAt)
    return d >= lastMonthStart && d < lastMonthEnd
  })

  const thisMonthEarnings = thisMonthAppts.reduce((s: number, a: any) => s + a.price - a.commission, 0)
  const lastMonthEarnings = lastMonthAppts.reduce((s: number, a: any) => s + a.price - a.commission, 0)
  const totalEarnings = completed.reduce((s: number, a: any) => s + a.price - a.commission, 0)
  const pendingPayout = upcoming.reduce((s: number, a: any) => s + a.price, 0)

  const revenueChange = lastMonthEarnings > 0
    ? Math.round(((thisMonthEarnings - lastMonthEarnings) / lastMonthEarnings) * 100)
    : thisMonthEarnings > 0 ? 100 : 0

  // ── Patients ────────────────────────────────────────────────────────────
  const patientsMap = new Map<string, { id: string; name: string; email: string; visits: number; lastVisit: string | null }>()
  for (const a of appointments) {
    const p = patientsMap.get(a.patientId)
    if (p) {
      p.visits += 1
      if (!p.lastVisit || a.scheduledAt > new Date(p.lastVisit)) p.lastVisit = a.scheduledAt.toISOString()
    } else {
      patientsMap.set(a.patientId, {
        id: a.patientId,
        name: a.patient.name ?? 'Unknown',
        email: a.patient.email ?? '',
        visits: 1,
        lastVisit: a.scheduledAt.toISOString(),
      })
    }
  }
  const patients = Array.from(patientsMap.values())

  // ── Prescriptions ───────────────────────────────────────────────────────
  const prescriptions = await db.prescription.findMany({
    where: { doctorId: profile.id },
    include: { patient: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const thisMonthRx = prescriptions.filter((p: any) => new Date(p.createdAt) >= monthStart)
  const rxWithFollowUp = prescriptions.filter((p: any) => p.followUpDate)
  const overdueFollowUps = prescriptions.filter((p: any) => {
    if (!p.followUpDate) return false
    return new Date(p.followUpDate) < now && p.status !== 'completed'
  })

  // ── Prescription Analytics (Pro feature) ────────────────────────────────
  let prescriptionAnalytics = null
  if (tierConfig.advancedAnalytics) {
    const medCounts: Record<string, number> = {}
    for (const rx of prescriptions) {
      const meds = JSON.parse(rx.medications || '[]') as Array<{ name: string }>
      for (const m of meds) {
        medCounts[m.name] = (medCounts[m.name] || 0) + 1
      }
    }
    const topMeds = Object.entries(medCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }))

    prescriptionAnalytics = {
      totalPrescriptions: prescriptions.length,
      thisMonth: thisMonthRx.length,
      topMedications: topMeds,
      followUpCompletionRate: rxWithFollowUp.length > 0
        ? Math.round(((rxWithFollowUp.length - overdueFollowUps.length) / rxWithFollowUp.length) * 100)
        : 100,
      overdueFollowUps: overdueFollowUps.length,
    }
  }

  // ── Patient Adherence (from reminders) ──────────────────────────────────
  let adherenceMetrics = null
  if (tierConfig.advancedAnalytics) {
    const patientIds = patients.map(p => p.id)
    const reminders = await db.reminder.findMany({
      where: {
        medication: { userId: { in: patientIds } },
        date: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] },
      },
      take: 1000,
    })

    const totalReminders = reminders.length
    const takenReminders = reminders.filter((r: any) => r.status === 'taken').length
    const avgAdherence = totalReminders > 0 ? Math.round((takenReminders / totalReminders) * 100) : 0

    const lowAdherencePatients = patients.filter(p => {
      const patientReminders = reminders.filter((r: any) => {
        const med = prescriptions.find((rx: any) => rx.id === r.medicationId)
        return med?.patientId === p.id
      })
      if (patientReminders.length === 0) return false
      const taken = patientReminders.filter((r: any) => r.status === 'taken').length
      return (taken / patientReminders.length) < 0.6
    })

    adherenceMetrics = {
      averageAdherence: avgAdherence,
      totalReminders,
      takenReminders,
      lowAdherenceCount: lowAdherencePatients.length,
      lowAdherencePatients: lowAdherencePatients.map(p => ({ id: p.id, name: p.name })),
    }
  }

  // ── Actionable Alerts ───────────────────────────────────────────────────
  const alerts: Array<{ type: string; severity: string; message: string; count: number }> = []

  if (pending.length > 0) {
    alerts.push({
      type: 'pending_appointments',
      severity: 'high',
      message: `${pending.length} appointment${pending.length > 1 ? 's' : ''} waiting for your confirmation`,
      count: pending.length,
    })
  }

  if (todayAppts.length > 0) {
    alerts.push({
      type: 'today_appointments',
      severity: 'medium',
      message: `${todayAppts.length} appointment${todayAppts.length > 1 ? 's' : ''} scheduled today`,
      count: todayAppts.length,
    })
  }

  if (overdueFollowUps.length > 0) {
    alerts.push({
      type: 'overdue_followups',
      severity: 'high',
      message: `${overdueFollowUps.length} patient${overdueFollowUps.length > 1 ? 's' : ''} overdue for follow-up`,
      count: overdueFollowUps.length,
    })
  }

  if (adherenceMetrics && adherenceMetrics.lowAdherenceCount > 0) {
    alerts.push({
      type: 'low_adherence',
      severity: 'medium',
      message: `${adherenceMetrics.lowAdherenceCount} patient${adherenceMetrics.lowAdherenceCount > 1 ? 's' : ''} below 60% adherence`,
      count: adherenceMetrics.lowAdherenceCount,
    })
  }

  const cancelledToday = cancelled.filter((a: any) => {
    const d = new Date(a.updatedAt || a.scheduledAt)
    return d >= todayStart && d < todayEnd
  })
  if (cancelledToday.length > 0) {
    alerts.push({
      type: 'cancelled_today',
      severity: 'low',
      message: `${cancelledToday.length} cancellation${cancelledToday.length > 1 ? 's' : ''} today`,
      count: cancelledToday.length,
    })
  }

  // ── Today's Priority List ───────────────────────────────────────────────
  const priorityList = [
    ...pending.map((a: any) => ({
      type: 'confirm_appointment' as const,
      priority: 'high' as const,
      patientName: a.patient.name,
      patientId: a.patientId,
      message: `Confirm appointment for ${a.patient.name}`,
      scheduledAt: a.scheduledAt.toISOString(),
      appointmentId: a.id,
    })),
    ...todayAppts.map((a: any) => ({
      type: 'today_appointment' as const,
      priority: 'medium' as const,
      patientName: a.patient.name,
      patientId: a.patientId,
      message: `${a.type === 'video' ? 'Video' : 'In-person'} with ${a.patient.name} at ${new Date(a.scheduledAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
      scheduledAt: a.scheduledAt.toISOString(),
      appointmentId: a.id,
    })),
    ...overdueFollowUps.slice(0, 5).map((rx: any) => ({
      type: 'overdue_followup' as const,
      priority: 'high' as const,
      patientName: rx.patient.name,
      patientId: rx.patientId,
      message: `Follow-up overdue for ${rx.patient.name}`,
      scheduledAt: rx.followUpDate?.toISOString() ?? '',
      prescriptionId: rx.id,
    })),
  ].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })

  return jsonOk({
    profile: {
      id: profile.id,
      userId: profile.userId,
      name: profile.user.name,
      email: profile.user.email,
      specialization: profile.specialization,
      licenseNumber: profile.licenseNumber,
      experience: profile.experience,
      consultationFee: profile.consultationFee,
      city: profile.city,
      bio: profile.bio,
      videoCallEnabled: profile.videoCallEnabled,
      verified: profile.verified,
      verificationStatus: profile.verificationStatus,
      rejectionReason: profile.rejectionReason,
      rating: profile.rating,
      reviewCount: profile.reviewCount,
      subscriptionTier: profile.subscriptionTier,
      patientSlotCap: profile.patientSlotCap,
      avatarColor: profile.avatarColor,
    },
    stats: {
      appointmentsTotal: appointments.length,
      today: todayAppts.length,
      upcoming: upcoming.length,
      pending: pending.length,
      completed: lifetimeCompleted,
      cancelled: cancelled.length,
      patients: patients.length,
      prescriptions: prescriptions.length,
    },
    revenue: {
      thisMonth: thisMonthEarnings,
      lastMonth: lastMonthEarnings,
      total: totalEarnings,
      pendingPayout,
      changePercent: revenueChange,
      currency: 'USD',
    },
    loyalty: {
      tier: loyalty.tier,
      lifetimeCompleted,
      nextThreshold: loyalty.nextThreshold,
      progress: loyalty.progress,
    },
    subscription: {
      tier: profile.subscriptionTier,
      config: tierConfig,
    },
    alerts,
    priorityList,
    prescriptionAnalytics,
    adherenceMetrics,
    appointments: appointments.slice(0, 50).map((a: any) => ({
      id: a.id,
      patientId: a.patientId,
      patientName: a.patient.name,
      scheduledAt: a.scheduledAt.toISOString(),
      type: a.type,
      status: a.status,
      price: a.price,
      commission: a.commission,
      reason: a.reason,
    })),
    patients,
    prescriptions: prescriptions.slice(0, 50).map((p: any) => ({
      id: p.id,
      patientId: p.patientId,
      patientName: p.patient.name,
      medications: JSON.parse(p.medications || '[]'),
      notes: p.notes,
      followUpDate: p.followUpDate?.toISOString() ?? null,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
    })),
  })
}
