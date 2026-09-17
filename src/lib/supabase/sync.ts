import { db } from '@/lib/db';
import type { AuthUser } from '@/lib/store';
import type { User as SupabaseUser } from '@supabase/supabase-js';

/**
 * Sync a Supabase auth user to a Prisma User profile.
 * Called after registration, login, and OAuth callbacks.
 * If the Prisma profile doesn't exist, it creates one.
 * If it does exist, it returns the existing profile.
 */
export async function syncSupabaseUser(
  supabaseUser: SupabaseUser
): Promise<AuthUser | null> {
  const email = supabaseUser.email;
  if (!email) return null;

  // Check if Prisma profile already exists
  let profile = await db.user.findUnique({ where: { id: supabaseUser.id } });

  if (!profile) {
    // First time — create the Prisma profile from Supabase auth data
    const name =
      supabaseUser.user_metadata?.name ||
      supabaseUser.user_metadata?.full_name ||
      email.split('@')[0];
    const role = (supabaseUser.user_metadata?.role as string) || 'patient';

    profile = await db.user.create({
      data: {
        id: supabaseUser.id,
        email,
        name,
        role: role as any,
        emailVerified: supabaseUser.email_confirmed_at ? new Date(supabaseUser.email_confirmed_at) : null,
        // No password — Supabase manages auth
        password: null,
        // Consent starts explicitly un-granted: the user must opt in via the
        // registration checkbox / consent gate before health features unlock.
        consentAccepted: false,
        dataProcessingConsent: false,
        aiTrainingConsent: false,
      },
    });
  }

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name || '',
    role: profile.role as AuthUser['role'],
    phone: profile.phone,
    dateOfBirth: profile.dateOfBirth?.toISOString() ?? null,
    subscriptionTier: profile.subscriptionTier as AuthUser['subscriptionTier'],
    isDemo: profile.isDemo,
    consentAccepted: profile.consentAccepted,
    dataProcessingConsent: profile.dataProcessingConsent,
    aiTrainingConsent: profile.aiTrainingConsent,
  };
}

/**
 * Get the Prisma profile for a Supabase auth user.
 * Returns null if no profile exists.
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
    dateOfBirth: profile.dateOfBirth?.toISOString() ?? null,
    subscriptionTier: profile.subscriptionTier as AuthUser['subscriptionTier'],
    isDemo: profile.isDemo,
    consentAccepted: profile.consentAccepted,
    dataProcessingConsent: profile.dataProcessingConsent,
    aiTrainingConsent: profile.aiTrainingConsent,
  };
}
