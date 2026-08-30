import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  requireAuth,
  requireAuthWithCsrf,
  jsonError,
  jsonOk,
  checkConsent,
} from '@/lib/api-helpers';
import { logAudit } from '@/lib/auth';
import { sendNotification } from '@/lib/notifications';
import { rateLimit } from '@/lib/security';
import {
  createRefund,
  processRefund,
  checkRefundEligibility,
  type RefundReason,
} from '@/lib/refund';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// POST /api/refunds — patient requests a refund with proof
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const { response, user } = await requireAuthWithCsrf(req);
  if (response || !user) return response!;
  const u = user!;
  const consentErr = checkConsent(u);
  if (consentErr) return consentErr;

  const body = await req.json().catch(() => null);
  if (!body) return jsonError('Invalid JSON', 400);
  if (!body.appointmentId) {
    return jsonError('appointmentId required', 400);
  }
  if (!body.reason || !body.reason.trim()) {
    return jsonError('reason required', 400);
  }

  const appt = await db.appointment.findUnique({
    where: { id: body.appointmentId },
    include: { doctor: { include: { user: true } } },
  });
  if (!appt) return jsonError('Appointment not found', 404);
  if (appt.patientId !== u.id && u.role !== 'admin') {
    return jsonError('You can only request refunds for your own appointments', 403);
  }

  // Already a pending refund?
  const existing = await db.refund.findFirst({
    where: {
      appointmentId: appt.id,
      status: 'pending',
    },
  });
  if (existing) {
    return jsonError('A refund request for this is already under review', 400, 'ALREADY_PENDING');
  }

  // Eligibility check
  const scheduledAt = appt.scheduledAt.toISOString();
  const hoursBefore = Math.max(0, (appt.scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60));
  const eligibility = checkRefundEligibility(
    appt.price,
    appt.commission,
    appt.status,
    scheduledAt,
    body.reason,
    hoursBefore
  );

  if (!eligibility.eligible && body.reason !== 'complaint') {
    return jsonError(eligibility.reason, 400, 'NOT_ELIGIBLE');
  }

  // Find linked payment record — payments are NOT linked to appointments in
  // the DB schema, so match the patient's latest succeeded consultation
  // payment of the exact appointment amount. Never fall back to the
  // appointment id: refund.paymentId is a required FK to Payment, so writing
  // appt.id there violates the constraint and 500s the request.
  const payment = await db.payment.findFirst({
    where: {
      userId: appt.patientId,
      type: 'consultation',
      status: 'succeeded',
      amount: appt.price,
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!payment) {
    return jsonError(
      'Payment record not found for this appointment — contact support@kynthai.app',
      409,
      'NO_PAYMENT_RECORD'
    );
  }

  // Create refund
  const refund = await db.refund.create({
    data: {
      userId: u.id,
      paymentId: payment.id,
      appointmentId: appt.id,
      amount: eligibility.refundAmount,
      reason: body.reason.trim(),
      status: 'pending',
      requestedBy: 'user',
    },
  });

  await logAudit(u.id, 'refund.request', `refund=${refund.id} amount=${eligibility.refundAmount}`);

  const reviewDeadlineDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const deadline = reviewDeadlineDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  await sendNotification(
    { userId: u.id },
    {
      title: 'Refund request submitted',
      body: `Your $${(eligibility.refundAmount / 100).toFixed(2)} refund request is with our team. We will respond before ${deadline}.`,
      type: 'refund_request_submitted',
      data: { refundId: refund.id, url: '/patient' },
      dedupeKey: `refund:${refund.id}:submitted:patient`,
    }
  );

  // Notify admins
  const admins = await db.user.findMany({ where: { role: 'admin' }, select: { id: true } });
  for (const admin of admins) {
    await sendNotification(
      { userId: admin.id },
      {
        title: 'New refund request',
        body: `${u.name || u.email} requested $${(eligibility.refundAmount / 100).toFixed(2)} — ${body.reason}`,
        type: 'refund_new',
        data: { refundId: refund.id, url: '/admin' },
        dedupeKey: `refund:${refund.id}:new:admin:${admin.id}`,
      }
    );
  }

  return jsonOk(
    {
      id: refund.id,
      status: 'pending',
      refundAmount: eligibility.refundAmount,
      reason: eligibility.reason,
      policy: eligibility.policy,
      reviewDeadline: reviewDeadlineDate.toISOString(),
      message: 'Your refund request is under review. You will hear back within 7 business days.',
    },
    201
  );
}

// ---------------------------------------------------------------------------
// GET /api/refunds
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return limited;
  const { response, user } = await requireAuth(req);
  if (response || !user) return response!;
  const u = user!;
  const consentErr = checkConsent(u);
  if (consentErr) return consentErr;

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status');
  const overdue = searchParams.get('overdue');

  let where: Record<string, unknown> = {};

  if (u.role === 'patient' || u.role === 'caretaker') {
    // Caretakers manage family accounts — scope to their own refunds only
    // (previously caretakers fell through to `where = {}` and could list
    // every patient's refunds).
    where.userId = u.id;
  } else if (u.role === 'admin') {
    // see all
  } else if (u.role === 'doctor') {
    const doc = await db.doctorProfile.findUnique({
      where: { userId: u.id },
      select: { id: true },
    });
    if (doc) {
      const appts = await db.appointment.findMany({
        where: { doctorId: doc.id },
        select: { id: true },
      });
      where.appointmentId = { in: appts.map((a: any) => a.id) };
    }
  } else if (u.role === 'lab') {
    // ponytail: lab-booking refunds are not supported yet (Refund has no
    // labBookingId column in the DB), so labs see an empty list. When lab
    // refunds ship, add the column + migration and filter on labBookingId.
    where.appointmentId = { in: [] };
  }

  if (overdue === 'true') {
    // ponytail: 'overdue' = still pending past the 7-business-day review
    // window. Computed from createdAt because the Refund table has no
    // reviewDeadline column; the deadline promise is sent to patients at
    // request time (createdAt + 7 days), so this stays consistent with it.
    // Overdue overrides any ?status= filter (pending is the only state that
    // can be overdue).
    where.status = 'pending';
    where.createdAt = { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
  } else if (statusFilter) {
    where.status = statusFilter;
  }

  const refunds = await db.refund.findMany({
    where,
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return jsonOk(refunds);
}
