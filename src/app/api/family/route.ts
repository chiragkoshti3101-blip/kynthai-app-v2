import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sanitizeText, rateLimit } from '@/lib/security'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk, readJson, audit, parseJsonCol, checkConsent } from '@/lib/api-helpers'
import { logAudit } from '@/lib/auth'
import { todayStr } from '@/lib/utils'
export const dynamic = 'force-dynamic'

// SECURITY-CRITICAL: only caretaker, owner, and admin roles can manage family data.
// Patients, doctors, and labs must NOT access family member records.
const FAMILY_ACCESS_ROLES = ['caretaker', 'owner', 'admin'] as const

function assertFamilyRole(u: { role: string }): NextResponse | null {
  if (!FAMILY_ACCESS_ROLES.includes(u.role as any)) {
    return jsonError('Forbidden — family management requires the caretaker or admin role', 403)
  }
  return null
}

// GET /api/family — returns the caller's family + members + stats.
// Authorization: family owner OR any verified family member.
export async function GET(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  const u = user!

  // Audit: this sensitive health data access
  await logAudit(user.id, 'family.read', { resourceType: 'Family' })

  // SECURITY-CRITICAL: reject non-caretaker / non-admin roles
  const roleErr = assertFamilyRole(u)
  if (roleErr) return roleErr

  const consentErr = checkConsent(u)
  if (consentErr) return consentErr

  // Support both owner-based and member-based family lookup
  const ownedFamily = await db.family.findFirst({
    where: { ownerId: u.id },
    include: {
      members: { include: { medications: true, user: { include: { medications: true } } } },
      alerts: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  } as any) as any

  let targetFamily = ownedFamily
  if (!ownedFamily) {
    const membership = (await db.familyMember.findFirst({
      where: { userId: u.id },
    })) as any

    if (membership) {
      targetFamily = (await db.family.findFirst({
        where: { id: membership.familyId },
        include: {
          members: { include: { medications: true, user: { include: { medications: true } } } },
          alerts: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
      } as any)) as any
    }
  }

  if (!targetFamily) {
    return jsonOk({ family: null, members: [], stats: { members: 0, medications: 0, activeAlerts: 0, takenToday: 0, todayTotal: 0 } })
  }

  const today = todayStr()
  // ponytail: count medications from BOTH FamilyMember.medications AND linked User.medications
  const allMemberMeds = (targetFamily.members as any[]).flatMap((m: any) => [
    ...(m.medications as any[]),
    ...((m.user?.medications as any[]) ?? []),
  ])
  const medIds = allMemberMeds.map((med: any) => med.id)
  const todayReminders = medIds.length
    ? await db.reminder.findMany({ where: { medicationId: { in: medIds }, date: today } })
    : []
  const takenToday = todayReminders.filter((r: any) => r.status === 'taken').length

  const stats = {
    members: (targetFamily.members as any[]).length,
    medications: medIds.length,
    activeAlerts: (targetFamily.alerts as any[]).filter((a: any) => a.status === 'active').length,
    takenToday,
    todayTotal: todayReminders.length,
  }

  return jsonOk({
    family: {
      id: targetFamily.id,
      name: targetFamily.name,
      ownerId: targetFamily.ownerId,
      createdAt: targetFamily.createdAt.toISOString(),
    },
    members: (targetFamily.members as any[]).map((m: any) => ({
      id: m.id,
      name: m.name,
      relation: m.relation,
      age: m.age,
      role: m.role,
      color: m.color,
      conditions: parseJsonCol(m.conditions, []),
      photoUrl: m.photoUrl,
      // Pending invitees have no account phone yet; linked members expose the
      // phone they entered on their own account to authorized family managers.
      phone: m.user?.phone ?? undefined,
      // ponytail: count medications from both FamilyMember and linked User
      medicationsCount: (m.medications as any[]).length + ((m.user?.medications as any[])?.length ?? 0),
    })),
    alerts: targetFamily.alerts,
    stats,
  })
}

// POST /api/family — create a family for the caller.
export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!

  // SECURITY-CRITICAL: reject non-caretaker / non-admin roles
  const roleErr = assertFamilyRole(u)
  if (roleErr) return roleErr

  const consentErr = checkConsent(u)
  if (consentErr) return consentErr

  const body = await readJson<{ name?: string }>(req)
  if (!body) return jsonError('Invalid JSON', 400)
  const name = sanitizeText(body.name, 120) || `${u.name}'s Family`

  const existing = await db.family.findFirst({ where: { ownerId: u.id } })
  if (existing) return jsonError('You already have a family', 409)

  const family = await db.family.create({ data: { name, ownerId: u.id } })
  await logAudit(u.id, 'family.create', `family=${family.id}`)
  return jsonOk({ id: family.id, name: family.name, ownerId: family.ownerId })
}
