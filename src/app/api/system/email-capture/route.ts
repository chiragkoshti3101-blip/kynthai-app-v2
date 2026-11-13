import { NextRequest } from 'next/server';
import { jsonError, jsonOk, requireSystemToken } from '@/lib/api-helpers';
import { getCapturedEmails, extractResetTokenFromEmail } from '@/lib/qa-email-sink';
import { sendEmailReal } from '@/lib/integrations';

export const dynamic = 'force-dynamic';

/**
 * GET /api/system/email-capture?to=user@example.com
 * Bearer CRON_SECRET — non-production QA only.
 * Returns mock-email payloads captured during forgot-password / notifications tests.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return jsonError('Not found', 404);
  }
  const { response } = await requireSystemToken(req);
  if (response) return response;

  const to = req.nextUrl.searchParams.get('to') || undefined;
  const emails = getCapturedEmails(to);
  const enriched = emails.map(e => ({
    ...e,
    resetToken: e.html ? extractResetTokenFromEmail(e.html) : null,
  }));
  return jsonOk({ count: enriched.length, emails: enriched });
}
