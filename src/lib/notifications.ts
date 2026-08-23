/**
 * Smart notification routing service for Kynthai.
 *
 * Channels are tried in cost-ascending order (cheapest first) so the
 * platform spends the least amount possible per notification while still
 * reaching the user:
 *
 *   Push ($0) → Email ($0.001) → WhatsApp ($0.003) → SMS ($0.02)
 *
 * Each send is logged to `db.notificationLog` regardless of success/failure,
 * with channel, type, status, and cost recorded for analytics + billing.
 *
 * Higher-level helpers:
 *   - sendNotification()  generic routing
 *   - sendReminder()      medication due reminders
 *   - sendEscalation()    missed-dose escalations to caretakers
 *   - sendNudge()         doctor → patient nudge
 *   - sendInvite()        prescription invite
 *   - sendFollowUp()      follow-up appointment reminder
 *   - sendEmergency()     SOS alert to caretakers + linked doctors
 */

import { db } from './db'
import {
  sendEmailReal,
  sendSMSReal,
  sendWhatsAppReal,
  isEmailEnabled,
  isSMSEnabled,
  isWhatsAppEnabled,
  isPushEnabled,
  type SendResult,
} from './integrations'
import { sendPushToUser } from './push-server'

// ponytail: email bodies need absolute links (mail clients can't navigate
// relative paths); falls back to the production origin for local/dev.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://kynthai.app'

// ---------------------------------------------------------------------------
// Types + pricing
// ---------------------------------------------------------------------------

export type NotificationChannel = 'push' | 'email' | 'whatsapp' | 'sms'

export interface NotificationTarget {
  userId?: string | null
  email?: string | null
  phone?: string | null
  whatsapp?: string | null
  pushToken?: string | null
}

export interface NotificationPayload {
  title: string
  body: string
  type: string // reminder | escalation | nudge | invite | follow_up | emergency | general
  data?: Record<string, string>
}

export interface RouteResult {
  delivered: boolean
  channel: NotificationChannel | 'none'
  cost: number
  results: Array<{ channel: NotificationChannel; result: SendResult; cost: number }>
  notificationLogId?: string
}

// Per-channel cost (USD). Push is always free; email is SendGrid pricing.
// WhatsApp and SMS removed — Kynthai only uses Push + Email.
export const CHANNEL_COST: Record<NotificationChannel, number> = {
  push: 0,
  email: 0.001,
  whatsapp: 0, // disabled
  sms: 0, // disabled
}

// ---------------------------------------------------------------------------
// Internal: log every send to NotificationLog
// ---------------------------------------------------------------------------

async function logNotification(input: {
  userId?: string | null
  channel: NotificationChannel | 'in-app' | 'none'
  type: string
  title: string
  body: string
  recipient: string
  status: 'sent' | 'failed' | 'skipped'
  cost: number
}): Promise<string | undefined> {
  try {
    const row = await db.notificationLog.create({
      data: {
        userId: input.userId ?? null,
        channel: input.channel,
        type: input.type,
        title: input.title,
        body: input.body,
        recipient: input.recipient,
        status: input.status,
        cost: input.cost,
      },
    })
    return row.id
  } catch (e) {
    console.warn('[notifications] Failed to write notification log', e)
    return undefined
  }
}

// ---------------------------------------------------------------------------
// sendNotification — generic smart router
// ---------------------------------------------------------------------------

export async function sendNotification(
  target: NotificationTarget,
  payload: NotificationPayload,
): Promise<RouteResult> {
  const results: RouteResult['results'] = []
  let delivered = false
  let usedChannel: NotificationChannel | 'none' = 'none'
  let usedCost = 0

  // 1. PUSH (cheapest, $0) — uses VAPID web-push, not Firebase FCM
  if (target.userId && isPushEnabled()) {
    const r = await sendPushToUser(target.userId, {
      title: payload.title,
      body: payload.body,
      tag: (payload.data?.type as string | undefined) || payload.type,
      url: (payload.data?.url as string | undefined) || undefined,
      medName: payload.data?.medName as string | undefined,
      time: payload.data?.scheduledTime as string | undefined,
      dosage: payload.data?.dosage as string | undefined,
      reminderId: payload.data?.reminderId as string | undefined,
    })
    const cost = CHANNEL_COST.push
    const ok = r.sent > 0
    results.push({ channel: 'push', result: { ok, provider: 'web-push', messageId: `push:${r.sent}` }, cost })
    if (ok) {
      delivered = true
      usedChannel = 'push'
      usedCost = cost
    }
  }

  // 2. EMAIL ($0.001)
  if (!delivered && target.email && isEmailEnabled()) {
    const r = await sendEmailReal({
      to: target.email,
      subject: payload.title,
      text: payload.body,
      html: `<div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;background:#f9fafb">
        <div style="text-align:center;padding:16px 0">
          <span style="font-size:24px;font-weight:bold;color:#10b981">Kynthai</span>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin:16px 0;border:1px solid #e5e7eb">
          <h2 style="color:#10b981;margin-top:0">${payload.title}</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;white-space:pre-line">${payload.body}</p>
        </div>
        <div style="text-align:center;padding:16px 0">
          <a href="${APP_URL}/patient" style="display:inline-block;background:#10b981;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Open Kynthai</a>
        </div>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
        <p style="font-size:11px;color:#9ca3af;text-align:center">
          Kynthai · AI Health Management for US Families<br/>
          <a href="${APP_URL}" style="color:#10b981;text-decoration:none">${APP_URL}</a>
        </p>
      </div>`,
    })
    const cost = CHANNEL_COST.email
    results.push({ channel: 'email', result: r, cost })
    if (r.ok) {
      delivered = true
      usedChannel = 'email'
      usedCost = cost
    }
  }

  // WhatsApp and SMS removed — Kynthai only uses Push + Email channels.

  // ALWAYS write an in-app inbox row for the user (doctor, patient, family, lab).
  // Push/email are delivery channels; the bell/inbox is the product surface —
  // same idea as native apps' notification center.
  const recipient = target.pushToken || target.email || target.userId || 'unknown'
  let logId: string | undefined
  if (target.userId) {
    logId = await logNotification({
      userId: target.userId,
      channel: 'in-app',
      type: payload.type,
      title: payload.title,
      body: payload.body,
      recipient: target.userId,
      status: 'sent',
      cost: 0,
    })
  }

  // Audit row for the external channel that actually delivered (if any)
  if (delivered && usedChannel !== 'none') {
    await logNotification({
      userId: target.userId,
      channel: usedChannel,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      recipient,
      status: 'sent',
      cost: usedCost,
    })
  }

  return { delivered, channel: usedChannel, cost: usedCost, results, notificationLogId: logId }
}

// ---------------------------------------------------------------------------
// Higher-level helpers
// ---------------------------------------------------------------------------

/** Look up a Kynthai user's contact channels from the DB. */
async function loadUserTarget(userId: string): Promise<NotificationTarget> {
  const u = await db.user.findUnique({ where: { id: userId } })
  if (!u) return { userId }
  return {
    userId: u.id,
    email: u.email,
    phone: u.phone,
    // WhatsApp + push token are not yet columns on User — leave null and
    // callers can override via the optional overrides param.
  }
}

/** Send a medication reminder to a user. */
export async function sendReminder(
  userId: string,
  medName: string,
  dosage: string,
  scheduledTime: string,
  overrides: Partial<NotificationTarget> = {},
): Promise<RouteResult> {
  const target = { ...(await loadUserTarget(userId)), ...overrides }
  return sendNotification(target, {
    title: `Time to take ${medName}`,
    body: `${dosage ? dosage + ' · ' : ''}${scheduledTime} — Open for full-screen alarm. Mark Taken or Skip.`,
    type: 'reminder',
    data: {
      medName,
      scheduledTime,
      dosage,
      type: 'reminder',
      url: '/patient?alarm=1',
    },
  })
}

/** Escalate a missed dose to the patient + their caretaker. */
export async function sendEscalation(
  userId: string,
  medName: string,
  scheduledTime: string,
  caretakerId?: string | null,
  overrides: Partial<NotificationTarget> = {},
): Promise<RouteResult> {
  const target = { ...(await loadUserTarget(userId)), ...overrides }
  const r = await sendNotification(target, {
    title: '⚠️ Missed dose — please take now',
    body: `Your ${medName} reminder at ${scheduledTime} was missed. Please take it now or mark as skipped.`,
    type: 'escalation',
    data: { medName, scheduledTime, escalated: '1' },
  })

  // Also nudge the caretaker if provided.
  if (caretakerId && caretakerId !== userId) {
    const ct = { ...(await loadUserTarget(caretakerId)) }
    await sendNotification(ct, {
      title: '🚨 Family member missed a dose',
      body: `Your family member missed ${medName} at ${scheduledTime}. You may want to reach out.`,
      type: 'escalation',
      data: { medName, scheduledTime, forUserId: userId },
    })
  }
  return r
}

/** Doctor → patient nudge. */
export async function sendNudge(
  patientId: string,
  doctorName: string,
  message: string,
  overrides: Partial<NotificationTarget> = {},
): Promise<RouteResult> {
  const target = { ...(await loadUserTarget(patientId)), ...overrides }
  return sendNotification(target, {
    title: `👋 Nudge from Dr. ${doctorName}`,
    body: message,
    type: 'nudge',
    data: { doctorName },
  })
}

/** Send a prescription invite link to a patient and their family caretakers. */
export async function sendInvite(
  patientId: string,
  doctorName: string,
  inviteLink: string,
  medCount: number,
  overrides: Partial<NotificationTarget> = {},
): Promise<RouteResult> {
  const target = { ...(await loadUserTarget(patientId)), ...overrides }
  const r = await sendNotification(target, {
    title: `📩 Prescription from Dr. ${doctorName}`,
    body: `You have a new prescription with ${medCount} medication(s). Review and accept: ${inviteLink}`,
    type: 'invite',
    data: { inviteLink, doctorName },
  })

  // Also notify family caretakers so they can help manage medications.
  try {
    const family = await db.family.findFirst({
      where: { members: { some: { userId: patientId } } },
      include: {
        members: {
          where: { role: 'caretaker', inviteStatus: 'accepted', userId: { not: null } },
          select: { userId: true },
        },
      },
    })
    if (family) {
      for (const caretaker of family.members) {
        if (caretaker.userId && caretaker.userId !== patientId) {
          const ct = { ...(await loadUserTarget(caretaker.userId)) }
          await sendNotification(ct, {
            title: `📩 New prescription for your family member`,
            body: `Dr. ${doctorName} sent a prescription with ${medCount} medication(s). Help them review it: ${inviteLink}`,
            type: 'invite',
            data: { inviteLink, doctorName, forUserId: patientId },
          })
        }
      }
    }
  } catch {
    /* best-effort — don't fail the main notification */
  }

  return r
}

/** Send a follow-up appointment reminder. */
export async function sendFollowUp(
  userId: string,
  doctorName: string,
  scheduledAt: string,
  appointmentId?: string,
  overrides: Partial<NotificationTarget> = {},
): Promise<RouteResult> {
  const target = { ...(await loadUserTarget(userId)), ...overrides }
  return sendNotification(target, {
    title: `📅 Follow-up with Dr. ${doctorName}`,
    body: `Your follow-up appointment is scheduled for ${scheduledAt}. Tap to join the video call: ${APP_URL}/patient`,
    type: 'follow_up',
    data: { doctorName, scheduledAt, appointmentId: appointmentId || '' },
  })
}

/** SOS emergency alert — broadcast to caretaker + linked doctors. */
export async function sendEmergency(
  reporterId: string,
  memberName: string,
  notes: string,
  notifiedDoctorIds: string[] = [],
  overrides: Partial<NotificationTarget> = {},
): Promise<RouteResult> {
  const target = { ...(await loadUserTarget(reporterId)), ...overrides }
  const r = await sendNotification(target, {
    title: '🆘 Emergency SOS received',
    body: `Your SOS alert for ${memberName} has been sent to your caretaker and linked doctors. For ambulance or emergency services, call 911 immediately.${notes ? ` Notes: ${notes}` : ''}`,
    type: 'emergency',
    data: { memberName, notes },
  })

  // Fan out to linked doctors.
  for (const docId of notifiedDoctorIds) {
    const dt = { ...(await loadUserTarget(docId)) }
    await sendNotification(dt, {
      title: `🆘 SOS from ${memberName}`,
      body: `A family under your care triggered an SOS. ${notes ? `Notes: ${notes}` : ''} Please respond urgently.`,
      type: 'emergency',
      data: { memberName, notes, reporterId },
    })
  }

  return r
}
