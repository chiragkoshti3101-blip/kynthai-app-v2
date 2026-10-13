import { NextRequest, NextResponse } from 'next/server'
import { requireAuthWithCsrf, jsonError, jsonOk, audit } from '@/lib/api-helpers'
import { logAudit } from '@/lib/auth'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { sanitizeText, isValidE164 } from '@/lib/security'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(30).optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  state: z.string().length(2).optional().nullable(),
})

// PATCH /api/user/account — update profile info
export async function PATCH(req: NextRequest) {
  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!

  const body = await req.json().catch(() => null)
  const parsed = UpdateProfileSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError('Invalid input', 400, 'VALIDATION_ERROR')
  }

  const updates: Record<string, unknown> = {}

  if (parsed.data.name !== undefined) {
    updates.name = sanitizeText(parsed.data.name, 120)
  }
  if (parsed.data.phone !== undefined) {
    if (parsed.data.phone && !isValidE164(parsed.data.phone)) {
      return jsonError('Phone must be in E.164 format (e.g. +15551234567)', 400)
    }
    updates.phone = parsed.data.phone || null
  }
  if (parsed.data.state !== undefined) {
    if (parsed.data.state) {
      const st = parsed.data.state.toUpperCase()
      if (!/^[A-Z]{2}$/.test(st)) return jsonError('State must be a 2-letter US state code', 400)
      updates.state = st
    } else {
      updates.state = null
    }
  }

  if (parsed.data.dateOfBirth !== undefined) {
    if (parsed.data.dateOfBirth) {
      const dob = new Date(parsed.data.dateOfBirth)
      if (isNaN(dob.getTime())) return jsonError('Invalid date of birth', 400)
      updates.dateOfBirth = dob
    } else {
      updates.dateOfBirth = null
    }
  }

  if (Object.keys(updates).length === 0) {
    return jsonError('No valid fields to update', 400)
  }

  // Self-heal: ensure the state column exists (raw SQL, idempotent) so this
  // typed write works even before migrations run in production.
  if (updates.state !== undefined) {
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "state" TEXT`)
    } catch {
      return jsonError('Could not update profile right now', 500)
    }
  }

  try {
    const updated = await db.user.update({
      where: { id: user.id },
      data: updates,
    })

    await logAudit(user.id, 'profile.update', `fields=${Object.keys(updates).join(',')}`)

    return jsonOk({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      dateOfBirth: updated.dateOfBirth?.toISOString() ?? null,
      state: updated.state,
    })
  } catch (error) {
    logger.phiSafeError(error, 'user.account.PATCH')
    return jsonError('Failed to update profile', 500)
  }
}

// DELETE /api/user/account
// US privacy right to erasure — permanently deletes the user's account and all associated data.
// Requires CSRF protection + explicit confirmation in the body.
// Deletes in dependency order (children first). Cascade rules handle most FKs,
// but we delete explicitly to ensure complete erasure.
export async function DELETE(req: NextRequest) {
  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!

  const body = await req.json().catch(() => null)
  if (!body || body.confirm !== 'DELETE_MY_ACCOUNT') {
    return jsonError('Confirmation required: send { confirm: "DELETE_MY_ACCOUNT" }', 400)
  }

  try {
    const userId = u.id

    // Delete in dependency order (children first due to FK constraints).
    await db.chatMessage.deleteMany({ where: { userId } })
    await db.notificationLog.deleteMany({ where: { userId } })
    await db.reminder.deleteMany({
      where: { medication: { userId } },
    })
    await db.medicineInventory.deleteMany({ where: { userId } })
    await db.medication.deleteMany({ where: { userId } })
    await db.medicineOrder.deleteMany({ where: { patientId: userId } })
    await db.appointment.deleteMany({ where: { patientId: userId } })
    await db.labBooking.deleteMany({ where: { patientId: userId } })
    await db.prescription.deleteMany({ where: { patientId: userId } })
    await db.chronicCondition.deleteMany({ where: { patientId: userId } })
    await db.payment.deleteMany({ where: { userId } })
    await db.consultationNote.deleteMany({ where: { OR: [{ patientId: userId }, { doctorId: userId }] } })
    await db.healthScore.deleteMany({ where: { userId } })
    await db.healthJournal.deleteMany({ where: { userId } })
    await db.userStreak.deleteMany({ where: { userId } })
    await db.userBadge.deleteMany({ where: { userId } })
    await db.prescriptionIntelligence.deleteMany({ where: { userId } })
    await db.emergencyAlert.deleteMany({ where: { reporterId: userId } })

    // FamilyHealthAlert is not FK-cascaded; delete manually before family cleanup.
    const ownedFamilyIds = await db.family.findMany({ where: { ownerId: userId }, select: { id: true } }).then((f) => f.map((f) => f.id))
    const memberIds = await db.familyMember.findMany({ where: { userId }, select: { id: true } }).then((m) => m.map((m) => m.id))
    if (ownedFamilyIds.length || memberIds.length) {
      await db.familyHealthAlert.deleteMany({
        where: {
          OR: [
            { familyId: { in: ownedFamilyIds } },
            { memberId: { in: memberIds } },
          ],
        },
      })
    }

    // Family: if user is a family owner, delete the family (cascades to members).
    // If user is a family member, remove them from the family.
    const ownedFamily = await db.family.findFirst({ where: { ownerId: userId } })
    if (ownedFamily) {
      await db.family.delete({ where: { id: ownedFamily.id } })
    } else {
      const memberships = await db.familyMember.findMany({
        where: { userId },
        include: { family: true },
      })
      for (const m of memberships) {
        // If this is the last member, delete the family too.
        const remaining = await db.familyMember.count({ where: { familyId: m.familyId } })
        if (remaining <= 1) {
          await db.family.delete({ where: { id: m.familyId } })
        } else {
          await db.familyMember.delete({ where: { id: m.id } })
        }
      }
    }

    // Delete doctor/lab profiles if user has one.
    await db.doctorProfile.deleteMany({ where: { userId } })
    await db.labProfile.deleteMany({ where: { userId } })

    // Delete referral activity linked to this user (as referrer or referred).
    await db.referralUsage.deleteMany({ where: { OR: [{ usedById: userId }, { referrerId: userId }] } })
    await db.referral.deleteMany({ where: { referrerId: userId } })

    // Operational audit logs — included to satisfy right to erasure.
    await db.auditLog.deleteMany({ where: { userId } })

    // Finally delete the user record.
    await db.user.delete({ where: { id: userId } })

    await logAudit(userId, 'account.delete', 'full-erasure')
    return jsonOk({ success: true, message: 'Account and all associated data permanently deleted.' })
  } catch (error) {
    logger.phiSafeError(error)
    return jsonError('Failed to delete account', 500)
  }
}
