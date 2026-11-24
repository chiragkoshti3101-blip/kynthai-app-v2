import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { applyStandardHeaders, jsonOk } from '@/lib/api-helpers';
export const dynamic = 'force-dynamic';

export async function GET() {
  // Share authentication and revocation policy with protected routes. Profile
  // reads must use the encrypted adapter, never anonymous REST queries.
  const identity = await getAuthUser();
  if (identity) {
    const user = await db.user.findUnique({
      where: { id: identity.id },
      select: {
        id: true, email: true, name: true, role: true, phone: true,
        dateOfBirth: true, subscriptionTier: true, emailVerified: true,
        consentAccepted: true, dataProcessingConsent: true,
        aiTrainingConsent: true, isDemo: true,
      },
    });
    if (user) {
      return applyStandardHeaders(jsonOk({
        authenticated: true,
        user: {
          ...user,
          dateOfBirth: user.dateOfBirth?.toISOString?.() ?? user.dateOfBirth ?? null,
          emailVerified: !!user.emailVerified,
        },
      }));
    }
  }
  return applyStandardHeaders(jsonOk({ authenticated: false, user: null }));
}
