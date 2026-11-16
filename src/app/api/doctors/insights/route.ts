import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/auth';
import { rateLimit } from '@/lib/security';
import { requireAuth, jsonError, jsonOk } from '@/lib/api-helpers';
import { logger } from '@/lib/logger';
import { todayStr, dateStr } from '@/lib/utils';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return limited;
  const { response, user } = await requireAuth(req);
  if (response || !user) return response!;
  if (user.role !== 'doctor') return jsonError('Only doctors may view insights', 403);

  await logAudit(user.id, 'doctor.insights.read', { resourceType: 'DoctorProfile' });
  const profile = await db.doctorProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return jsonError('Doctor profile not found', 404);
  if (user.isDemo) {
    return jsonOk({
      patients: [
        {
          id: 'p1',
          name: 'James Carter',
          email: 'james@demo.com',
          adherence: 45,
          trend: 'declining' as const,
          lastConsultation: '2025-01-10',
          activeMedications: 3,
          missedDoses: 8,
          needsAttention: true,
        },
        {
          id: 'p2',
          name: 'Emily Davis',
          email: 'emily@demo.com',
          adherence: 72,
          trend: 'stable' as const,
          lastConsultation: '2025-01-08',
          activeMedications: 2,
          missedDoses: 3,
          needsAttention: false,
        },
        {
          id: 'p3',
          name: 'Michael Brown',
          email: 'michael@demo.com',
          adherence: 38,
          trend: 'declining' as const,
          lastConsultation: '2024-12-28',
          activeMedications: 4,
          missedDoses: 12,
          needsAttention: true,
        },
        {
          id: 'p4',
          name: 'Sarah Wilson',
          email: 'sarah@demo.com',
          adherence: 91,
          trend: 'improving' as const,
          lastConsultation: '2025-01-12',
          activeMedications: 2,
          missedDoses: 1,
          needsAttention: false,
        },
        {
          id: 'p5',
          name: 'David Lee',
          email: 'david@demo.com',
          adherence: 67,
          trend: 'stable' as const,
          lastConsultation: '2025-01-05',
          activeMedications: 1,
          missedDoses: 4,
          needsAttention: false,
        },
      ],
      summary: { total: 5, needsAttention: 2, avgAdherence: 63 },
    });
  }
  try {
    const appointments = await db.appointment.findMany({
      where: { doctorId: profile.id },
      include: { patient: true },
    });
    const patientIds = Array.from(new Set<string>(appointments.map(a => a.patientId)));
    const today = todayStr();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const patientById = new Map<string, { id: string; name: string | null; email: string }>();
    for (const a of appointments) {
      if (!patientById.has(a.patientId)) {
        patientById.set(a.patientId, {
          id: a.patient.id,
          name: a.patient.name,
          email: a.patient.email,
        });
      }
    }

    const allMeds =
      patientIds.length > 0
        ? await db.medication.findMany({
            where: { userId: { in: patientIds }, active: true },
            select: { id: true, userId: true },
          })
        : [];
    const medIdsByPatient = new Map<string, string[]>();
    const allMedIds: string[] = [];
    for (const med of allMeds) {
      if (!med.userId) continue;
      const list = medIdsByPatient.get(med.userId) ?? [];
      list.push(med.id);
      medIdsByPatient.set(med.userId, list);
      allMedIds.push(med.id);
    }

    const weekFrom = dateStr(sevenDaysAgo);
    const prevFrom = dateStr(fourteenDaysAgo);
    const prevTo = dateStr(sevenDaysAgo);
    const [weekReminders, prevWeekReminders] = await Promise.all([
      allMedIds.length
        ? db.reminder.findMany({
            where: { medicationId: { in: allMedIds }, date: { gte: weekFrom } },
          })
        : Promise.resolve([]),
      allMedIds.length
        ? db.reminder.findMany({
            where: { medicationId: { in: allMedIds }, date: { gte: prevFrom, lt: prevTo } },
          })
        : Promise.resolve([]),
    ]);

    const medToPatient = new Map<string, string>();
    for (const med of allMeds) {
      if (med.userId) medToPatient.set(med.id, med.userId);
    }
    const weekByPatient = new Map<string, typeof weekReminders>();
    const prevByPatient = new Map<string, typeof prevWeekReminders>();
    for (const row of weekReminders) {
      const pid = medToPatient.get(row.medicationId);
      if (!pid) continue;
      const bucket = weekByPatient.get(pid) ?? [];
      bucket.push(row);
      weekByPatient.set(pid, bucket);
    }
    for (const row of prevWeekReminders) {
      const pid = medToPatient.get(row.medicationId);
      if (!pid) continue;
      const bucket = prevByPatient.get(pid) ?? [];
      bucket.push(row);
      prevByPatient.set(pid, bucket);
    }

    const patients = patientIds.map(pid => {
      const patient = patientById.get(pid)!;
      const medIds = medIdsByPatient.get(pid) ?? [];
      const week = weekByPatient.get(pid) ?? [];
      const prev = prevByPatient.get(pid) ?? [];
      const takenWeek = week.filter((r: any) => r.status === 'taken').length;
      const adherence = week.length ? Math.round((takenWeek / week.length) * 100) : 0;
      const prevTaken = prev.filter((r: any) => r.status === 'taken').length;
      const prevAdherence = prev.length ? Math.round((prevTaken / prev.length) * 100) : adherence;
      let trend: 'improving' | 'declining' | 'stable' = 'stable';
      if (adherence > prevAdherence + 5) trend = 'improving';
      else if (adherence < prevAdherence - 5) trend = 'declining';
      const lastApt = appointments
        .filter((a: any) => a.patientId === pid)
        .sort(
          (a: any, b: any) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
        )[0];
      const missedDoses = week.filter(
        (r: any) => r.status === 'missed' || r.status === 'pending'
      ).length;
      return {
        id: patient.id,
        name: patient.name,
        email: patient.email,
        adherence,
        trend,
        lastConsultation: lastApt?.scheduledAt?.toISOString() ?? null,
        activeMedications: medIds.length,
        missedDoses,
        needsAttention: adherence < 60 || trend === 'declining',
      };
    });
    const sorted = patients.sort((a, b) => a.adherence - b.adherence);
    const needsAttention = sorted.filter((p: any) => p.needsAttention).length;
    const avgAdherence = sorted.length
      ? Math.round(sorted.reduce((s, p) => s + p.adherence, 0) / sorted.length)
      : 0;
    return jsonOk({
      patients: sorted,
      summary: { total: sorted.length, needsAttention, avgAdherence },
    });
  } catch (error) {
    logger.phiSafeError(error);
    return jsonError('Failed to load insights', 500);
  }
}
