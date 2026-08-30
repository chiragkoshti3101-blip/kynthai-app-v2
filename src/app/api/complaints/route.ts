import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  requireAuth,
  requireAuthWithCsrf,
  jsonError,
  jsonOk,
  readJson,
  checkConsent,
} from '@/lib/api-helpers';
import { logAudit } from '@/lib/auth';
import { sendNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// POST /api/complaints — submit a new complaint/escalation
// ---------------------------------------------------------------------------

const CATEGORIES = [
  'doctor',
  'lab',
  'billing',
  'prescription',
  'medication',
  'identity',
  'technical',
  'privacy',
  'other',
] as const;

const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

export async function POST(req: NextRequest) {
  const { response, user } = await requireAuthWithCsrf(req);
  if (response || !user) return response!;
  const u = user;
  const consentErr = checkConsent(u);
  if (consentErr) return consentErr;

  const body = await readJson<{
    category?: string;
    subject?: string;
    description?: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
    priority?: string;
    evidenceNote?: string;
    proofFile?: string;
  }>(req);
  if (!body) return jsonError('Invalid JSON', 400, 'INVALID_JSON');

  if (!body.category || !CATEGORIES.includes(body.category as (typeof CATEGORIES)[number])) {
    return jsonError(`Category must be one of: ${CATEGORIES.join(', ')}`, 400, 'INVALID_CATEGORY');
  }
  if (!body.subject?.trim()) return jsonError('Subject is required', 400, 'MISSING_SUBJECT');
  if (!body.description?.trim())
    return jsonError('Description is required', 400, 'MISSING_DESCRIPTION');
  if (body.priority && !PRIORITIES.includes(body.priority as (typeof PRIORITIES)[number])) {
    return jsonError('Priority must be low, medium, high, or critical', 400, 'INVALID_PRIORITY');
  }

  const complaint = await db.complaint.create({
    data: {
      userId: u.id,
      category: body.category,
      subject: body.subject.trim(),
      description: body.description.trim(),
      priority: body.priority || 'medium',
      fileToken: body.proofFile || null,
    },
  });

  await logAudit(u.id, 'complaint.create', {
    category: 'access',
    metadata: { complaintId: complaint.id, type: complaint.category },
  });

  // Notify admins about high/critical complaints
  if (complaint.priority === 'high' || complaint.priority === 'critical') {
    const admins = await db.user.findMany({
      where: { role: 'admin' },
      select: { id: true },
    });
    for (const admin of admins) {
      try {
        await sendNotification(
          { userId: admin.id },
          {
            title: `High-priority complaint: ${complaint.category}`,
            body: complaint.subject || 'No subject',
            type: 'complaint_new',
            data: { complaintId: complaint.id, priority: complaint.priority, url: '/admin' },
            dedupeKey: `complaint:${complaint.id}:admin:${admin.id}`,
          }
        );
      } catch {
        // best-effort
      }
    }
  }

  return jsonOk(
    {
      id: complaint.id,
      status: complaint.status,
      category: complaint.category,
      priority: complaint.priority,
      message: 'Your complaint has been submitted. Our team will review it within 2 business days.',
    },
    201
  );
}

// ---------------------------------------------------------------------------
// GET /api/complaints — list my complaints (filter by status)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const { response, user } = await requireAuth(req);
  if (response || !user) return response!;
  const u = user;
  const consentErr = checkConsent(u);
  if (consentErr) return consentErr;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const category = searchParams.get('category');

  const where: Record<string, unknown> = { userId: u.id };
  if (status) where.status = status;
  if (category) where.category = category;

  const complaints = await db.complaint.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return jsonOk(complaints);
}
