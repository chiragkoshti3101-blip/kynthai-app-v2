import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { sanitizeText, rateLimit } from '@/lib/security'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk, readJson, audit, checkConsent } from '@/lib/api-helpers'
import { createMemberSchema, familyMembersQuerySchema } from '@/lib/schemas'
export const dynamic = 'force-dynamic'

// POST /api/family/members — add a member to the caller's family.
// Authorization: family owner or a caretaker can add members.
export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!

  const consentErr = checkConsent(u)
  if (consentErr) return consentErr

  const rawBody = await readJson(req)
  if (!rawBody) return jsonError('Invalid JSON', 400, 'INVALID_JSON')
  const memberResult = createMemberSchema.safeParse(rawBody)
  if (!memberResult.success) {
    const fields: Record<string, string> = {}
    for (const issue of memberResult.error.issues) {
      fields[String(issue.path.join('.') || 'body')] = issue.message
    }
    return jsonError('Validation failed', 422, 'VALIDATION_ERROR', { fields })
  }
  const body = memberResult.data
  const name = (body.name as string).trim()
  if (!name) return jsonError('Member name is required', 400, 'VALIDATION_ERROR')

  // COMPLIANCE (COPPA/family governance): minors (age < 18) require documented
  // parental consent in the form of guardianName and explicit parentalConsentGiven.
  const memberAge: number | null = body.age !== undefined && body.age !== null
    ? Number(body.age) : null
  if (memberAge !== null && memberAge < 18) {
    if (!(body as Record<string, unknown>).parentalConsentGiven) {
      return jsonError(
        'Parental or guardian consent is required to add a family member under 18. ' +
        'Provide parentalConsentGiven=true and guardianName to proceed.',
        403,
        'PARENTAL_CONSENT_REQUIRED',
      )
    }
    const guardianName = (body as Record<string, unknown>).guardianName
      ? String((body as Record<string, unknown>).guardianName).trim() : ''
    if (!guardianName) {
      return jsonError(
        'guardianName (legal name of parent/guardian) is required when adding a member under 18.',
        400,
        'GUARDIAN_NAME_REQUIRED',
      )
    }
    await logAudit(u.id, 'family.member.add.minor', `member=${name} guardian=${guardianName}`)
  }

  let family = body.familyId
    ? await db.family.findUnique({ where: { id: body.familyId } })
    : await db.family.findFirst({ where: { ownerId: u.id } })
  if (!family) {
    family = await db.family.create({ data: { name: `${u.name}'s Family`, ownerId: u.id } })
  }

  // Permission check: must be owner or have manage_members permission
  const isOwner = family.ownerId === u.id
  if (!isOwner) {
    const memberRecord = await db.familyMember.findFirst({
      where: { familyId: family.id, userId: u.id }
    })
    const memberRole = memberRecord?.role ?? 'viewer'
    const canManage = memberRole === 'caretaker' || memberRole === 'owner'
    if (!canManage) {
      return jsonError('Forbidden — you do not have permission to add members to this family', 403)
    }
  }

  // Family Pro cap: a family holds at most 4 members (matches the invite
  // route and the caretaker UI). Enforce here too so the direct-add path
  // can't bypass the limit.
  const memberCount = await db.familyMember.count({ where: { familyId: family.id } });
  if (memberCount >= 4) {
    return jsonError('Maximum 4 family members', 400);
  }

  const member = await db.familyMember.create({
    data: {
      familyId: family.id,
      userId: body.userId || null,
      name,
      relation: sanitizeText(body.relation, 60) || 'self',
      age: Number(body.age) || null,
      role: sanitizeText(body.role, 30) || 'patient',
      color: sanitizeText(body.color, 30) || 'emerald',
      conditions: JSON.stringify(Array.isArray(body.conditions) ? body.conditions : []),
      photoUrl: sanitizeText(body.photoUrl, 500) || null,
    },
  })

  await logAudit(u.id, 'family.member.add', `member=${member.id} family=${family.id}`)
  return jsonOk(member)
}
