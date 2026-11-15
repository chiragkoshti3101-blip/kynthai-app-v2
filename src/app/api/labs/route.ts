import { NextRequest } from 'next/server'
// import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { sanitizeText, rateLimit } from '@/lib/security'
import { checkCsrf } from '@/lib/csrf'
import { jsonError, jsonOk, readJson, audit, parseJsonCol, requireAuth } from '@/lib/api-helpers'
import { labProfileSchema } from '@/lib/schemas'
import { validateProviderDocuments } from '@/lib/provider-documents'
import { extractZip } from '@/lib/delivery-fee'
export const dynamic = 'force-dynamic'

// GET /api/labs — public list of verified labs. Supports ?city=&search=&userId=
export async function GET(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const sp = req.nextUrl.searchParams
  const city = sp.get('city')?.trim()
  const search = sp.get('search')?.trim()
  const userId = sp.get('userId')?.trim()

  if (userId) {
    const { response, user: session } = await requireAuth(req)
    if (response || !session || session.id !== userId) return response || jsonError('Unauthorized', 401)
    const profile = await db.labProfile.findUnique({ where: { userId }, include: { user: true } })
    if (!profile) return jsonError('Not found', 404)
    return jsonOk({
      id: profile.id,
      userId: profile.userId,
      labName: profile.labName,
      licenseNumber: profile.licenseNumber,
      address: profile.address,
      city: profile.city,
      testsOffered: parseJsonCol(profile.testsOffered, []),
      homeCollection: profile.homeCollection,
      serviceZip: extractZip(profile.address || ''),
      longDistanceTravelFeeCents: profile.longDistanceTravelFeeCents,
      verified: profile.verified,
      verificationStatus: profile.verificationStatus,
      rejectionReason: profile.rejectionReason,
      rating: profile.rating,
      reviewCount: profile.reviewCount,
    })
  }

  const and: any[] = [{ verified: true }]
  if (city) and.push({ city: { contains: city } })

  // `labName` and `address` are encrypted with randomized ciphertext and
  // cannot support SQL `contains`. Scope to verified labs/city first, then
  // filter the decrypted values in memory before returning the public list.
  const where: any = { AND: and }
  try {
    const candidates = await db.labProfile.findMany({
      where,
      include: { user: true },
      orderBy: { rating: 'desc' },
      ...(search ? {} : { take: 100 }),
    })
    const needle = search?.toLocaleLowerCase()
    const labs = needle
      ? candidates
          .filter((lab: any) =>
            [lab.labName, lab.city, lab.address]
              .some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(needle)),
          )
          .slice(0, 100)
      : candidates

    return jsonOk(
      labs.map((l: any) => ({
        id: l.id,
        userId: l.userId,
        labName: l.labName,
        city: l.city,
        address: l.address,
        serviceZip: extractZip(l.address || ''),
        testsOffered: parseJsonCol(l.testsOffered, []),
        homeCollection: l.homeCollection,
        longDistanceTravelFeeCents: l.longDistanceTravelFeeCents,
        rating: l.rating,
        reviewCount: l.reviewCount,
      })),
    )
  } catch (err: any) {
    console.error('LABS ERROR:', err?.message || String(err))
    return jsonError(`Lab query failed: ${err?.message || String(err)}`, 500)
  }

