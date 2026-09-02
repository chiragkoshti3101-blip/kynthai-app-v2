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
    const [users, doctors, labs, appointments, labBookings, refunds, payments, audit] =
      await Promise.all([
        db.user.findMany({
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            subscriptionTier: true,
            isDemo: true,
            createdAt: true,
          },
        }),
        db.doctorProfile.findMany({
          include: { user: { select: { name: true } } },
        }),
        db.labProfile.findMany({
          include: { user: { select: { name: true } } },
        }),
        db.appointment.findMany({
          where: { deletedAt: null },
          select: {
            id: true,
            patientId: true,
            doctorId: true,
            status: true,
            price: true,
            commission: true,
            createdAt: true,
          },
        }),
        db.labBooking.findMany({
          select: {
            id: true,
            patientId: true,
            labId: true,
            status: true,
            price: true,
            commission: true,
            deliveryFee: true,
            createdAt: true,
          },
        }),
        db.refund.findMany({
          select: { id: true, amount: true, status: true, createdAt: true },
        }),
        db.payment.findMany({
          select: { status: true, amount: true },
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
    let demoAccounts = 0;
    for (const u of users) {
      usersByRole[u.role] = (usersByRole[u.role] ?? 0) + 1;
      if (u.isDemo) demoAccounts += 1;
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

    // ---- Appointments / lab bookings ----
    const apptStatus: Record<string, number> = {};
    let apptGross = 0;
    let apptGrossCompleted = 0;
    let apptCommission = 0;
    for (const a of appointments) {
      apptStatus[a.status] = (apptStatus[a.status] ?? 0) + 1;
      if (a.status !== 'cancelled') apptGross += a.price;
      if (a.status === 'completed') {
        apptGrossCompleted += a.price;
        apptCommission += a.commission;
      }
    }

    const labStatus: Record<string, number> = {};
    let labGross = 0;
    let labGrossCompleted = 0;
    let labCommission = 0;
    for (const b of labBookings) {
      labStatus[b.status] = (labStatus[b.status] ?? 0) + 1;
      if (b.status !== 'cancelled') labGross += b.price + b.deliveryFee;
      if (b.status === 'completed') {
        labGrossCompleted += b.price + b.deliveryFee;
        labCommission += b.commission;
      }
    }

    // ---- Payments / refunds ----
    const paymentStatus: Record<string, { count: number; sum: number }> = {};
    for (const p of payments) {
      const e = (paymentStatus[p.status] ??= { count: 0, sum: 0 });
      e.count += 1;
      e.sum += p.amount;
    }

    const refundStatus: Record<string, number> = {};
    let refundsIssuedCents = 0;
    let overdueRefunds = 0;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    for (const r of refunds) {
      refundStatus[r.status] = (refundStatus[r.status] ?? 0) + 1;
      if (r.status === 'completed' || r.status === 'processing') refundsIssuedCents += r.amount;
      if (r.status === 'pending' && Date.now() - r.createdAt.getTime() > sevenDays) overdueRefunds += 1;
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
    const mrrCents = users.reduce((sum, u) => {
      const key = u.subscriptionTier === 'pro' ? 'plus' : u.subscriptionTier;
      return sum + Math.round(SUBSCRIPTION_TIERS[key].monthly * 100);
    }, 0);
    const mrrUsd = mrrCents / CENTS;
    // Est. annualized commission as MRR contribution (platform commission ÷ 12).
    const totalMrrUsd = mrrUsd + platformCommissionUsd / 12;

    // ---- Partner leaderboard (top 8 by gross) ----
    const partnerMap = new Map<
      string,
      { id: string; name: string; type: 'Doctor' | 'Lab'; lifetimeOrders: number; grossUsd: number }
    >();
    for (const a of appointments) {
      if (a.status === 'cancelled') continue;
      const doc = doctors.find(d => d.id === a.doctorId);
      const name = doc?.user.name ?? 'Unknown doctor';
      const e = partnerMap.get(`d-${a.doctorId}`) ?? {
        id: a.doctorId,
        name,
        type: 'Doctor' as const,
        lifetimeOrders: 0,
        grossUsd: 0,
      };
      e.lifetimeOrders += 1;
      e.grossUsd += a.price / CENTS;
      partnerMap.set(`d-${a.doctorId}`, e);
    }
    for (const b of labBookings) {
      if (b.status === 'cancelled') continue;
      const lab = labs.find(l => l.id === b.labId);
      const name = lab?.labName ?? lab?.user.name ?? 'Unknown lab';
      const e = partnerMap.get(`l-${b.labId}`) ?? {
        id: b.labId,
        name,
        type: 'Lab' as const,
        lifetimeOrders: 0,
        grossUsd: 0,
      };
      e.lifetimeOrders += 1;
      e.grossUsd += b.price / CENTS;
      partnerMap.set(`l-${b.labId}`, e);
    }
    const partners = [...partnerMap.values()]
      .map(p => ({ ...p, tier: resolveTier(p.lifetimeOrders) }))
      .sort((x, y) => y.grossUsd - x.grossUsd)
      .slice(0, 8);

    // ---- Retention ----
    const patientIds = new Set(
      users.filter(u => u.role === 'patient').map(u => u.id)
    );
    const bookingCount = new Map<string, number>();
    const lastBooking = new Map<string, number>();
    const touch = (pid: string, ts: Date) => {
      bookingCount.set(pid, (bookingCount.get(pid) ?? 0) + 1);
      const prev = lastBooking.get(pid) ?? 0;
      if (ts.getTime() > prev) lastBooking.set(pid, ts.getTime());
    };
    for (const a of appointments) touch(a.patientId, a.createdAt);
    for (const b of labBookings) touch(b.patientId, b.createdAt);

    const totalPatients = patientIds.size;
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
    for (const pid of patientIds) {
      const n = bookingCount.get(pid) ?? 0;
      if (n === 0) continue; // never engaged → not "at risk", just not yet active
      activated += 1;
      if (n >= 2) repeat += 1;
      const last = lastBooking.get(pid) ?? 0;
      const days = Math.floor((now - last) / (24 * 60 * 60 * 1000));
      if (days >= 7) {
        const u = users.find(x => x.id === pid);
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
    for (const u of users) {
      const key = fmtDay(u.createdAt);
      const e = dayMap.get(key);
      if (e) e.signups += 1;
      const mk = fmtMonth(u.createdAt);
      const m = monthMap.get(mk);
      if (m) m.gross += 0; // signups aren't revenue; placeholder to keep map warm
    }
    for (const a of appointments) {
      const key = fmtDay(a.createdAt);
      const e = dayMap.get(key);
      if (e) e.bookings += 1;
      const mk = fmtMonth(a.createdAt);
      const m = monthMap.get(mk);
      if (!m) continue;
      if (a.status !== 'cancelled') m.gross += a.price;
      if (a.status === 'completed') m.commission += a.commission;
    }
    for (const b of labBookings) {
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
        users: { ...usersByRole, total: users.length, demoAccounts },
        doctorApps: appStatus(doctors as { verificationStatus: string }[]),
        labApps: appStatus(labs as { verificationStatus: string }[]),
        appointments: { ...apptStatus, total: appointments.length },
        labBookings: { ...labStatus, total: labBookings.length },
        payments: Object.fromEntries(
          Object.entries(paymentStatus).map(([k, v]) => [k, { ...v, usd: v.sum / CENTS }])
        ),
        refunds: {
          ...refundStatus,
          overdue: overdueRefunds,
          total: refunds.length,
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
