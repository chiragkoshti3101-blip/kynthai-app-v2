import type { AuthUser } from '@/lib/store';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''

function sbHeaders() {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Sync a Supabase auth user to a Prisma User profile.
 * Called after registration, login, and OAuth callbacks.
 */
export async function syncSupabaseUser(
  supabaseUser: SupabaseUser
): Promise<AuthUser | null> {
  const email = supabaseUser.email;
  if (!email) return null;

  // Check if profile already exists
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${supabaseUser.id}&select=*`, {
    headers: sbHeaders(),
  })
  const profiles = await res.json()

  if (profiles && profiles.length > 0) {
    const profile = profiles[0]
    return {
      id: profile.id,
      email: profile.email,
      name: profile.name || '',
      role: profile.role as AuthUser['role'],
      phone: profile.phone,
      dateOfBirth: profile.dateOfBirth?.toISOString?.() ?? profile.dateOfBirth ?? null,
      subscriptionTier: profile.subscriptionTier as AuthUser['subscriptionTier'],
      stripeCustomerId: profile.stripeCustomerId ?? null,
      verificationLevel: profile.verificationLevel ?? 'unverified',
      isDemo: profile.isDemo,
      consentAccepted: profile.consentAccepted,
      dataProcessingConsent: profile.dataProcessingConsent,
      aiTrainingConsent: profile.aiTrainingConsent,
    }
  }

  // First time — create the profile
  const name =
    supabaseUser.user_metadata?.name ||
    supabaseUser.user_metadata?.full_name ||
    email.split('@')[0];

  const createRes = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
    method: 'POST',
    headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify({
      id: supabaseUser.id,
      email,
      name,
      role: 'patient', // Roles assigned server-side only
      emailVerified: supabaseUser.email_confirmed_at ? new Date(supabaseUser.email_confirmed_at).toISOString() : null,
      password: null,
      consentAccepted: false,
      dataProcessingConsent: false,
      aiTrainingConsent: false,
      subscriptionTier: 'free',
      isDemo: false,
      failedLoginAttempts: 0,
      phoneVerified: false,
      identityConfirmed: false,
      idDocumentUploaded: false,
      idDocumentVerified: false,
      verificationLevel: 'unverified',
      emailOptOut: false,
      updatedAt: new Date().toISOString(),
    }),
  })

  if (!createRes.ok) {
    console.error('Profile creation failed:', await createRes.text())
    return null
  }

  const created = await createRes.json()
  const profile = Array.isArray(created) ? created[0] : created

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name || '',
    role: profile.role as AuthUser['role'],
    phone: profile.phone,
    dateOfBirth: profile.dateOfBirth?.toISOString?.() ?? profile.dateOfBirth ?? null,
    subscriptionTier: profile.subscriptionTier as AuthUser['subscriptionTier'],
    stripeCustomerId: profile.stripeCustomerId ?? null,
    verificationLevel: profile.verificationLevel ?? 'unverified',
    isDemo: profile.isDemo,
    consentAccepted: profile.consentAccepted,
    dataProcessingConsent: profile.dataProcessingConsent,
    aiTrainingConsent: profile.aiTrainingConsent,
  }
}

/**
 * Get the Prisma profile for a Supabase auth user.
 */
export async function getSupabaseProfile(
  supabaseUser: SupabaseUser
): Promise<AuthUser | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${supabaseUser.id}&select=*`, {
    headers: sbHeaders(),
  })
  const profiles = await res.json()
  if (!profiles || profiles.length === 0) return null

  const profile = profiles[0]
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name || '',
    role: profile.role as AuthUser['role'],
    phone: profile.phone,
    dateOfBirth: profile.dateOfBirth?.toISOString?.() ?? profile.dateOfBirth ?? null,
    subscriptionTier: profile.subscriptionTier as AuthUser['subscriptionTier'],
    stripeCustomerId: profile.stripeCustomerId ?? null,
    verificationLevel: profile.verificationLevel ?? 'unverified',
    isDemo: profile.isDemo,
    consentAccepted: profile.consentAccepted,
    dataProcessingConsent: profile.dataProcessingConsent,
    aiTrainingConsent: profile.aiTrainingConsent,
  }
}
