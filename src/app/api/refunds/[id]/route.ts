import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuthWithCsrf, jsonError, jsonOk, checkConsent } from '@/lib/api-helpers';
import { processRefund } from '@/lib/refund';
import { sendNotification } from '@/lib/notifications';
import { logAudit } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// PATCH /api/refunds/:id
//   - Admin: approve or reject a pending refund
//   - Patient: upload proof file or add notes
// ---------------------------------------------------------------------------
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, user } = await requireAuthWithCsrf(req);
  if (response || !user) return response!;
  const u = user!;
  const consentErr = checkConsent(u);
  if (consentErr) return consentErr;

  const { id } = await params;
  const refund = await db.refund.findUnique({ where: { id } });
  if (!refund) return jsonError('Refund not found', 404);

  const isRequester = refund.userId === u.id;
  // Money operations are admin-only: approving a refund moves real funds.
  // Caretakers can manage their own pending requests but cannot approve.
  const isAdmin = u.role === 'admin';
  if (!isRequester && !isAdmin) return jsonError('Forbidden', 403);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return jsonError('Invalid JSON', 400);

  // ── Admin action ────────────────────────────────────────────────────────
  if (isAdmin && refund.status === 'pending') {
    const action = body.action as 'approve' | 'reject' | undefined;
    if (!action) return jsonError('action required (approve or reject)', 400);

    const updateData: Record<string, unknown> = {
      processedAt: new Date(),
      // Decision trail: admin id is also captured by logAudit below.
      notes: body.reviewNote || refund.notes,
    };

    if (action === 'approve') {
      updateData.status = 'processing';
      const result = await processRefund(id, u.id);
      updateData.status = result.success ? 'completed' : 'failed';

      await db.refund.update({ where: { id }, data: updateData });

      await sendNotification(
        { userId: refund.userId },
        {
          title: result.success ? 'Refund approved' : 'Refund processing failed',
          body: result.success
            ? `Your refund of $${(refund.amount / 100).toFixed(2)} has been approved and is being processed. It will reflect in your account within 5-7 business days.`
            : 'We could not process your refund automatically. Our team will review it and follow up.',
          type: result.success ? 'refund_approved' : 'refund_failed',
          data: { refundId: id, url: '/patient' },
          dedupeKey: `refund:${id}:${result.success ? 'approved' : 'failed'}:patient`,
        }
      );
      await logAudit(u.id, 'refund.approve', `refund=${id} success=${result.success}`);
      return jsonOk({
        status: result.success ? 'completed' : 'failed',
        message: result.success ? 'Refund approved and processing' : 'Refund processing failed',
      });
    }

    // Reject
    updateData.status = 'rejected';
    await db.refund.update({ where: { id }, data: updateData });

    await sendNotification(
      { userId: refund.userId },
      {
        title: 'Refund request reviewed',
        body:
          body.reviewNote ||
          'Your refund request could not be approved. If you have questions, contact support at support@kynthai.app',
        type: 'refund_rejected',
        data: { refundId: id, url: '/patient' },
        dedupeKey: `refund:${id}:rejected:patient`,
      }
    );
    await logAudit(u.id, 'refund.reject', `refund=${id}`);
    return jsonOk({ status: 'rejected', message: 'Refund request rejected' });
  }

  // ── Patient: update refund reason ─────────────────────────────────────
  if (isRequester && refund.status === 'pending') {
    const updateData: Record<string, unknown> = {};
    if (body.reason !== undefined) updateData.reason = body.reason;

    const updated = await db.refund.update({ where: { id }, data: updateData });
    return jsonOk({
      id: updated.id,
      reason: updated.reason,
      message: 'Refund updated',
    });
  }

  return jsonError('Cannot modify this refund in its current state', 400);
}
