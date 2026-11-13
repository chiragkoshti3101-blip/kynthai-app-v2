import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/security';
import { requireAdmin, jsonOk, jsonError } from '@/lib/api-helpers';
import { logAudit } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { runFraudChecks } from '@/lib/fraud-checks';
import { SUBSCRIPTION_TIERS, resolveTier } from '@/lib/commission';

export const dynamic = 'force-dynamic';

const CENTS = 100;

// ponytail: single admin overview endpoint. Fine at pre-launch scale; if the
// DB grows past ~50k rows the money/booking aggregations should move to a
// materialized rollup table instead of scanning all rows per request.

export async function GET(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return limited;

  const { response, user } = await requireAdmin(req);
  if (response || !user) return response!;
  const auser = user!;

  await logAudit(auser.id, 'admin.overview');

  try {
  const trendWindowStart = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

    const [
      userRoleGroups,
      tierGroups,
      demoAccounts,
      totalUsers,
      doctors,
      labs,
      appointmentGroups,
      labBookingGroups,
      paymentGroups,
      refundGroups,
      refunds,
      overdueRefunds,
      appointmentTrendRows,
      labBookingTrendRows,
      signupTrendRows,
      patientAppointmentRollup,
      patientLabRollup,
      partnerDoctorRollup,
      partnerLabRollup,
      audit,
    ] = await Promise.all([
      db.user.groupBy({
        by: ['role'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      db.user.groupBy({
        by: ['subscriptionTier'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      db.user.count({ where: { deletedAt: null, isDemo: true } }),
      db.user.count({ where: { deletedAt: null } }),
      db.doctorProfile.findMany({
        select: { id: true, verificationStatus: true, user: { select: { name: true } } },
      }),
      db.labProfile.findMany({
        select: {
          id: true,
          labName: true,
          verificationStatus: true,
          user: { select: { name: true } },
        },
      }),
      db.appointment.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true },
        _sum: { price: true, commission: true },
      }),
      db.labBooking.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { price: true, commission: true, deliveryFee: true },
      }),
      db.payment.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { amount: true },
      }),
      db.refund.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { amount: true },
      }),
      db.refund.findMany({
        where: { createdAt: { gte: trendWindowStart } },
        select: { id: true, amount: true, status: true, createdAt: true },
      }),
      db.refund.count({
        where: {
          status: 'pending',
          createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      db.appointment.findMany({
        where: { deletedAt: null, createdAt: { gte: trendWindowStart } },
        select: {
          patientId: true,
          doctorId: true,
          status: true,
          price: true,
          commission: true,
          createdAt: true,
        },
      }),
      db.labBooking.findMany({
        where: { createdAt: { gte: trendWindowStart } },
        select: {
          patientId: true,
          labId: true,
          status: true,
          price: true,
          commission: true,
          deliveryFee: true,
          createdAt: true,
        },
      }),
      db.user.findMany({
        where: { deletedAt: null, createdAt: { gte: trendWindowStart } },
        select: { id: true, name: true, email: true, role: true, subscriptionTier: true, createdAt: true },
      }),
      db.appointment.groupBy({
        by: ['patientId'],
        where: { deletedAt: null },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      db.labBooking.groupBy({
        by: ['patientId'],
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      db.appointment.groupBy({
        by: ['doctorId'],
        where: { deletedAt: null, status: { not: 'cancelled' } },
        _count: { _all: true },
        _sum: { price: true },
      }),
      db.labBooking.groupBy({
        by: ['labId'],
        where: { status: { not: 'cancelled' } },
        _count: { _all: true },
        _sum: { price: true },
      }),
      db.auditLog.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);

    const { summary: fraud } = await runFraudChecks();

    // ---- Role / account counts (all accounts, demo included — the system is the truth) ----
    const usersByRole: Record<string, number> = { patient: 0, doctor: 0, lab: 0, caretaker: 0, admin: 0 };
    for (const g of userRoleGroups) {
      usersByRole[g.role] = g._count._all;
    }

    // ---- Partner applications ----
    const appStatus = (list: { verificationStatus: string }[]) => {
      const s = { pending: 0, approved: 0, rejected: 0, total: list.length };
      for (const d of list) {
        const k = d.verificationStatus as keyof typeof s;
        if (k in s) s[k] += 1;
      }
      return s;
    };

    // ---- Appointments / lab bookings (aggregated — no full-table scan) ----
    const apptStatus: Record<string, number> = {};
    let apptGross = 0;
    let apptGrossCompleted = 0;
    let apptCommission = 0;
    let appointmentTotal = 0;
    for (const a of appointmentGroups) {
      apptStatus[a.status] = a._count._all;
      appointmentTotal += a._count._all;
      const price = a._sum.price ?? 0;
      const commission = a._sum.commission ?? 0;
      if (a.status !== 'cancelled') apptGross += price;
      if (a.status === 'completed') {
        apptGrossCompleted += price;
        apptCommission += commission;
      }
    }

    const labStatus: Record<string, number> = {};
    let labGross = 0;
    let labGrossCompleted = 0;
    let labCommission = 0;
    let labBookingTotal = 0;
    for (const b of labBookingGroups) {
      labStatus[b.status] = b._count._all;
      labBookingTotal += b._count._all;
      const price = b._sum.price ?? 0;
      const deliveryFee = b._sum.deliveryFee ?? 0;
      const commission = b._sum.commission ?? 0;
      if (b.status !== 'cancelled') labGross += price + deliveryFee;
      if (b.status === 'completed') {
        labGrossCompleted += price + deliveryFee;
        labCommission += commission;
      }
    }

    // ---- Payments / refunds ----
    const paymentStatus: Record<string, { count: number; sum: number }> = {};
    for (const p of paymentGroups) {
      paymentStatus[p.status] = { count: p._count._all, sum: p._sum.amount ?? 0 };
    }

    const refundStatus: Record<string, number> = {};
    let refundsIssuedCents = 0;
    let refundTotal = 0;
    for (const r of refundGroups) {
      refundStatus[r.status] = r._count._all;
      refundTotal += r._count._all;
      if (r.status === 'completed' || r.status === 'processing') {
        refundsIssuedCents += r._sum.amount ?? 0;
      }
    }

    // ---- Revenue ----
    const grossUsd = (apptGross + labGross) / CENTS;
    const grossCompletedUsd = (apptGrossCompleted + labGrossCompleted) / CENTS;
    const platformCommissionUsd = (apptCommission + labCommission) / CENTS;
    const doctorCommissionUsd = apptCommission / CENTS;
    const labCommissionUsd = labCommission / CENTS;
    const refundsIssuedUsd = refundsIssuedCents / CENTS;
    const netUsd = platformCommissionUsd - refundsIssuedUsd;
    const takeRatePct =
      grossCompletedUsd > 0 ? (platformCommissionUsd / grossCompletedUsd) * 100 : 0;

    // MRR: paid tiers × monthly price. 'pro' tier has no dedicated price in
    // SUBSCRIPTION_TIERS — it inherits 'plus' pricing (legacy tier).
    const mrrCents = tierGroups.reduce((sum, g) => {
      const key = g.subscriptionTier === 'pro' ? 'plus' : g.subscriptionTier;
      const tier = SUBSCRIPTION_TIERS[key];
      if (!tier) return sum;
      return sum + g._count._all * Math.round(tier.monthly * 100);
    }, 0);
    const mrrUsd = mrrCents / CENTS;
    // Est. annualized commission as MRR contribution (platform commission ÷ 12).
    const totalMrrUsd = mrrUsd + platformCommissionUsd / 12;

    // ---- Partner leaderboard (top 8 by gross, aggregated) ----
    const partnerMap = new Map<
      string,
      { id: string; name: string; type: 'Doctor' | 'Lab'; lifetimeOrders: number; grossUsd: number }
    >();
    for (const a of partnerDoctorRollup) {
      const doc = doctors.find(d => d.id === a.doctorId);
      partnerMap.set(`d-${a.doctorId}`, {
        id: a.doctorId,
        name: doc?.user.name ?? 'Unknown doctor',
        type: 'Doctor',
        lifetimeOrders: a._count._all,
        grossUsd: (a._sum.price ?? 0) / CENTS,
      });
    }
    for (const b of partnerLabRollup) {
      const lab = labs.find(l => l.id === b.labId);
      partnerMap.set(`l-${b.labId}`, {
        id: b.labId,
        name: lab?.labName ?? lab?.user.name ?? 'Unknown lab',
        type: 'Lab',
        lifetimeOrders: b._count._all,
        grossUsd: (b._sum.price ?? 0) / CENTS,
      });
    }
    const partners = [...partnerMap.values()]
      .map(p => ({ ...p, tier: resolveTier(p.lifetimeOrders) }))
      .sort((x, y) => y.grossUsd - x.grossUsd)
      .slice(0, 8);

    // ---- Retention (per-patient rollups) ----
    const patientRoleCount = usersByRole.patient ?? 0;
    const bookingCount = new Map<string, number>();
    const lastBooking = new Map<string, number>();
    const touch = (pid: string, count: number, last: Date | null) => {
      bookingCount.set(pid, (bookingCount.get(pid) ?? 0) + count);
      const ts = last?.getTime() ?? 0;
      const prev = lastBooking.get(pid) ?? 0;
      if (ts > prev) lastBooking.set(pid, ts);
    };
    for (const a of patientAppointmentRollup) {
      touch(a.patientId, a._count._all, a._max.createdAt);
    }
    for (const b of patientLabRollup) {
      touch(b.patientId, b._count._all, b._max.createdAt);
    }

    const totalPatients = patientRoleCount;
    let activated = 0;
    let repeat = 0;
    const atRisk: {
      id: string;
      name: string;
      tier: string;
      days: number;
      reason: string;
      risk: 'high' | 'medium' | 'low';
    }[] = [];
    const now = Date.now();
    const atRiskPatientIds: string[] = [];
    for (const [pid, n] of bookingCount.entries()) {
      if (n === 0) continue;
      activated += 1;
      if (n >= 2) repeat += 1;
      const last = lastBooking.get(pid) ?? 0;
      const days = Math.floor((now - last) / (24 * 60 * 60 * 1000));
      if (days >= 7) atRiskPatientIds.push(pid);
    }
    if (atRiskPatientIds.length > 0) {
      const atRiskUsers = await db.user.findMany({
        where: { id: { in: atRiskPatientIds.slice(0, 100) } },
        select: { id: true, name: true, email: true, subscriptionTier: true },
      });
      const byId = new Map(atRiskUsers.map(u => [u.id, u]));
      for (const pid of atRiskPatientIds.slice(0, 100)) {
        const last = lastBooking.get(pid) ?? 0;
        const days = Math.floor((now - last) / (24 * 60 * 60 * 1000));
        const u = byId.get(pid);
        atRisk.push({
          id: pid,
          name: u?.name ?? u?.email ?? pid,
          tier: u?.subscriptionTier ?? 'free',
          days,
          reason: `No bookings in ${days} days`,
          risk: days >= 30 ? 'high' : days >= 14 ? 'medium' : 'low',
        });
      }
    }
    atRisk.sort((a, b) => b.days - a.days);

    // ---- Trends ----
    const fmtDay = (d: Date) => d.toISOString().slice(0, 10);
    const fmtMonth = (d: Date) => d.toISOString().slice(0, 7);

    const dayMap = new Map<string, { signups: number; bookings: number }>();
    const monthMap = new Map<string, { gross: number; commission: number; refunds: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      dayMap.set(fmtDay(d), { signups: 0, bookings: 0 });
    }
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.now() - i * 30 * 24 * 60 * 60 * 1000);
      monthMap.set(fmtMonth(d), { gross: 0, commission: 0, refunds: 0 });
    }
    for (const u of signupTrendRows) {
      const key = fmtDay(u.createdAt);
      const e = dayMap.get(key);
      if (e) e.signups += 1;
    }
    for (const a of appointmentTrendRows) {
      const key = fmtDay(a.createdAt);
      const e = dayMap.get(key);
      if (e) e.bookings += 1;
      const mk = fmtMonth(a.createdAt);
      const m = monthMap.get(mk);
      if (!m) continue;
      if (a.status !== 'cancelled') m.gross += a.price;
      if (a.status === 'completed') m.commission += a.commission;
    }
    for (const b of labBookingTrendRows) {
      const key = fmtDay(b.createdAt);
      const e = dayMap.get(key);
      if (e) e.bookings += 1;
      const mk = fmtMonth(b.createdAt);
      const m = monthMap.get(mk);
      if (!m) continue;
      if (b.status !== 'cancelled') m.gross += b.price;
      if (b.status === 'completed') m.commission += b.commission;
    }
    for (const r of refunds) {
      const mk = fmtMonth(r.createdAt);
      const m = monthMap.get(mk);
      if (m) m.refunds += r.amount;
    }

    const signups30 = [...dayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, count: v.signups }));
    const bookings30 = [...dayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, count: v.bookings }));
    const revenue6m = [...monthMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({
        month,
        gross: v.gross / CENTS,
        commission: v.commission / CENTS,
        refunds: v.refunds / CENTS,
      }));

    return jsonOk({
      fetchedAt: new Date().toISOString(),
      stats: {
        users: { ...usersByRole, total: totalUsers, demoAccounts },
        doctorApps: appStatus(doctors as { verificationStatus: string }[]),
        labApps: appStatus(labs as { verificationStatus: string }[]),
        appointments: { ...apptStatus, total: appointmentTotal },
        labBookings: { ...labStatus, total: labBookingTotal },
        payments: Object.fromEntries(
          Object.entries(paymentStatus).map(([k, v]) => [k, { ...v, usd: v.sum / CENTS }])
        ),
        refunds: {
          ...refundStatus,
          overdue: overdueRefunds,
          total: refundTotal,
          issuedUsd: refundsIssuedUsd,
        },
        fraud,
        retention: { totalPatients, activated, repeat, atRiskCount: atRisk.length },
      },
      revenue: {
        grossUsd,
        grossCompletedUsd,
        platformCommissionUsd,
        doctorCommissionUsd,
        labCommissionUsd,
        refundsIssuedUsd,
        netUsd,
        takeRatePct,
        mrrUsd,
        totalMrrUsd,
      },
      partners,
      atRisk,
      trends: { signups30, bookings30, revenue6m },
      activity: audit.map(a => ({
        id: a.id,
        action: a.action,
        category: a.category,
        outcome: a.outcome,
        riskScore: a.riskScore,
        details: a.details,
        user: a.user ? { name: a.user.name, email: a.user.email } : null,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    // Security: never log raw DB errors — they may contain sensitive health data.
    logger.phiSafeError(error, 'admin.overview');
    return jsonError('Internal server error', 500);
  }
}
