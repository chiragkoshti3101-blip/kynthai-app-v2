import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { jsonError, jsonOk, readJson } from '@/lib/api-helpers';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// Feedback schema with proper Zod errorMap (returns string, not object)
const feedbackSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Valid email is required').max(200),
  category: z.enum(['bug', 'feature', 'general'], {
    errorMap: () => 'Category is required',
  }),
  message: z.string().min(1, 'Message is required').max(5000),
});

export async function POST(req: NextRequest) {
  try {
    const limited = rateLimit(req, 5, 60000, { globalKey: true } as const);
    if (limited) return limited;

    const rawBody = await readJson(req);
    if (!rawBody) return jsonError('Invalid JSON', 400, 'INVALID_JSON');

    const result = feedbackSchema.safeParse(rawBody);
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        fields[String(issue.path.join('.') || 'body')] = issue.message;
      }
      return jsonError('Validation failed', 422, 'VALIDATION_ERROR', { fields });
    }

    const feedback = await db.feedback.create({
      data: {
        name: result.data.name,
        email: result.data.email,
        category: result.data.category,
        message: result.data.message,
      },
    });

    return jsonOk({ id: feedback.id, message: 'Feedback submitted successfully' });
  } catch (error) {
    logger.phiSafeError(error, 'feedback.POST');
    return jsonError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}