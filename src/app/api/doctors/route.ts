import { db } from '@/lib/db'
import { NextRequest } from 'next/server';
import { sanitizeText, rateLimit } from '@/lib/security';
import { encrypt, decryptValue } from '@/lib/encryption';
import { checkCsrf } from '@/lib/csrf';
import { jsonError, jsonOk, readJson, audit, parseJsonCol, requireAuth, ensureDatabase } from '@/lib/api-helpers';
import { verifyNpi, type NpiResult } from '@/lib/npi-verify';
import { validateProviderDocuments } from '@/lib/provider-documents';
import { REQUIRED_DOCUMENTS, screenProviderWithAi, serializeScreen } from '@/lib/provider-verification';

export const dynamic = 'force-dynamic';

function displayFee(cents: number): number {
  return cents >= 1000 ? Math.round((cents / 100) * 100) / 100 : cents;
}

// GET /api/doctors
export async function GET(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return limited;

  const sp = req.nextUrl.searchParams;
  const specialization = sp.get('specialization')?.trim();
  const city = sp.get('city')?.trim();
  const search = sp.get('search')?.trim();
  const userId = sp.get('userId')?.trim();

  // If userId is provided, return that user's doctor profile
  if (userId) {
    const { response, user: session } = await requireAuth(req);
    if (response || !session || session.id !== userId) return response || jsonError('Unauthorized', 401);
    
    const profile = await db.doctorProfile.findFirst({ where: { userId } })
    if (!profile) return jsonError('Not found', 404)
    return jsonOk({
      id: profile.id,
      userId: profile.userId,
      name: 'Provider',
      specialization: profile.specialization,
      licenseNumber: profile.licenseNumber,
      experience: profile.experience,
      consultationFee: displayFee(profile.consultationFee),
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
    })
  }

  // Server-side adapter access: public RLS grants are not required.
  try {
    const candidates = await db.doctorProfile.findMany({
      where: { verified: true, ...(specialization ? { specialization } : {}), ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}) },
      take: 100,
      include: { user: { select: { name: true } } },
    })
    const needle = search?.toLocaleLowerCase()
    const doctors = needle
      ? candidates.filter((doctor: any) =>
          [doctor.specialization, doctor.city, doctor.bio]
            .some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(needle)),
        ).slice(0, 100)
      : candidates.slice(0, 100)

    return jsonOk(
      doctors.map((d: any) => ({
        id: d.id,
        userId: d.userId,
        name: d.user?.name || 'Provider',
        specialization: d.specialization,
        consultationFee: displayFee(d.consultationFee),
        city: d.city,
        bio: d.bio,
        experience: d.experience,
        videoCallEnabled: d.videoCallEnabled,
        rating: d.rating,
        reviewCount: d.reviewCount,
        avatarColor: d.avatarColor,
        subscriptionTier: d.subscriptionTier,
        available: true,
      }))
    )
  } catch (err: any) {
    return jsonError('Doctor query failed', 500)
  }
}

// POST /api/doctors
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
    state?: string;
  }>(req);
  if (!body) return jsonError('Invalid JSON', 400);

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
  const state = sanitizeText(body.state, 2).toUpperCase();

  if (!specialization) return jsonError('Specialization is required', 400);
  if (!licenseNumber) return jsonError('License number is required', 400);
  if (!city) return jsonError('City is required', 400);
  if (!state) return jsonError('State is required (2-letter US state where you are licensed)', 400);

  const npiNumber = sanitizeText(body.npiNumber, 20) || null;

  // Documents must be real encrypted CERTIFICATE records owned by this account.
  const docCheck = await validateProviderDocuments(body.documents ?? {}, session.id, 'doctor');
  if ('error' in docCheck) return jsonError(docCheck.error, 400, 'INVALID_DOCUMENTS');
  const uploadedSlots = docCheck.documents.map((d) => d.slot);
  const missingDocs = REQUIRED_DOCUMENTS.doctor.filter((d) => !uploadedSlots.includes(d.id));
  if (missingDocs.length > 0) {
    return jsonError(
      `Upload the required verification documents before submitting: ${missingDocs.map((d) => d.label).join(', ')}`,
      400,
      'DOCUMENTS_REQUIRED',
      { missing: missingDocs.map((d) => d.id) },
    );
  }

  // Automated pre-screen: duplicate license across accounts, license shape,
  // state/city, NPI checksum, then the CMS NPPES registry as a second source.
  const duplicate = await db.doctorProfile.findFirst({
    where: { licenseNumber, NOT: { userId: session.id } },
    select: { id: true },
  });
  let npiRegistry: NpiResult | null = null;
  if (npiNumber) {
    npiRegistry = await Promise.race([
      verifyNpi(npiNumber),
      new Promise<NpiResult>((resolve) => setTimeout(() => resolve({ valid: false, error: 'NPI registry timed out' }), 6000)),
    ]);
  }
  const screen = await screenProviderWithAi({
    role: 'doctor',
    licenseNumber,
    documents: uploadedSlots,
    state,
    city,
    npiNumber,
    duplicateLicense: Boolean(duplicate),
  });
  if (npiRegistry) {
    screen.checks.push({
      id: 'npi_registry',
      label: 'CMS NPPES registry',
      status: npiRegistry.valid ? 'pass' : 'warn',
      detail: npiRegistry.valid
        ? `Registered${npiRegistry.name ? ` as ${npiRegistry.name}` : ''}${npiRegistry.taxonomy ? ` — ${npiRegistry.taxonomy}` : ''}`
        : npiRegistry.error || 'Not found in the CMS registry',
    });
    if (!npiRegistry.valid) {
      screen.reasons.push(npiRegistry.error || 'NPI not found in the CMS registry')
      // An unverifiable NPI must never auto-approve: route it to a human.
      if (screen.verdict === 'strong_match') screen.verdict = 'manual_review'
    }
  }

  const payload = {
    userId: session.id,
    specialization,
    licenseNumber,
    city,
    bio,
    experience,
    consultationFee,
    videoCallEnabled: !!body.videoCallEnabled,
    verificationStatus: 'pending',
    verified: false,
    rejectionReason: null,
    submittedAt: new Date().toISOString(),
    degreeType,
    medicalCouncil,
    state,
    npiNumber,
    documents: JSON.stringify(docCheck.documents.map(({ id, slot, name, type, size }) => ({ id, slot, name, type, size }))),
    aiReview: serializeScreen(screen),
    aiVerdict: screen.verdict,
    aiReviewAt: new Date(),
    rating: 4.5,
    reviewCount: 0,
  }

  const existing = await db.doctorProfile.findFirst({ where: { userId: session.id } })
  const profile = existing
    ? await db.doctorProfile.update({ where: { id: existing.id }, data: payload })
    : await db.doctorProfile.create({ data: payload })

  return jsonOk({
    id: profile.id,
    userId: profile.userId,
    specialization: profile.specialization,
    licenseNumber: profile.licenseNumber,
    experience: profile.experience,
    consultationFee: displayFee(profile.consultationFee),
    city: profile.city,
    bio: profile.bio,
    videoCallEnabled: profile.videoCallEnabled,
    verified: profile.verified,
    verificationStatus: profile.verificationStatus,
    rejectionReason: profile.rejectionReason,
    degreeType: profile.degreeType,
    medicalCouncil: profile.medicalCouncil,
    state: profile.state,
    npiNumber: profile.npiNumber,
    documents: parseJsonCol(profile.documents, []),
    aiVerdict: profile.aiVerdict,
    aiReview: parseJsonCol(profile.aiReview, null),
  })
}
