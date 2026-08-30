import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { sanitizeText, rateLimit } from '@/lib/security'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk, readJson, audit, parseJsonCol } from '@/lib/api-helpers'
import { sendEmergency } from '@/lib/notifications'
export const dynamic = 'force-dynamic'

// SECURITY-CRITICAL: only caretaker and admin roles can manage family emergency alerts.
const EMERGENCY_ACCESS_ROLES = ['caretaker', 'admin'] as const

function assertEmergencyRole(u: { role: string }): NextResponse | null {
  if (!EMERGENCY_ACCESS_ROLES.includes(u.role as any)) {
    return jsonError('Forbidden — emergency management requires the caretaker or admin role', 403)
  }
  return null
}

// GET /api/emergency?familyId=...&status=active
export async function GET(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  const u = user!

  // SECURITY-CRITICAL: only caretaker / admin may view emergency alerts
  const roleErr = assertEmergencyRole(u)
  if (roleErr) return roleErr

  const family = await db.family.findFirst({ where: { ownerId: u.id } })
  if (!family) return jsonOk({ alerts: [] })

  const alerts = await db.emergencyAlert.findMany({
    where: { familyId: family.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return jsonOk({
    alerts: alerts.map((a) => ({
      id: a.id,
      familyId: a.familyId,
      memberId: (a as any).familyMemberId,
      memberName: a.memberName,
      type: a.type,
      tier: a.tier,
      location: a.location,
      notes: a.notes,
      status: a.status,
      notifiedDoctors: parseJsonCol(a.notifiedDoctors, []),
      createdAt: a.createdAt.toISOString(),
      resolvedAt: a.resolvedAt?.toISOString() ?? null,
    })),
  })
}

// POST /api/emergency — trigger an SOS
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 10, 60000)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!

  // SECURITY-CRITICAL: only caretaker / admin may create emergency alerts
  const roleErr = assertEmergencyRole(u)
  if (roleErr) return roleErr

  const body = await readJson<{
    familyId?: string
    memberId?: string
    memberName?: string
    type?: string
    tier?: string
    location?: string
    notes?: string
  }>(req)
  if (!body) return jsonError('Invalid JSON', 400)

  let family = body.familyId
    ? await db.family.findUnique({ where: { id: body.familyId } })
    : await db.family.findFirst({ where: { ownerId: u.id } })
  if (!family) return jsonError('Family not found. Create a family first.', 404)
  if (family.ownerId !== u.id) return jsonError('Forbidden', 403)

  const memberId = sanitizeText(body.memberId, 100) || 'self'
  const memberName = sanitizeText(body.memberName, 120) || u.name
  const notes = sanitizeText(body.notes, 1000)
  const location = sanitizeText(body.location, 300)
  const alertType = sanitizeText(body.type, 30) || 'sos'
  const tier = sanitizeText(body.tier, 30) || 'critical' // critical | family

  // Notify doctors who have previously treated this family (via appointments).
  const patientUserIds = await db.user.findMany({
    where: { memberships: { some: { familyId: family.id } } },
    select: { id: true },
  })
  const linkedAppts = patientUserIds.length
    ? await db.appointment.findMany({
        where: { patientId: { in: patientUserIds.map((p) => p.id) }, status: 'completed' },
        include: { doctor: { include: { user: true } } },
      })
    : []
  // doctorProfileId -> { userId, email }  (userId needed by sendEmergency → loadUserTarget)
  const doctorMap = new Map<string, { userId: string; email: string }>()
  for (const a of linkedAppts) {
    if (!doctorMap.has(a.doctor.id)) {
      doctorMap.set(a.doctor.id, { userId: a.doctor.user.id, email: a.doctor.user.email })
    }
  }
  const notifiedDoctors = Array.from(doctorMap.entries()).map(([id, d]) => ({ id, email: d.email }))
  const notifiedDoctorUserIds = Array.from(doctorMap.values()).map((d) => d.userId)

  const alert = await db.emergencyAlert.create({
    data: {
      familyId: family.id,
      familyMemberId: memberId === 'self' ? null : (memberId as string),
      memberName,
      reporterId: u.id,
      type: alertType,
      tier,
      location,
      notes,
      status: 'active',
      notifiedDoctors: JSON.stringify(notifiedDoctors),
    } as any,
  })

  // Best-effort: actually broadcast the SOS by in-app/email only to the reporter + every linked doctor.
  // sendEmergency() fans out to each notified doctor userId internally.
  try {
    await sendEmergency(u.id, memberName ?? '', notes ?? '', notifiedDoctorUserIds, {
      email: u.email,
      phone: null,
    }, `emergency:${alert.id}`)
  } catch { /* best-effort — sendNotification logs internally */ }

  await logAudit(u.id, 'emergency.sos', `alert=${alert.id} notified=${notifiedDoctors.length}`)
  return jsonOk({
    id: alert.id,
    status: 'active',
    notifiedDoctors,
    createdAt: alert.createdAt.toISOString(),
  })
}

// PUT /api/emergency — resolve an active alert.
export async function PUT(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!

  // SECURITY-CRITICAL: only caretaker / admin may resolve emergency alerts
  const roleErr = assertEmergencyRole(u)
  if (roleErr) return roleErr

  const body = await readJson<{ id?: string; status?: string; notes?: string }>(req)
  if (!body?.id) return jsonError('id is required', 400)

  const alert = await db.emergencyAlert.findUnique({ where: { id: body.id }, include: { family: true } })
  if (!alert) return jsonError('Alert not found', 404)
  if (alert.family.ownerId !== u.id && u.role !== 'admin') {
    return jsonError('Forbidden', 403)
  }

  const updated = await db.emergencyAlert.update({
    where: { id: alert.id },
    data: {
      status: sanitizeText(body.status, 30) || 'resolved',
      resolvedAt: new Date(),
      notes: body.notes ? sanitizeText(body.notes, 1000) : alert.notes,
    },
  })

  await logAudit(u.id, 'emergency.resolve', `alert=${alert.id} status=${updated.status}`)
  return jsonOk(updated)
}
