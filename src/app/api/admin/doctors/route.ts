import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/auth';
import { sanitizeText, rateLimit, maskIdLike } from '@/lib/security';
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

// GET /api/admin/doctors — list all doctor profiles.
export async function GET(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return limited;

  const { response, user } = await requireAdmin(req);
  if (response || !user) return response!;

  // Audit: all admin doctor profile accesses
  await logAudit(user.id, 'admin.doctors.list');

  try {
    const status = req.nextUrl.searchParams.get('status')?.trim();
    const where: { verificationStatus?: string } = {};
    if (status) where.verificationStatus = status;

    const doctors = await db.doctorProfile.findMany({
      where,
      include: { user: true },
      orderBy: { submittedAt: 'desc' },
    });

    return jsonOk(
      doctors.map((d: any) => ({
        id: d.id,
        userId: d.userId,
        name: d.user.name,
        email: d.user.email,
        specialization: d.specialization,
        licenseNumber: d.licenseNumber,
        city: d.city,
        experience: d.experience,
        consultationFee: d.consultationFee,
        verified: d.verified,
        verificationStatus: d.verificationStatus,
        rejectionReason: d.rejectionReason,
        submittedAt: d.submittedAt?.toISOString() ?? null,
        documents: parseJsonCol(d.documents, []),
        rating: d.rating,
        reviewCount: d.reviewCount,
        degreeType: d.degreeType,
        medicalCouncil: d.medicalCouncil,
      }))
    );
  } catch (error) {
    logger.phiSafeError(error);
    return jsonError('Internal server error', 500);
  }
}

// PUT /api/admin/doctors — approve or reject a doctor application.
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

    const profile = await db.doctorProfile.findUnique({ where: { id: body.id } });
    if (!profile) return jsonError('Doctor profile not found', 404);

    if (body.action === 'approve') {
      const updated = await db.doctorProfile.update({
        where: { id: body.id },
        data: { verified: true, verificationStatus: 'approved', rejectionReason: null },
      });
      await logAudit(u.id, 'admin.doctor.approve', `doctor=${body.id}`);
      return jsonOk(updated);
    } else {
      const reason = sanitizeText(body.reason, 500);
      if (!reason) return jsonError('reason is required for rejection', 400);
      const updated = await db.doctorProfile.update({
        where: { id: body.id },
        data: { verified: false, verificationStatus: 'rejected', rejectionReason: reason },
      });
      await logAudit(u.id, 'admin.doctor.reject', `doctor=${body.id} reason=${reason}`);
      return jsonOk(updated);
    }
  } catch (error: any) {
    logger.phiSafeError(error);
    return jsonError(error?.message?.slice(0, 200) || 'Internal server error', 500);
  }
}
