import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { sanitizeText, rateLimit } from '@/lib/security'
import { parseTimes } from '@/lib/parse-times'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk, readJson, audit, parseJsonCol, checkConsent, validateBody, isResponseError } from '@/lib/api-helpers'
import { createMedicationSchema } from '@/lib/schemas'
import { todayStr } from '@/lib/utils'
export const dynamic = 'force-dynamic'

async function assertMemberOwned(memberId: string, callerId: string) {
  const member = await db.familyMember.findUnique({
    where: { id: memberId },
    include: { family: true },
  })
  if (!member) return { error: 'Member not found' as const, member: null }
  // Allow: family owner, any family member with caretaker role, or the member's own user record
  const isOwner = member.family.ownerId === callerId
  if (isOwner) return { error: null, member }
  const callerMembership = await db.familyMember.findFirst({
    where: { familyId: member.familyId, userId: callerId },
    select: { role: true },
  })
  const callerRole = callerMembership?.role ?? 'viewer'
  if (callerRole === 'caretaker') return { error: null, member }
  // Allow member to view their own record
  if (member.userId === callerId) return { error: null, member }
  return { error: 'Forbidden' as const, member: null }
}

// GET /api/family/members/[id] — member detail + meds + today's reminders.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  const u = user!

  const consentErr = checkConsent(u)
  if (consentErr) return consentErr

  const { id } = await params
  const { error, member } = await assertMemberOwned(id, u.id)
  if (error || !member) return jsonError(error, error === 'Forbidden' ? 403 : 404)

  const meds = await db.medication.findMany({ where: { familyMemberId: id }, orderBy: { createdAt: 'desc' } })
  const medIds = meds.map((m) => m.id)
  const todayReminders = medIds.length
    ? await db.reminder.findMany({
        where: { medicationId: { in: medIds }, date: todayStr() },
        include: { medication: true },
        orderBy: { time: 'asc' },
      })
    : []

  return jsonOk({
    id: member.id,
    name: member.name,
    relation: member.relation,
    age: member.age,
    role: member.role,
    color: member.color,
    conditions: parseJsonCol(member.conditions, []),
    photoUrl: member.photoUrl,
    medications: meds.map((m) => ({ ...m, times: parseTimes(m.times) })),
    reminders: todayReminders,
  })
}

// POST /api/family/members/[id] — add a medication for this family member.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!

  const consentErr = checkConsent(u)
  if (consentErr) return consentErr

  const { id } = await params
  const { error, member } = await assertMemberOwned(id, u.id)
  if (error || !member) return jsonError(error, error === 'Forbidden' ? 403 : 404)

  // Validate body with Zod schema — use the family-member variant (no
  // familyMemberId in request; it's taken from the URL param).
  const rawBody = await readJson(req)
  if (!rawBody) return jsonError('Invalid JSON', 400, 'INVALID_JSON')
  const parsed = createMedicationSchema.safeParse({ ...rawBody, familyMemberId: id })
  if (!parsed.success) {
    const fields: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      fields[String(issue.path.join('.') || 'body')] = issue.message
    }
    return jsonError('Validation failed', 422, 'VALIDATION_ERROR', { fields })
  }
  const body = parsed.data

  // Free-tier cap: same as POST /api/medications.
  const FREE_MED_LIMIT = 3
  const existingCount = await db.medication.count({
    where: { familyMemberId: id, active: true },
  })
  if (existingCount >= FREE_MED_LIMIT) {
    return jsonError(
      `Free tier allows up to ${FREE_MED_LIMIT} medications per family member.`,
      403,
    )
  }

  const med = await db.medication.create({
    data: {
      familyMemberId: id,
      userId: null,
      name:       sanitizeText(body.name, 120),
      dosage:     sanitizeText(body.dosage, 60),
      times:      JSON.stringify(body.times),
      frequency:  sanitizeText(body.frequency, 60) || 'Daily',
      instructions: body.instructions || null,
      color:      sanitizeText(body.color, 30) || 'emerald',
      active:     true,
    },
  })

  await logAudit(u.id, 'family.member.med.add', `member=${id} med=${med.id}`)
  return jsonOk({ ...med, times: parseTimes(med.times) })
}

// DELETE /api/family/members/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!

  const consentErr = checkConsent(u)
  if (consentErr) return consentErr

  const { id } = await params
  const { error, member } = await assertMemberOwned(id, u.id)
  if (error || !member) return jsonError(error, error === 'Forbidden' ? 403 : 404)

  // Only the family owner may remove a member — the owner purchases and
  // manages the Family Pro plan.
  if (member.family.ownerId !== u.id) {
    return jsonError('Only the family owner can remove a member', 403)
  }

  // Removal is a hard revoke for the removed member's linked account:
  //  1) sign out all Supabase sessions (kills every device immediately),
  //  2) insert a revoked_sessions row (7-day TTL) so the local
  //     kynthai-session cookie is invalidated too and their next login
  //     shows the "removed from Family Pro" screen,
  //  3) drop their subscriptionTier to free if it was family_pro.
  if (member.userId) {
    try {
      const { getSupabaseAdmin } = await import('@/lib/storage')
      await getSupabaseAdmin().auth.admin.signOut(member.userId)
    } catch (e) {
      console.error('[family] admin signOut failed for removed member:', e)
    }
    try {
      await db.revokedSession.create({
        data: {
          userId: member.userId,
          sessionJti: `family-removed-${member.id}-${Date.now()}`,
          reason: 'family_removed',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      })
    } catch (e) {
      console.error('[family] revokedSession insert failed for removed member:', e)
    }
    try {
      await db.$executeRawUnsafe(
        `UPDATE "users" SET "subscriptionTier" = 'free' WHERE id = $1 AND "subscriptionTier" = 'family_pro'`,
        member.userId
      )
    } catch (e) {
      console.error('[family] subscription downgrade failed for removed member:', e)
    }
  }

  await db.familyMember.delete({ where: { id } })
  await logAudit(u.id, 'family.member.delete', `member=${id} removedUserId=${member.userId ?? 'none'}`)
  return jsonOk({ success: true })
}
