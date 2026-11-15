import { NextRequest } from 'next/server';
import { sanitizeText, rateLimit } from '@/lib/security';
import { encrypt, decryptValue } from '@/lib/encryption';
import { checkCsrf } from '@/lib/csrf';
import { jsonError, jsonOk, readJson, audit, parseJsonCol, requireAuth, ensureDatabase } from '@/lib/api-helpers';
import { verifyNpi } from '@/lib/npi-verify';
import { validateProviderDocuments } from '@/lib/provider-documents';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || ''

function supabaseHeaders(useServiceKey = false) {
  const key = useServiceKey ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

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
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/doctor_profiles?userId=eq.${userId}&select=*`, {
      headers: supabaseHeaders(true),
    })
    if (!res.ok) return jsonError('Not found', 404)
    const profiles = await res.json()
    if (!profiles || profiles.length === 0) return jsonError('Not found', 404)
    const profile = profiles[0]
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

  // Public listing of verified doctors
  let url = `${SUPABASE_URL}/rest/v1/doctor_profiles?verified=eq.true&select=*`
  if (specialization) url += '&specialization=eq.' + encodeURIComponent(specialization)
  if (city) url += '&city=ilike.*' + encodeURIComponent(city) + '*'

  try {
    const res = await fetch(url, { headers: supabaseHeaders() })
    if (!res.ok) {
      return jsonError('Doctor query failed: ' + res.status, 500)
    }
    const candidates = await res.json()
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
        name: 'Provider',
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
    console.error('DOCTORS ERROR:', err?.message || String(err))
    return jsonError('Doctor query failed: ' + (err?.message || String(err)), 500)
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
    rating: 4.5,
    reviewCount: 0,
  }

  // Check if existing profile
  const existingRes = await fetch(`${SUPABASE_URL}/rest/v1/doctor_profiles?userId=eq.${session.id}&select=id`, {
    headers: supabaseHeaders(true),
  })
  const existing = await existingRes.json()

  let profile
  if (existing && existing.length > 0) {
    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/doctor_profiles?userId=eq.${session.id}`, {
      method: 'PATCH',
      headers: { ...supabaseHeaders(true), 'Prefer': 'return=representation' },
      body: JSON.stringify(payload),
    })
    profile = (await updateRes.json())[0]
  } else {
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/doctor_profiles`, {
      method: 'POST',
      headers: { ...supabaseHeaders(true), 'Prefer': 'return=representation' },
      body: JSON.stringify(payload),
    })
    profile = (await createRes.json())[0]
  }

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
  })
}
