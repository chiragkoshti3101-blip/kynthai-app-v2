import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { rateLimit, validatePasswordStrength } from '@/lib/security';
import { jsonError, jsonOk } from '@/lib/api-helpers';
import { checkCsrf } from '@/lib/csrf';
import { logAudit, hashPassword } from '@/lib/auth';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';
import { hashValue } from '@/lib/encryption';

export const runtime = 'nodejs';

const ResetSchema = z.object({
  password: z.string().min(8),
  token: z.string().min(16).optional(),
});

async function resetWithLocalToken(token: string, password: string) {
  const tokenHash = hashValue(token);
  const user = await db.user.findFirst({
    where: {
      passwordResetToken_hash: tokenHash,
      passwordResetExpires: { gt: new Date() },
    },
  });
  if (!user) {
    return jsonError('Invalid or expired reset link. Please request a new one.', 401, 'RESET_UNAUTHORIZED');
  }

  const hashed = await hashPassword(password);
  await db.user.update({
    where: { id: user.id },
    data: {
      password: hashed,
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  });
  await logAudit(user.id, 'auth.password.reset', 'local token reset');
  return jsonOk({ message: 'Password reset successful' });
}

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, 5, 60000, { globalKey: true });
    if (limited) return limited;

    const csrfErr = await checkCsrf(req);
    if (csrfErr) return csrfErr;

    const body = await req.json().catch(() => null);
    const parsed = ResetSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('Password must be at least 8 characters', 400, 'VALIDATION_ERROR');
    }

    const strength = validatePasswordStrength(parsed.data.password);
    if (!strength.valid) {
      return jsonError(strength.errors.join('; '), 400, 'WEAK_PASSWORD');
    }

    if (parsed.data.token) {
      return resetWithLocalToken(parsed.data.token, parsed.data.password);
    }

    const supabase = createServerClient(
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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonError('Invalid or expired reset link. Please request a new one.', 401, 'RESET_UNAUTHORIZED');
    }

    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });

    if (error) {
      return jsonError(error.message || 'Password reset failed', 400, 'RESET_FAILED');
    }

    await logAudit(user.id, 'auth.password.reset', 'Password reset completed');

    return jsonOk({ message: 'Password reset successful' });
  } catch (error) {
    logger.phiSafeError(error, 'auth.reset-password');
    return jsonError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
