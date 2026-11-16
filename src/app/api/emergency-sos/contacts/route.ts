import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, jsonOk } from '@/lib/api-helpers'
import { rateLimit } from '@/lib/security'
import { logger } from '@/lib/logger'
export const dynamic = 'force-dynamic'

// GET /api/emergency-sos/contacts — SOS call contacts for the caller.
// Authorization: any authenticated user (patient or caretaker) who is a family
// member. Returns ONLY name + phone of family members with a phone number on
// file, so the SOS tab can offer a one-tap "Call" button. This is a narrow,
// SOS-scoped exception to the family-data role gate (patients may NOT read
// general family member records via /api/family, but must be able to call a
// listed contact during an emergency).

export async function GET(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  const u = user!

  try {
    const memberships = await db.familyMember.findMany({
      where: { userId: u.id, inviteStatus: 'accepted' },
      select: { familyId: true },
    })
    if (memberships.length === 0) return jsonOk({ contacts: [] })

    const familyIds = [...new Set(memberships.map((m) => m.familyId))]
    const members = await db.familyMember.findMany({
      where: { familyId: { in: familyIds }, userId: { not: u.id }, inviteStatus: 'accepted' },
      select: {
        name: true,
        user: { select: { name: true, phone: true } },
      },
    })

    // Dedupe by phone; only members with a phone on file are callable.
    const seen = new Set<string>()
    const contacts = members
      .filter((m) => m.user?.phone)
      .map((m) => ({ name: m.user!.name || m.name, phone: m.user!.phone as string }))
      .filter((c) => {
        if (seen.has(c.phone)) return false
        seen.add(c.phone)
        return true
      })

    return jsonOk({ contacts })
  } catch (error) {
    // Never log raw DB errors containing user IDs/phone data
    logger.phiSafeError(error, 'emergency-sos.contacts.GET')
    return NextResponse.json({ error: 'Failed to load contacts' }, { status: 500 })
  }
}
