import type { AuthUser } from '@/lib/store';
import type { User as SupabaseUser } from '@supabase/supabase-js';

import { db } from '@/lib/db';

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
  const existing = await db.user.findUnique({ where: { id: supabaseUser.id } });
  if (existing) {
    const profile = existing
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
      emailVerified: profile.emailVerified ?? null,
      phoneVerified: profile.phoneVerified,
      identityConfirmed: profile.identityConfirmed,
      idDocumentUploaded: profile.idDocumentUploaded,
      idDocumentVerified: profile.idDocumentVerified,
      verificationRejectedReason: profile.verificationRejectedReason ?? null,
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

  const profile = await db.user.create({ data: {
    id: supabaseUser.id, email, name, role: 'patient',
    emailVerified: supabaseUser.email_confirmed_at ? new Date(supabaseUser.email_confirmed_at) : null,
    password: null, consentAccepted: false, dataProcessingConsent: false,
    aiTrainingConsent: false, subscriptionTier: 'free', isDemo: false,
  } });

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
    emailVerified: profile.emailVerified ?? null,
    phoneVerified: profile.phoneVerified,
    identityConfirmed: profile.identityConfirmed,
    idDocumentUploaded: profile.idDocumentUploaded,
    idDocumentVerified: profile.idDocumentVerified,
    verificationRejectedReason: profile.verificationRejectedReason ?? null,
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
  const profile = await db.user.findUnique({ where: { id: supabaseUser.id } });
  if (!profile) return null;

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
    emailVerified: profile.emailVerified ?? null,
    phoneVerified: profile.phoneVerified,
    identityConfirmed: profile.identityConfirmed,
    idDocumentUploaded: profile.idDocumentUploaded,
    idDocumentVerified: profile.idDocumentVerified,
    verificationRejectedReason: profile.verificationRejectedReason ?? null,
    isDemo: profile.isDemo,
    consentAccepted: profile.consentAccepted,
    dataProcessingConsent: profile.dataProcessingConsent,
    aiTrainingConsent: profile.aiTrainingConsent,
  }
}
