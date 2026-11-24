import { NextRequest } from 'next/server';
// import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/auth';
import { sanitizeText, rateLimit } from '@/lib/security';
import {
  requireAdmin,
  requireAuthWithCsrf,
  jsonError,
  jsonOk,
  readJson,
  audit,
  parseJsonCol,
} from '@/lib/api-helpers';
import { adminActionSchema } from '@/lib/schemas/security';
import { logger } from '@/lib/logger';
export const dynamic = 'force-dynamic';

// GET /api/admin/labs — list all lab profiles.
export async function GET(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return limited;

  const { response, user } = await requireAdmin(req);
  if (response || !user) return response!;

  // Audit: all admin lab profile accesses
  await logAudit(user.id, 'admin.labs.list');

  try {
    const status = req.nextUrl.searchParams.get('status')?.trim();
    const where: any = {};
    if (status) where.verificationStatus = status;

    const labs = await db.labProfile.findMany({
      where,
      include: { user: true },
      orderBy: { submittedAt: 'desc' },
    });

    return jsonOk(
      labs.map((l: any) => ({
        id: l.id,
        userId: l.userId,
        email: l.user.email,
        labName: l.labName,
        licenseNumber: l.licenseNumber,
        city: l.city,
        address: l.address,
        homeCollection: l.homeCollection,
        testsOffered: parseJsonCol(l.testsOffered, []),
        verified: l.verified,
        verificationStatus: l.verificationStatus,
        rejectionReason: l.rejectionReason,
        submittedAt: l.submittedAt?.toISOString() ?? null,
        documents: parseJsonCol(l.documents, []),
        rating: l.rating,
        reviewCount: l.reviewCount,
        aiVerdict: l.aiVerdict,
        aiReview: parseJsonCol(l.aiReview, null),
        aiReviewAt: l.aiReviewAt?.toISOString() ?? null,
      }))
    );
  } catch (error) {
    logger.phiSafeError(error);
    return jsonError('Internal server error', 500);
  }
}

// PUT /api/admin/labs — approve or reject a lab application.
export async function PUT(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return limited;

  const { response, user } = await requireAdmin(req);
  if (response || !user) return response!;
  const u = user!;

  try {
    const rawBody = await readJson(req);
    if (!rawBody) return jsonError('Invalid JSON', 400, 'INVALID_JSON');
    const parsed = adminActionSchema.safeParse(rawBody);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[String(issue.path.join('.') || 'body')] = issue.message;
      }
      return jsonError('Validation failed', 422, 'VALIDATION_ERROR', { fields });
    }
    const body = parsed.data;

    const profile = await db.labProfile.findUnique({ where: { id: body.id } });
    if (!profile) return jsonError('Lab profile not found', 404);

    if (body.action === 'approve') {
      const updated = await db.labProfile.update({
        where: { id: body.id },
        data: { verified: true, verificationStatus: 'approved', rejectionReason: null },
      });
      await logAudit(u.id, 'admin.lab.approve', `lab=${body.id}`);
      return jsonOk(updated);
    } else {
      const reason = sanitizeText(body.reason, 500);
      if (!reason) return jsonError('reason is required for rejection', 400);
      const updated = await db.labProfile.update({
        where: { id: body.id },
        data: { verified: false, verificationStatus: 'rejected', rejectionReason: reason },
      });
      await logAudit(u.id, 'admin.lab.reject', `lab=${body.id} reason=${reason}`);
      return jsonOk(updated);
    }
  } catch (error) {
    logger.phiSafeError(error);
    return jsonError('Internal server error', 500);
  }
}
