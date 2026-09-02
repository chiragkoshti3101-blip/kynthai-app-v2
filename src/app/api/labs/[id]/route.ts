import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/security';
import { jsonError, jsonOk, parseJsonCol, readJson, requireAuthWithCsrf } from '@/lib/api-helpers';
import { logger } from '@/lib/logger';
import { logAudit } from '@/lib/auth';
import { extractZip } from '@/lib/delivery-fee';
export const dynamic = 'force-dynamic';

// GET /api/labs/[id] — public lab profile
//
// SECURITY: this endpoint is publicly reachable (no auth required). For
// unverified/rejected profiles we redact sensitive fields (email,
// licenseNumber, address, documents, rejectionReason) so an attacker
// who enumerates profile IDs can't harvest pending applicants' PII.
// Verified labs expose the full public profile.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req);
  if (limited) return limited;
  const { id } = await params;

  // Audit: public lab profile access (no user - rate-limited, public data)
  const labReqIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  logger.info('lab.profile.public_access', JSON.stringify({ resourceId: id, ip: labReqIp }));

  const profile = await db.labProfile.findUnique({ where: { id }, include: { user: true } });
  if (!profile) return jsonError('Lab not found', 404);

  if (!profile.verified) {
    return jsonOk({
      id: profile.id,
      userId: profile.userId,
      labName: profile.labName,
      city: profile.city,
      homeCollection: profile.homeCollection,
      verified: false,
      verificationStatus: profile.verificationStatus,
      rating: profile.rating,
      reviewCount: profile.reviewCount,
    });
  }

  return jsonOk({
    id: profile.id,
    userId: profile.userId,
    name: profile.user.name,
    labName: profile.labName,
    licenseNumber: profile.licenseNumber,
    address: profile.address,
    serviceZip: extractZip(profile.address || ''),
    city: profile.city,
    testsOffered: parseJsonCol(profile.testsOffered, []),
    homeCollection: profile.homeCollection,
    longDistanceTravelFeeCents: profile.longDistanceTravelFeeCents,
    verified: profile.verified,
    verificationStatus: profile.verificationStatus,
    rating: profile.rating,
    reviewCount: profile.reviewCount,
  });
}

// PATCH /api/labs/[id] — provider-owned travel pricing settings.
// This deliberately does not resubmit the provider verification application.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  if (user.role !== 'lab') return jsonError('Only lab accounts may update travel pricing', 403)

  const { id } = await params
  const profile = await db.labProfile.findUnique({ where: { id } })
  if (!profile) return jsonError('Lab not found', 404)
  if (profile.userId !== user.id) return jsonError('You can only update your own lab pricing', 403)

  const body = await readJson<{ longDistanceTravelFeeCents?: unknown }>(req)
  if (!body) return jsonError('Invalid JSON', 400)

  const raw = body.longDistanceTravelFeeCents
  if (raw === null || raw === undefined || raw === '') {
    const updated = await db.labProfile.update({
      where: { id },
      data: { longDistanceTravelFeeCents: null },
    })
    await logAudit(user.id, 'lab.travel_pricing.update', `profile=${id} longDistanceTravelFeeCents=null`)
    return jsonOk({ id: updated.id, longDistanceTravelFeeCents: updated.longDistanceTravelFeeCents })
  }

  const cents = Math.round(Number(raw))
  // A quote of zero is not a quote: leaving it blank disables long-distance
  // online booking and prevents a provider from accidentally working for free.
  if (!Number.isFinite(cents) || cents < 100 || cents > 1000000) {
    return jsonError('Long-distance quote must be between $1.00 and $10,000.00', 422, 'VALIDATION_ERROR')
  }

  const updated = await db.labProfile.update({
    where: { id },
    data: { longDistanceTravelFeeCents: cents },
  })
  await logAudit(user.id, 'lab.travel_pricing.update', `profile=${id} longDistanceTravelFeeCents=${cents}`)
  return jsonOk({ id: updated.id, longDistanceTravelFeeCents: updated.longDistanceTravelFeeCents })
}
