import { NextRequest } from 'next/server'
// import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { sanitizeText, rateLimit } from '@/lib/security'
import { checkCsrf } from '@/lib/csrf'
import { jsonError, jsonOk, readJson, audit, parseJsonCol, requireAuth } from '@/lib/api-helpers'
import { labProfileSchema } from '@/lib/schemas'
import { validateProviderDocuments } from '@/lib/provider-documents'
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
      testsOffered: parseJsonCol(l.testsOffered, []),
      homeCollection: l.homeCollection,
      rating: l.rating,
      reviewCount: l.reviewCount,
    })),
  )
}

// POST /api/labs — create or update the caller's own lab profile (verificationStatus=pending).
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
        .filter((t) => t && t.name)
        .map((t) => ({ name: sanitizeText(t.name, 120), price: Number(t.price) || 0 }))
    : []
  if (!labName) return jsonError('Lab name is required', 400)
  if (!licenseNumber) return jsonError('License number is required', 400)
  if (!city) return jsonError('City is required', 400)

  const docs = body.documents ?? {}

  const docCheck = await validateProviderDocuments(docs, session.id, 'lab')
  if (!docCheck.ok) return jsonError(docCheck.error, 400)
  const docsJson = JSON.stringify(docCheck.documents.map(({ id, slot }) => ({ id, slot })))

  const existing = await db.labProfile.findUnique({ where: { userId: session.id } })

  // Fraud prevention: a hard-blocked user cannot submit a lab application.
  if (session.verificationLevel === 'blocked') {
    return jsonError('This account is not eligible to apply.', 403, 'ACCOUNT_BLOCKED')
  }

  // Provider fraud: refuse a license already held by another approved lab.
  if (licenseNumber) {
    const dupLicense = await db.labProfile.findFirst({
      where: { licenseNumber, verificationStatus: 'approved', userId: { not: session.id } },
      select: { id: true },
    })
    if (dupLicense) {
      await logAudit(session.id, 'lab.profile.duplicate_license', `license=${licenseNumber}`, 'security')
      return jsonError('This license number is already registered to another lab.', 409, 'LICENSE_IN_USE')
    }
  }

  const payload = {
    labName,
    licenseNumber,
    city,
    address,
    homeCollection: !!body.homeCollection,
    testsOffered: JSON.stringify(tests),
    documents: docsJson,
    verificationStatus: 'pending',
    verified: false,
    rejectionReason: null,
    submittedAt: new Date(),
  }

  let profile
  if (existing) {
    profile = await db.labProfile.update({ where: { userId: session.id }, data: payload })
  } else {
    profile = await db.labProfile.create({ data: { userId: session.id, ...payload } })
  }

  await logAudit(session.id, 'lab.profile.submit', `profile=${profile.id}`)
  return jsonOk({
    id: profile.id,
    userId: profile.userId,
    labName: profile.labName,
    licenseNumber: profile.licenseNumber,
    city: profile.city,
    address: profile.address,
    homeCollection: profile.homeCollection,
    testsOffered: parseJsonCol(profile.testsOffered, []),
    verified: profile.verified,
    verificationStatus: profile.verificationStatus,
    rejectionReason: profile.rejectionReason,
    documents: parseJsonCol(profile.documents, []),
  })
}
