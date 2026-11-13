import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { randomBytes } from 'crypto';
import { logAudit } from '@/lib/auth';
import { rateLimit } from '@/lib/security';
import { jsonError, jsonOk } from '@/lib/api-helpers';
import { forgotPasswordSchema } from '@/lib/schemas/auth';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';
import { sendEmailReal } from '@/lib/integrations';
import { passwordResetEmail } from '@/lib/email-templates';
import { createSafeServerClient } from '@/lib/supabase/get-server-client';

export const runtime = 'nodejs';

const RESET_TTL_MS = 30 * 60 * 1000;

async function issueLocalPasswordReset(email: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user?.password) return false;

  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + RESET_TTL_MS);
  await db.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: token,
      passwordResetExpires: expires,
    },
  });

  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const resetLink = `${base}/reset-password?token=${token}`;
  const { subject, html } = passwordResetEmail({
    name: user.name || 'there',
    resetLink,
    expiresInMinutes: 30,
  });
  await sendEmailReal({
    to: email,
    subject,
    html,
    text: `Reset your password: ${resetLink}`,
  });
  await logAudit(user.id, 'auth.forgot-password.local', 'mock-email');
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, 5, 60000, { globalKey: true });
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('Valid email is required', 400, 'VALIDATION_ERROR');
    }
    const email = parsed.data.email.toLowerCase();

    const issuedLocal = await issueLocalPasswordReset(email);

    const supabase = createSafeServerClient({
      getAll: () => req.cookies.getAll(),
      setAll: () => {},
    });

    if (!issuedLocal && supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password`,
      });
      if (error) {
        logger.warn('Password reset request failed', { error: error.message });
      }
    } else if (!issuedLocal) {
      // Supabase-only accounts without local bcrypt — attempt legacy client path
      try {
        const legacy = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            cookies: {
              getAll() {
                return req.cookies.getAll();
              },
              setAll() {},
            },
          },
        );
        await legacy.auth.resetPasswordForEmail(email, {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password`,
        });
      } catch {
        /* degrade silently — enumeration-safe response below */
      }
    }

    return jsonOk({ message: 'If an account exists, a reset link has been sent.' });
  } catch (error) {
    logger.phiSafeError(error, 'auth.forgot-password');
    return jsonError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
