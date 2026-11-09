import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/security';
import { jsonError, jsonOk, readJson } from '@/lib/api-helpers';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const newsletterSchema = z.object({
  email: z.string().email('Valid email is required').max(200),
  source: z.enum(['landing', 'pricing', 'footer', 'prelaunch', 'other']).optional(),
});

/**
 * Self-healing table creation.
 *
 * The production Supabase database is managed via `prisma db push` /
 * Supabase SQL — it has NO Prisma migration baseline, so `prisma migrate
 * deploy` refuses to run (P3005). Instead of coupling deploys to a
 * migration step, create the table lazily if it's missing. Idempotent:
 * `IF NOT EXISTS` makes this a no-op after the first successful run.
 *
 * NOTE: each statement runs SEPARATELY — the Supabase PgBouncer pooler
 * rejects multi-statement raw queries.
 */
async function ensureNewsletterTable(): Promise<boolean> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "newsletter_subscribers" (
      "id" VARCHAR NOT NULL,
      "email" VARCHAR NOT NULL,
      "source" VARCHAR,
      "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_subscribers_email_key"
      ON "newsletter_subscribers"("email")`,
    `CREATE INDEX IF NOT EXISTS "newsletter_subscribers_created_at_idx"
      ON "newsletter_subscribers"("created_at")`,
  ];
  try {
    for (const statement of statements) {
      await db.$executeRawUnsafe(statement);
    }
    return true;
  } catch (error) {
    logger.phiSafeError(error, 'newsletter.ensureTable');
    return false;
  }
}

/**
 * True when a Prisma error means the table is missing (P2021) or a column
 * is missing (P2022) — i.e. the storage layer may need the idempotent heal.
 */
function needsTableHeal(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ((error as { code?: string }).code === 'P2021' ||
      (error as { code?: string }).code === 'P2022')
  );
}

export async function POST(req: NextRequest) {
  try {
    const limited = rateLimit(req, 5, 60000, { globalKey: true });
    if (limited) return limited;

    const rawBody = await readJson(req);
    if (!rawBody) return jsonError('Invalid JSON', 400, 'INVALID_JSON');

    const result = newsletterSchema.safeParse(rawBody);
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        fields[String(issue.path.join('.') || 'body')] = issue.message;
      }
      return jsonError('Validation failed', 422, 'VALIDATION_ERROR', { fields });
    }

    const email = result.data.email.toLowerCase().trim();

    const upsert = () =>
      db.newsletterSubscriber.upsert({
        where: { email },
        update: {},
        create: { email, source: result.data.source ?? 'landing' },
      });

    try {
      await upsert();
    } catch (error) {
      // First signup on a fresh or partially-created DB: the table (or a
      // column) may not exist yet. Heal idempotently and retry once. Any
      // other error propagates.
      if (!needsTableHeal(error)) throw error;
      const created = await ensureNewsletterTable();
      if (!created) {
        return jsonError('Subscription storage unavailable', 503, 'STORAGE_UNAVAILABLE');
      }
      await upsert();
    }

    return jsonOk({ message: 'Subscribed successfully' });
  } catch (error) {
    logger.phiSafeError(error, 'newsletter.POST');
    return jsonError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
