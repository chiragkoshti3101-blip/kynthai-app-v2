/**
 * Payout service — the DB side of the payout ledger.
 *
 * Responsibilities:
 *  - reverse commission exactly once when a paid booking is refunded/cancelled
 *    (a `clawback` Payout row nets against the partner's next payout);
 *  - build a partner statement from open payout rows;
 *  - settle eligible payouts (past the hold window and above the minimum).
 *
 * Money values are cents, matching Appointment.price / Payout.amount.
 */
import { db } from './db'
import { commissionReversal } from './commission'
import {
  OPEN_PAYOUT_STATUSES,
  summarizePayoutLedger,
  type PayoutStatement,
} from './payout-ledger'

/** Build the current open statement for a partner user. */
export async function buildPartnerStatement(
  userId: string,
  now: Date = new Date(),
): Promise<PayoutStatement> {
  const rows = await db.payout.findMany({
    where: { userId, status: { in: [...OPEN_PAYOUT_STATUSES] } },
    orderBy: { createdAt: 'asc' },
  })
  return summarizePayoutLedger(rows, { now })
}

/**
 * Reverse the commission on an appointment exactly once.
 *
 * Writes a negative `clawback` Payout row keyed by appointmentId (so a retried
 * refund cannot double-claw) and zeroes `commission` on the appointment so it
 * no longer advertises a fee that was refunded.
 */
export async function reverseCommissionForAppointment(
  appointmentId: string,
  reason: string = 'refund',
): Promise<{ reversed: boolean; amount: number }> {
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { doctor: { select: { userId: true } } },
  })
  if (!appt || appt.commission <= 0) return { reversed: false, amount: 0 }

  const existing = await db.payout.findFirst({
    where: { appointmentId, status: 'clawback' },
    select: { id: true },
  })
  if (existing) return { reversed: false, amount: 0 }

  const amount = commissionReversal(appt.commission)
  await db.payout.create({
    data: {
      userId: appt.doctor.userId,
      doctorId: appt.doctorId,
      appointmentId,
      amount: 0,
      platformFee: amount,
      netAmount: amount,
      status: 'clawback',
    },
  })
  await db.appointment.update({
    where: { id: appointmentId },
    data: { commission: 0 },
  })

  return { reversed: true, amount }
}

/**
 * Settle a partner's eligible payouts. Rows newer than the hold window stay
 * open; only cleared rows are marked paid, and clawbacks are settled with them
 * so the balance is netted rather than paid gross.
 */
export async function settlePartnerPayouts(
  userId: string,
  now: Date = new Date(),
): Promise<{ settled: number; statement: PayoutStatement }> {
  const statement = await buildPartnerStatement(userId, now)
  if (!statement.payoutDue) return { settled: 0, statement }

  const cutoff = new Date(now.getTime() - statement.holdDays * 24 * 60 * 60 * 1000)
  const result = await db.payout.updateMany({
    where: {
      userId,
      status: { in: [...OPEN_PAYOUT_STATUSES] },
      createdAt: { lt: cutoff },
    },
    data: { status: 'paid', paidAt: now },
  })

  return { settled: result.count, statement }
}

/** Every partner user with at least one open payout row. */
export async function usersWithOpenPayouts(): Promise<string[]> {
  const rows = await db.payout.findMany({
    where: { status: { in: [...OPEN_PAYOUT_STATUSES] } },
    select: { userId: true },
    distinct: ['userId'],
  })
  return rows.map((r: { userId: string }) => r.userId)
}
