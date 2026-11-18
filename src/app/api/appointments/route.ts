import { NextRequest } from 'next/server';
// import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/auth';
import { sanitizeText, rateLimit } from '@/lib/security';
import {
  requireAuth,
  requireAuthWithCsrf,
  jsonError,
  jsonOk,
  readJson,
  checkConsent,
} from '@/lib/api-helpers';
import { logger } from '@/lib/logger';
import { updateAppointmentSchema, appointmentsQuerySchema } from '@/lib/schemas';
import {
  availabilityRejection,
  checkAvailability,
  isSlotConflictError,
  MAX_APPOINTMENT_MINUTES,
  DEFAULT_APPOINTMENT_MINUTES,
  clinicTimeZone,
  timeRangesOverlap,
} from '@/lib/doctor-availability';
import { sendNotification } from '@/lib/notifications';
import { formatNotificationDate } from '@/lib/notification-time';
// Prevent static generation — reads session + DB at runtime
export const dynamic = 'force-dynamic';

// GET /api/appointments?patientId=...&doctorId=...
// Patient sees own appointments. Doctor sees appointments on their profile.
export async function GET(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return limited;

  const { response, user } = await requireAuth(req);
  if (response || !user) return response!;
  const u = user!;

  const consentErr = checkConsent(u);
  if (consentErr) return consentErr;

  const qpResult = appointmentsQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!qpResult.success) {
    const issues = qpResult.error.issues.map((i: any) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return jsonError('Invalid query parameters', 400, 'VALIDATION_ERROR', { issues });
  }
  const qp = qpResult.data;
  const patientId = qp.patientId;
  const doctorId = qp.doctorId;
  const status = qp.status;
  const cursor = qp.cursor;
  const limit = qp.limit;

  // Read through the app's data layer (service role), not the Supabase anon
  // key: anon requests are filtered by RLS and came back empty for every
  // signed-in patient. Scope the query to the viewer instead.
  const where: Record<string, unknown> = {};

  if (u.role === 'admin') {
    if (patientId) where.patientId = patientId;
    if (doctorId) where.doctorId = doctorId;
  } else if (u.role === 'doctor') {
    const profiles = await db.doctorProfile.findMany({
      where: { userId: u.id },
      select: { id: true },
    });
    const ownDoctorIds = profiles.map((p: { id: string }) => p.id);
    if (doctorId) {
      // IDOR: a doctor may only ask about their own profile.
      if (!ownDoctorIds.includes(doctorId)) {
        return jsonError('Forbidden — doctorId must be your own profile', 403);
      }
      where.doctorId = doctorId;
    } else if (ownDoctorIds.length > 0) {
      where.doctorId = { in: ownDoctorIds };
    } else {
      // No doctor profile means no appointments to show.
      return jsonOk([]);
    }
    if (patientId) where.patientId = patientId;
  } else {
    // IDOR: any non-staff role may only view its own appointments.
    if (patientId && patientId !== u.id) {
      return jsonError('Forbidden — patientId must match session', 403);
    }
    where.patientId = u.id;
    if (doctorId) where.doctorId = doctorId;
  }

  where.deletedAt = null;
  if (status) where.status = status === 'no-show' ? 'no_show' : status;

  try {
    const appts = await db.appointment.findMany({
      where,
      orderBy: { scheduledAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor } } : {}),
      include: {
        patient: { select: { id: true, name: true } },
        doctor: {
          select: {
            id: true,
            specialization: true,
            user: { select: { id: true, name: true } },
          },
        },
      },
    });
    const data = (appts || []).map((a: any) => ({
      id: a.id,
      doctorId: a.doctorId,
      patientId: a.patientId,
      patientName: a.patient?.name ?? 'Patient',
      doctorName: a.doctor?.user?.name ?? 'Your doctor',
      specialization: a.doctor?.specialization ?? 'General Care',
      scheduledAt: a.scheduledAt,
      type: a.type,
      status: a.status,
      price: a.price,
      commission: a.commission,
      reason: a.reason,
      notes: a.notes,
    }));
    return jsonOk(data);
  } catch (err: any) {
    logger.phiSafeError(err);
    return jsonError('Failed to fetch appointments', 500);
  }
}

// POST /api/appointments — book a new appointment
export async function POST(req: NextRequest) {
  const { response, user } = await requireAuthWithCsrf(req);
  if (response || !user) return response!;
  const u = user!;

  await logAudit(user.id, 'appointment.create');

  try {
    const rawBody = await readJson<{
      doctorId?: unknown;
      scheduledAt?: unknown;
      reason?: unknown;
      appointmentType?: unknown;
      durationMinutes?: unknown;
    }>(req);
    if (!rawBody) return jsonError('Invalid JSON', 400, 'INVALID_JSON');

    const doctorId = sanitizeText(String(rawBody.doctorId ?? ''), 60);
    const scheduledAt = sanitizeText(String(rawBody.scheduledAt ?? ''), 60);
    const reason = sanitizeText(String(rawBody.reason ?? ''), 500);
    const appointmentType = sanitizeText(String(rawBody.appointmentType ?? 'video'), 30);

    if (!doctorId || !scheduledAt) {
      return jsonError('doctorId and scheduledAt are required', 400);
    }

    const date = new Date(scheduledAt);
    if (isNaN(date.getTime())) return jsonError('Invalid scheduledAt date', 400);
    if (date < new Date()) return jsonError('Cannot book an appointment in the past', 400);

    // Verify doctor exists and is approved
    const doctor = await db.doctorProfile.findUnique({
      where: { id: doctorId },
      select: {
        id: true,
        userId: true,
        verified: true,
        verificationStatus: true,
        consultationFee: true,
        user: { select: { timezone: true } },
      },
    });
    if (!doctor) return jsonError('Doctor not found', 404);
    if (!['verified', 'approved'].includes(doctor.verificationStatus)) {
      return jsonError('Doctor is not available for booking', 400);
    }

    // ─── Availability gate ────────────────────────────────────────────────
    // Windows are weekly wall-clock strings, so they are read in the doctor's
    // zone. Never the requester's: a caller-supplied zone would let anyone book
    // any hour by claiming to be in another part of the world.
    const timeZone = clinicTimeZone(doctor.user?.timezone);
    const durationMinutes = Math.min(
      MAX_APPOINTMENT_MINUTES,
      Math.max(5, Number(rawBody.durationMinutes) || DEFAULT_APPOINTMENT_MINUTES),
    );

    const availabilitySlots = await db.doctorAvailabilitySlot.findMany({
      where: { doctorId, active: true },
      select: { day: true, start: true, end: true },
    });
    const availability = checkAvailability({
      slots: availabilitySlots,
      instant: date,
      durationMinutes,
      timeZone,
    });
    if (!availability.allowed) {
      const { message, details } = availabilityRejection(availability, durationMinutes);
      return jsonError(message, 409, 'OUTSIDE_AVAILABILITY', details);
    }

    // ─── Overlap check ────────────────────────────────────────────────────
    // Friendly rejection before the insert; the exclusion constraint
    // `appointments_doctor_slot_no_overlap` is the real guarantee. Any booking
    // that can overlap this one starts at most MAX_APPOINTMENT_MINUTES earlier
    // and before this one ends, so that is the whole scan.
    const nearby = await db.appointment.findMany({
      where: {
        doctorId,
        status: { in: ['pending', 'confirmed', 'rescheduled'] },
        deletedAt: null,
        scheduledAt: {
          gte: new Date(date.getTime() - MAX_APPOINTMENT_MINUTES * 60_000),
          lt: new Date(date.getTime() + durationMinutes * 60_000),
        },
      },
      select: { id: true, scheduledAt: true, durationMinutes: true },
    });
    const conflict = nearby.find((a: any) =>
      timeRangesOverlap(date, durationMinutes, a.scheduledAt, a.durationMinutes ?? DEFAULT_APPOINTMENT_MINUTES),
    );
    if (conflict) {
      return jsonError('That time has just been taken. Pick another slot.', 409, 'SLOT_UNAVAILABLE');
    }

    let appointment: any;
    try {
      appointment = await db.appointment.create({
        data: {
          patientId: u.id,
          doctorId,
          scheduledAt: date,
          durationMinutes,
          reason: reason || undefined,
          type: appointmentType,
          status: 'pending',
          price: doctor.consultationFee,
        },
        include: { doctor: { include: { user: true } }, patient: true },
      });
    } catch (createError) {
      // Another booking won the race between our check and this insert.
      if (isSlotConflictError(createError)) {
        return jsonError('That time has just been taken. Pick another slot.', 409, 'SLOT_UNAVAILABLE');
      }
      throw createError;
    }

    await logAudit(u.id, 'appointment.created', `appointment=${appointment.id}`);

    // Notify patient about the booked appointment (push + email).
    const patientApptDate = formatNotificationDate(date, appointment.patient.timezone);
    const doctorApptDate = formatNotificationDate(date, appointment.doctor.user.timezone);
    const apptType = appointmentType === 'video' ? 'Video consultation' : 'In-person visit';
    
    await sendNotification(
      { userId: u.id, email: u.email },
      {
        title: 'Appointment request sent',
        body: `Your ${apptType} request with Dr. ${appointment.doctor.user.name} for ${patientApptDate} has been sent.\n\n` +
          `Reason: ${reason || 'General consultation'}\n` +
          `Fee: $${doctor.consultationFee}\n\n` +
          `Status: Pending — waiting for doctor to confirm\n\n` +
          `You'll receive a notification once the doctor responds.\n\n` +
          `Open Kynthai to view: ${process.env.NEXT_PUBLIC_APP_URL || 'https://kynthai.app'}/patient`,
        type: 'appointment',
        data: { appointmentId: appointment.id, doctorId, scheduledAt: date.toISOString(), url: '/patient' },
        dedupeKey: `appointment:${appointment.id}:requested:patient`,
      }
    ).catch(() => {});

    // Notify the doctor — actionable Accept / Decline in the doctor portal.
    await sendNotification(
      {
        userId: doctor.userId,
        email: appointment.doctor.user.email || undefined,
      },
      {
        title: 'New consultation request — Accept or Decline',
        body: `${u.name} requested a ${apptType} for ${doctorApptDate}.\n\n` +
          `Reason: ${reason || 'General consultation'}\n\n` +
          `Open Kynthai Doctor → Accept or Decline:\n` +
          `${process.env.NEXT_PUBLIC_APP_URL || 'https://kynthai.app'}/doctor`,
        type: 'appointment',
        data: {
          appointmentId: appointment.id,
          patientId: u.id,
          action: 'accept_or_decline',
          url: '/doctor',
        },
        dedupeKey: `appointment:${appointment.id}:requested:doctor`,
      }
    ).catch(() => {});

    return jsonOk(appointment, 201);
  } catch (error) {
    logger.phiSafeError(error);
    return jsonError('Failed to create appointment', 500, 'APPOINTMENT_ERROR');
  }
}

export async function PUT(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return limited;

  const { response, user } = await requireAuthWithCsrf(req);
  if (response || !user) return response!;
  const u = user!;

  const rawBody = await readJson(req);
  if (!rawBody) return jsonError('Invalid JSON', 400, 'INVALID_JSON');
  const apptResult = updateAppointmentSchema.safeParse(rawBody);
  if (!apptResult.success) {
    const fields: Record<string, string> = {};
    for (const issue of apptResult.error.issues) {
      fields[String(issue.path.join('.') || 'body')] = issue.message;
    }
    return jsonError('Validation failed', 422, 'VALIDATION_ERROR', { fields });
  }
  const body = apptResult.data;
  const status = body.status;

  const appt = await db.appointment.findUnique({
    where: { id: body.id },
    include: {
      patient: { select: { id: true, name: true, email: true, timezone: true } },
      doctor: { include: { user: { select: { id: true, name: true, email: true, timezone: true } } } },
    },
  });
  if (!appt) return jsonError('Appointment not found', 404);

  // IDOR: only the patient, the doctor (owner of doctorId profile), or admin can update.
  const doctorProfile = await db.doctorProfile.findUnique({ where: { id: appt.doctorId } });
  const isPatient = appt.patientId === u.id;
  const isDoctor = doctorProfile?.userId === u.id;
  const isAdmin = u.role === 'admin';
  if (!isPatient && !isDoctor && !isAdmin) {
    return jsonError('Forbidden — you cannot modify this appointment', 403);
  }

  // Validate status transitions
  const validTransitions: Record<string, string[]> = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['completed', 'cancelled', 'no-show'],
    cancelled: [],
    completed: [],
    'no-show': [],
  };
  const normalizedStatus = status === 'no-show' ? 'no_show' : status;
  const allowed = validTransitions[appt.status] || [];
  if (!allowed.includes(normalizedStatus)) {
    return jsonError(`Cannot change status from '${appt.status}' to '${normalizedStatus}'`, 400);
  }

  const updated = await db.appointment.update({
    where: { id: appt.id },
    data: {
      status: normalizedStatus,
      notes: body.notes ? sanitizeText(body.notes, 1000) : undefined,
    },
  });

  await logAudit(u.id, 'appointment.update', `appt=${appt.id} status=${status}`);

  // Notify the other party about the status change
  const patientApptDate = formatNotificationDate(appt.scheduledAt, appt.patient.timezone);
  const doctorApptDate = formatNotificationDate(appt.scheduledAt, appt.doctor.user.timezone);
  const apptType = appt.type === 'video' ? 'Video consultation' : 'In-person visit';
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://kynthai.app';

  if (normalizedStatus === 'confirmed' && isDoctor) {
    // Doctor confirmed → notify patient
    await sendNotification(
      { userId: appt.patientId, email: appt.patient.email },
      {
        title: '✅ Appointment confirmed!',
        body: `Dr. ${appt.doctor.user.name} confirmed your ${apptType} for ${patientApptDate}.\n\n` +
          `Please be ready at the scheduled time.\n\n` +
          `Open Kynthai: ${APP_URL}/patient`,
        type: 'appointment_confirmed',
        data: { appointmentId: appt.id, url: '/patient' },
        dedupeKey: `appointment:${appt.id}:confirmed:patient`,
      }
    ).catch(() => {});
  } else if (normalizedStatus === 'cancelled') {
    // Notify the other party about cancellation
    const cancelledBy = isDoctor ? 'doctor' : isPatient ? 'patient' : 'admin';
    const notifyUserId = isDoctor ? appt.patientId : appt.doctor.userId;
    const notifyEmail = isDoctor ? appt.patient.email : appt.doctor.user.email;
    await sendNotification(
      { userId: notifyUserId, email: notifyEmail },
      {
        title: '❌ Appointment cancelled',
        body: `The ${apptType} on ${isDoctor ? patientApptDate : doctorApptDate} has been cancelled by ${cancelledBy}.\n\n` +
          `Open Kynthai to book a new appointment: ${APP_URL}`,
        type: 'appointment_cancelled',
        data: { appointmentId: appt.id, url: isDoctor ? '/patient' : '/doctor' },
        dedupeKey: `appointment:${appt.id}:cancelled:${notifyUserId}`,
      }
    ).catch(() => {});
  } else if (normalizedStatus === 'completed' && isDoctor) {
    // Doctor marked as completed → notify patient
    await sendNotification(
      { userId: appt.patientId, email: appt.patient.email },
      {
        title: '✅ Consultation completed',
        body: `Your ${apptType} with Dr. ${appt.doctor.user.name} has been marked as completed.\n\n` +
          `Open Kynthai to view your records: ${APP_URL}/patient`,
        type: 'appointment_completed',
        data: { appointmentId: appt.id, url: '/patient' },
        dedupeKey: `appointment:${appt.id}:completed:patient`,
      }
    ).catch(() => {});
  }

  return jsonOk(updated);
}
