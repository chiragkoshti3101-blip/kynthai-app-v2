import { db } from '@/lib/db'
import { NextRequest } from 'next/server'
import { sanitizeText, rateLimit } from '@/lib/security'
import { checkCsrf } from '@/lib/csrf'
import { jsonError, jsonOk, readJson, parseJsonCol, requireAuth } from '@/lib/api-helpers'
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
    
    const profile = await db.labProfile.findFirst({ where: { userId } })
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

  // Server-side adapter access: public RLS grants are not required.
    const candidates = await db.labProfile.findMany({
      where: { verified: true, ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}) },
      take: 100,
    })
  const needle = search?.toLocaleLowerCase()
  const labs = needle
    ? candidates.filter((lab: any) =>
        [lab.labName, lab.city, lab.address]
          .some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(needle)),
      ).slice(0, 100)
    : candidates.slice(0, 100)

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
}

// POST /api/labs — create or update the caller's own lab profile
export async function POST(req: NextRequest) {
  const csrfError = await checkCsrf(req)
  if (csrfError) return csrfError

  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user: session } = await requireAuth(req)
  if (response || !session) return response!
  if (session.role !== 'lab') return jsonError('Only lab accounts may create a lab profile', 403)

  const rawBody = await readJson(req)
  if (!rawBody) return jsonError('Invalid JSON', 400, 'INVALID_JSON')
  const labResult = labProfileSchema.safeParse(rawBody)
  if (!labResult.success) {
    const fields: Record<string, string> = {}
    for (const issue of labResult.error.issues) {
      fields[String(issue.path.join('.') || 'body')] = issue.message
    }
    return jsonError('Validation failed', 422, 'VALIDATION_ERROR', { fields })
  }
  const body = labResult.data
  if (body.userId && body.userId !== session.id) {
    return jsonError('You can only submit your own profile', 403)
  }

  const labName = sanitizeText(body.labName, 120)
  const licenseNumber = sanitizeText(body.licenseNumber, 60)
  const city = sanitizeText(body.city, 60)
  const address = sanitizeText(body.address, 500)
  const tests = Array.isArray(body.tests)
    ? body.tests
        .filter((t: any) => t && t.name && Number(t.price) > 0)
        .map((t: any) => ({ name: sanitizeText(t.name, 120), price: Number(t.price) || 0 }))
    : []
  if (!labName) return jsonError('Lab name is required', 400)
  if (!licenseNumber) return jsonError('License number is required', 400)
  if (!city) return jsonError('City is required', 400)
  if (tests.length === 0) return jsonError('Add at least one priced test', 400)

  const payload = {
    userId: session.id,
    labName,
    licenseNumber,
    city,
    address,
    homeCollection: !!body.homeCollection,
    testsOffered: JSON.stringify(tests),
    verificationStatus: 'pending',
    verified: false,
    rejectionReason: null,
    submittedAt: new Date().toISOString(),
    rating: 4.5,
    reviewCount: 0,
  }

  const existing = await db.labProfile.findFirst({ where: { userId: session.id } })
  const profile = existing
    ? await db.labProfile.update({ where: { id: existing.id }, data: payload })
    : await db.labProfile.create({ data: payload })

  return jsonOk({
    id: profile.id,
    userId: profile.userId,
    labName: profile.labName,
    licenseNumber: profile.licenseNumber,
    city: profile.city,
    address: profile.address,
    serviceZip: extractZip(profile.address || ''),
    homeCollection: profile.homeCollection,
    longDistanceTravelFeeCents: profile.longDistanceTravelFeeCents,
    testsOffered: parseJsonCol(profile.testsOffered, []),
    verified: profile.verified,
    verificationStatus: profile.verificationStatus,
    rejectionReason: profile.rejectionReason,
  })
}
