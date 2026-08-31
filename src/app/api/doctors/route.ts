import { NextRequest } from 'next/server';
// import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/auth';
import { sanitizeText, rateLimit } from '@/lib/security';
import { encrypt, decryptValue } from '@/lib/encryption';
import { checkCsrf } from '@/lib/csrf';
import { jsonError, jsonOk, readJson, audit, parseJsonCol, requireAuth } from '@/lib/api-helpers';
import { verifyNpi } from '@/lib/npi-verify';
import { validateProviderDocuments } from '@/lib/provider-documents';

export const dynamic = 'force-dynamic';

// GET /api/doctors
// Public listing of verified doctors. Supports ?specialization=&city=&search=&userId=
export async function GET(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return limited;

  const sp = req.nextUrl.searchParams;
  const specialization = sp.get('specialization')?.trim();
  const city = sp.get('city')?.trim();
  const search = sp.get('search')?.trim();
  const userId = sp.get('userId')?.trim();

  // If userId is provided, return that user's doctor profile (owned by the caller).
  if (userId) {
    const { response, user: session } = await requireAuth(req);
    if (response || !session || session.id !== userId) return response || jsonError('Unauthorized', 401);
    const profile = await db.doctorProfile.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (!profile) return jsonError('Not found', 404);
    return jsonOk({
      id: profile.id,
      userId: profile.userId,
      name: profile.user.name,
      specialization: profile.specialization,
      licenseNumber: profile.licenseNumber,
      experience: profile.experience,
      consultationFee: profile.consultationFee,
      city: profile.city,
      bio: profile.bio,
      videoCallEnabled: profile.videoCallEnabled,
      verified: profile.verified,
      verificationStatus: profile.verificationStatus,
      rejectionReason: profile.rejectionReason,
      rating: profile.rating,
      reviewCount: profile.reviewCount,
      subscriptionTier: profile.subscriptionTier,
      avatarColor: profile.avatarColor,
      degreeType: profile.degreeType,
      medicalCouncil: profile.medicalCouncil,
    });
  }

  const and: any[] = [{ verified: true }];
  if (specialization) and.push({ specialization });
  if (city) and.push({ city: { contains: city } });
  if (search) {
    and.push({
      OR: [
        { user: { name: { contains: search } } },
        { specialization: { contains: search } },
        { city: { contains: search } },
        { bio: { contains: search } },
      ],
    });
  }

  const where: any = { AND: and };
  const doctors = await db.doctorProfile.findMany({
    where,
    include: { user: true },
    take: 100,
  });

  // Sort by priority score (Pro doctors get +500 boost)
  const { getPriorityScore } = await import('@/lib/doctor-subscription')
  doctors.sort((a: any, b: any) => {
    const scoreA = getPriorityScore(a.subscriptionTier, a.rating, a.reviewCount, a.lastActiveAt)
    const scoreB = getPriorityScore(b.subscriptionTier, b.rating, b.reviewCount, b.lastActiveAt)
    return scoreB - scoreA
  })

  return jsonOk(
    doctors.map((d: any) => ({
      id: d.id,
      userId: d.userId,
      name: d.user.name,
      specialization: d.specialization,
      consultationFee: d.consultationFee,
      city: d.city,
      bio: d.bio,
      experience: d.experience,
      videoCallEnabled: d.videoCallEnabled,
      rating: d.rating,
      reviewCount: d.reviewCount,
      avatarColor: d.avatarColor,
      subscriptionTier: d.subscriptionTier,
      available: true, // All verified doctors are available
    }))
  );
}

// POST /api/doctors
// Create or update the caller's own doctor profile (verificationStatus=pending).
export async function POST(req: NextRequest) {
  const csrfError = await checkCsrf(req);
  if (csrfError) return csrfError;

  const limited = rateLimit(req);
  if (limited) return limited;

  const { response, user: session } = await requireAuth(req);
  if (response || !session) return response!;
  if (session.role !== 'doctor')
    return jsonError('Only doctor accounts may create a doctor profile', 403);

  const body = await readJson<{
    userId?: string;
    email?: string;
    name?: string;
    specialization?: string;
    licenseNumber?: string;
    experience?: number;
    consultationFee?: number;
    city?: string;
    bio?: string;
    videoCallEnabled?: boolean;
    documents?: Record<string, { id?: string } | null>;
    ssnLikeId?: string;
    taxId?: string;
    degreeType?: string;
    medicalCouncil?: string;
    npiNumber?: string;
  }>(req);
  if (!body) return jsonError('Invalid JSON', 400);

  // IDOR prevention: caller may only mutate their own profile.
  if (body.userId && body.userId !== session.id) {
    return jsonError('You can only submit your own profile', 403);
  }

  const specialization = sanitizeText(body.specialization, 80);
  const licenseNumber = sanitizeText(body.licenseNumber, 60);
  const city = sanitizeText(body.city, 60);
  const bio = sanitizeText(body.bio, 2000);
  const experience = Number(body.experience) || 0;
  const consultationFee = Number(body.consultationFee) || 0;
  const degreeType = sanitizeText(body.degreeType, 40);
  const medicalCouncil = sanitizeText(body.medicalCouncil, 80);

  if (!specialization) return jsonError('Specialization is required', 400);
  if (!licenseNumber) return jsonError('License number is required', 400);
  if (!city) return jsonError('City is required', 400);

  // Verify NPI against the free CMS NPPES registry (when provided)
  const npiNumber = sanitizeText(body.npiNumber, 20);
  if (npiNumber) {
    const npiResult = await verifyNpi(npiNumber);
    if (!npiResult.valid) {
      return jsonError(`NPI verification failed: ${npiResult.error}`, 400);
    }
  }

  const docs = body.documents ?? {};
  const docCheck = await validateProviderDocuments(docs, session.id, 'doctor');
  if (!docCheck.ok) return jsonError(docCheck.error, 400);
  const docsJson = JSON.stringify(docCheck.documents.map(({ id, slot }) => ({ id, slot })));

  const existing = await db.doctorProfile.findUnique({ where: { userId: session.id } });

  // Fraud prevention: a hard-blocked user cannot submit a provider application.
  if (session.verificationLevel === 'blocked') {
    return jsonError('This account is not eligible to apply.', 403, 'ACCOUNT_BLOCKED');
  }

  // Provider fraud: refuse a license number already held by another approved
  // doctor (prevents cloned/duplicate provider identities).
  if (licenseNumber) {
    const dupLicense = await db.doctorProfile.findFirst({
      where: {
        licenseNumber,
        verificationStatus: 'approved',
        userId: { not: session.id },
      },
      select: { id: true },
    });
    if (dupLicense) {
      await logAudit(session.id, 'doctor.profile.duplicate_license', `license=${licenseNumber}`, 'security');
      return jsonError('This license number is already registered to another doctor.', 409, 'LICENSE_IN_USE');
    }
  }

  const payload = {
    specialization,
    licenseNumber,
    city,
    bio,
    experience,
    consultationFee,
    videoCallEnabled: !!body.videoCallEnabled,
    documents: docsJson,
    verificationStatus: 'pending',
    verified: false,
    rejectionReason: null,
    submittedAt: new Date(),
    degreeType,
    medicalCouncil,
    npiNumber: npiNumber || undefined,
  };

  let profile;
  if (existing) {
    profile = await db.doctorProfile.update({ where: { userId: session.id }, data: payload });
  } else {
    profile = await db.doctorProfile.create({ data: { userId: session.id, ...payload } });
  }

  await logAudit(session.id, 'doctor.profile.submit', `profile=${profile.id} status=pending`);

  return jsonOk({
    id: profile.id,
    userId: profile.userId,
    specialization: profile.specialization,
    licenseNumber: profile.licenseNumber,
    experience: profile.experience,
    consultationFee: profile.consultationFee,
    city: profile.city,
    bio: profile.bio,
    videoCallEnabled: profile.videoCallEnabled,
    verified: profile.verified,
    verificationStatus: profile.verificationStatus,
    rejectionReason: profile.rejectionReason,
    documents: parseJsonCol(profile.documents, []),
    degreeType: profile.degreeType,
    medicalCouncil: profile.medicalCouncil,
  });
}
