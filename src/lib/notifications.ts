/**
 * Smart notification routing service for Kynthai.
 *
 * Product rule (owner):
 *   - In-app + Web Push for almost everything (doses, doctor, lab, caretaker, SOS).
 *   - Email ONLY for:
 *       1) Prescription from doctor (type: invite / prescription*)
 *       2) Invitation flows (family_invite / invite)
 *     Prescription emails include a short “Download the Android app” CTA.
 *
 * Channels:
 *   Push ($0) → Email ($0.001, invite/prescription only)
 *
 * Each send is logged to `db.notificationLog` regardless of success/failure.
 *
 * Higher-level helpers:
 *   - sendNotification()  generic routing
 *   - sendReminder()      medication due reminders
 *   - sendEscalation()    missed-dose escalations to caretakers
 *   - sendNudge()         doctor → patient nudge
 *   - sendInvite()        prescription invite (email + push + in-app)
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
  type SendResult,
} from './integrations'
import { sendPushToUser } from './push-server'
import { formatNotificationDate } from './notification-time'

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
  timezone?: string | null
}

export interface NotificationPayload {
  title: string
  body: string
  type: string // reminder | escalation | nudge | invite | follow_up | emergency | general
  data?: Record<string, string>
  /** Stable per-event key (e.g. `dose:<reminderId>`). Stored in the in-app log
   *  body so cron ticks can dedupe and never re-send the same event. */
  dedupeKey?: string
}

type NotificationPreferenceKey = 'reminders' | 'labResults' | 'emergency' | 'insights' | 'family'

const DEFAULT_NOTIFICATION_PREFS: Record<NotificationPreferenceKey, boolean> = {
  reminders: true,
  labResults: true,
  emergency: true,
  insights: true,
  family: true,
}

export function preferenceKeyForType(type: string): NotificationPreferenceKey | null {
  const value = String(type || '').toLowerCase()
  if (value.includes('emerg') || value.includes('sos')) return 'emergency'
  // Booking/status reminders and result-ready alerts are separate settings;
  // check result events before the broader lab/booking match.
  if (value.includes('result') || value.includes('lab_share')) return 'labResults'
  if (
    value.includes('appoint') ||
    value.includes('consult') ||
    value.includes('follow') ||
    value.includes('remind') ||
    value.includes('dose') ||
    value.includes('prescription') ||
    value.includes('booking') ||
    value.includes('no_show') ||
    value.includes('refund') ||
    value === 'invite'
  ) return 'reminders'
  if (value.includes('family') || value.includes('care') || value.includes('nudge') || value.includes('complaint')) return 'family'
  if (value.includes('insight') || value.includes('weekly')) return 'insights'
  if (value.includes('lab')) return 'labResults'
  return null
}

export function readNotificationPrefs(raw: string | null | undefined): Record<NotificationPreferenceKey, boolean> {
  if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS }
  try {
    const parsed = JSON.parse(raw) as Partial<Record<NotificationPreferenceKey, unknown>>
    return Object.fromEntries(
      Object.keys(DEFAULT_NOTIFICATION_PREFS).map((key) => [
        key,
        parsed[key as NotificationPreferenceKey] !== false,
      ]),
    ) as Record<NotificationPreferenceKey, boolean>
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS }
  }
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
  status: 'sent' | 'failed' | 'skipped' | 'processing'
  cost: number
  dedupeKey?: string
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
        ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
      },
    })
    return row.id
  } catch (e) {
    console.warn('[notifications] Failed to write notification log', e)
    return undefined
  }
}

// The deploy pipeline generates Prisma but does not run migrations. Keep the
// dedupe storage self-healing so the first reminder after deploy cannot fall
// back to the old body-only behavior. The unique index is per user/channel:
// one in-app row and one push audit row are valid, but two push sends are not.
let notificationDedupeReady: boolean | null = null
export async function ensureNotificationDedupeStorage(): Promise<void> {
  if (notificationDedupeReady === true) return
  try {
    await db.$executeRawUnsafe(
      `ALTER TABLE "notification_logs" ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT`,
    )
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "notification_logs_user_channel_dedupe_key" ON "notification_logs" ("userId", "channel", "dedupeKey") WHERE "dedupeKey" IS NOT NULL`,
    )
    notificationDedupeReady = true
  } catch (e) {
    notificationDedupeReady = false
    console.warn('[notifications] Dedupe storage bootstrap failed', e)
  }
}

async function claimPushDelivery(input: {
  userId: string
  dedupeKey: string
  title: string
  body: string
  recipient: string
}): Promise<{ id: string; acquired: boolean } | undefined> {
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000)
  try {
    const row = await db.notificationLog.create({
      data: {
        userId: input.userId,
        channel: 'push',
        type: 'reminder',
        title: input.title,
        body: input.body,
        recipient: input.recipient,
        status: 'processing',
        cost: 0,
        dedupeKey: input.dedupeKey,
      },
      select: { id: true },
    })
    return { id: row.id, acquired: true }
  } catch {
    // A concurrent tick can already own this event. Reuse only a stale claim;
    // an active claim must not result in a second push. The stale takeover is
    // conditional so two retries cannot both become owners.
    const existing = await db.notificationLog.findFirst({
      where: {
        userId: input.userId,
        channel: 'push',
        dedupeKey: input.dedupeKey,
      },
      select: { id: true, status: true, createdAt: true },
    }).catch(() => null)
    if (!existing) return undefined
    if (existing.status === 'sent') return { id: existing.id, acquired: false }
    if (existing.status === 'processing' && existing.createdAt > staleBefore) {
      return { id: existing.id, acquired: false }
    }
    const takeover = await db.notificationLog.updateMany({
      where: {
        id: existing.id,
        OR: [
          { status: 'failed' },
          { status: 'processing', createdAt: { lt: staleBefore } },
        ],
      },
      data: { status: 'processing', createdAt: new Date() },
    }).catch(() => ({ count: 0 }))
    return { id: existing.id, acquired: takeover.count === 1 }
  }
}

/** Claim an email send with the same retry-safe semantics as push. */
async function claimEmailDelivery(input: {
  userId?: string | null
  dedupeKey: string
  type: string
  title: string
  body: string
  recipient: string
}): Promise<{ id: string; acquired: boolean } | undefined> {
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000)
  try {
    const row = await db.notificationLog.create({
      data: {
        userId: input.userId ?? null,
        channel: 'email',
        type: input.type,
        title: input.title,
        body: input.body,
        recipient: input.recipient,
        status: 'processing',
        cost: 0,
        dedupeKey: input.dedupeKey,
      },
      select: { id: true },
    })
    return { id: row.id, acquired: true }
  } catch {
    const existing = await db.notificationLog.findFirst({
      where: {
        userId: input.userId ?? null,
        channel: 'email',
        dedupeKey: input.dedupeKey,
      },
      select: { id: true, status: true, createdAt: true },
    }).catch(() => null)
    if (!existing) return undefined
    if (existing.status === 'sent') return { id: existing.id, acquired: false }
    if (existing.status === 'processing' && existing.createdAt > staleBefore) {
      return { id: existing.id, acquired: false }
    }
    const takeover = await db.notificationLog.updateMany({
      where: {
        id: existing.id,
        OR: [
          { status: 'failed' },
          { status: 'processing', createdAt: { lt: staleBefore } },
        ],
      },
      data: { status: 'processing', createdAt: new Date() },
    }).catch(() => ({ count: 0 }))
    return { id: existing.id, acquired: takeover.count === 1 }
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
  let pushDelivered = false
  let claimedPushLogId: string | undefined
  let claimedPushDelivery = false
  let claimedEmailLogId: string | undefined
  let claimedEmailDelivery = false

  if (payload.dedupeKey) await ensureNotificationDedupeStorage()

  // Resolve contact details and preferences from DB when callers only pass userId.
  // This keeps every portal on one policy instead of relying on each route to
  // remember to apply the same opt-out/category rules.
  if (target.userId) {
    try {
      const u = await db.user.findUnique({
        where: { id: target.userId },
        select: { email: true, emailOptOut: true, notificationPrefs: true },
      })
      if (u?.emailOptOut) target = { ...target, email: null }
      else if (u?.email && !target.email) target = { ...target, email: u.email }
      const prefKey = preferenceKeyForType(payload.type)
      if (prefKey && readNotificationPrefs(u?.notificationPrefs)[prefKey] === false) {
        return { delivered: false, channel: 'none', cost: 0, results: [] }
      }
    } catch {
      /* best-effort — preserve delivery when the preference column is unavailable */
    }
  }

  // 1. PUSH (free) — fan out through every registered Web Push and FCM device.
  // The provider layer reports an explicit failure for an unavailable transport;
  // never silently mark native FCM as delivered.
  if (target.userId) {
    const pushRecipient = target.pushToken || target.userId
    let shouldSendPush = true
    if (payload.dedupeKey) {
      const claim = await claimPushDelivery({
        userId: target.userId,
        dedupeKey: payload.dedupeKey,
        title: payload.title,
        body: payload.body,
        recipient: pushRecipient,
      })
      claimedPushLogId = claim?.id
      claimedPushDelivery = claim?.acquired === true
      // Another request is already sending or has sent this event. Do not call
      // the provider a second time, but continue to email and in-app channels.
      shouldSendPush = claimedPushDelivery
    } else {
      claimedPushDelivery = true
    }
    if (shouldSendPush) {
    const notificationType = String(payload.type || '').toLowerCase()
    const clinical =
      notificationType.includes('remind') ||
      notificationType.includes('dose') ||
      notificationType.includes('emerg') ||
      notificationType.includes('sos') ||
      notificationType.includes('appoint') ||
      notificationType.includes('consult') ||
      notificationType.includes('lab') ||
      notificationType.includes('booking') ||
      notificationType.includes('family') ||
      notificationType.includes('nudge') ||
      notificationType.includes('prescription') ||
      notificationType.includes('invite')
    // FIX #23: Don't send PHI (medication name/dosage) in push notifications
    // Only send generic reminder to avoid lock screen privacy leaks
    const r = await sendPushToUser(target.userId, {
      title: payload.title,
      body: payload.body,
      tag: (payload.data?.type as string | undefined) || payload.type,
      url: (payload.data?.url as string | undefined) || undefined,
      // medName and dosage removed from push to protect PHI
      time: payload.data?.scheduledTime as string | undefined,
      reminderId: payload.data?.reminderId as string | undefined,
      medicationId: payload.data?.medicationId as string | undefined,
      data: payload.data,
      dose: new Set(['reminder', 'missed_dose', 'reminder_escalation']).has(notificationType),
      clinical,
    })
    const cost = CHANNEL_COST.push
    const ok = r.sent > 0
    results.push({ channel: 'push', result: { ok, provider: 'web-push', messageId: `push:${r.sent}` }, cost })
    if (ok) {
      delivered = true
      pushDelivered = true
      usedChannel = 'push'
      usedCost = cost
    }
    }
  }

  // 2. EMAIL — only prescription + invitation flows (product rule)
  // Everything else is in-app / push only. No email spam for doses, consults, lab, etc.
  const emailAllowedTypes = new Set([
    'invite',
    'family_invite',
    'prescription',
    'prescription_invite',
    'prescription_sent',
  ])
  const allowEmail = emailAllowedTypes.has(String(payload.type || ''))

  if (allowEmail && target.email && isEmailEnabled()) {
    let emailAcquired = true
    if (payload.dedupeKey) {
      const claim = await claimEmailDelivery({
        userId: target.userId,
        dedupeKey: payload.dedupeKey,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        recipient: target.email,
      })
      claimedEmailLogId = claim?.id
      emailAcquired = claim?.acquired === true
      claimedEmailDelivery = emailAcquired
    }
    if (emailAcquired) {
    const isPrescription =
      payload.type === 'invite' ||
      payload.type === 'prescription' ||
      payload.type === 'prescription_invite' ||
      payload.type === 'prescription_sent'
    const downloadUrl = `${APP_URL}/download`
    const openUrl =
      (payload.data?.inviteLink as string | undefined) ||
      (payload.data?.url as string | undefined) ||
      `${APP_URL}/patient`

    const extraCta = isPrescription
      ? `<p style="color:#374151;font-size:14px;line-height:1.5;margin:16px 0 8px">
            For reliable reminders on your phone, install the Kynthai Android app.
         </p>
         <div style="text-align:center;padding:8px 0 16px">
           <a href="${downloadUrl}" style="display:inline-block;background:#0f766e;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Download Android app</a>
         </div>`
      : ''

    const r = await sendEmailReal({
      to: target.email,
      subject: payload.title,
      text:
        payload.body +
        (isPrescription
          ? `\n\nDownload the Android app for reliable reminders: ${downloadUrl}\nOpen: ${openUrl}`
          : `\n\nOpen Kynthai: ${openUrl}`),
      html: `<div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;background:#f9fafb">
        <div style="text-align:center;padding:16px 0">
          <span style="font-size:24px;font-weight:bold;color:#10b981">Kynthai</span>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin:16px 0;border:1px solid #e5e7eb">
          <h2 style="color:#10b981;margin-top:0">${payload.title}</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;white-space:pre-line">${payload.body}</p>
          ${extraCta}
        </div>
        <div style="text-align:center;padding:16px 0">
          <a href="${openUrl}" style="display:inline-block;background:#10b981;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Open Kynthai</a>
        </div>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
        <p style="font-size:11px;color:#9ca3af;text-align:center">
          Kynthai · AI Health Management<br/>
          <a href="${APP_URL}" style="color:#10b981;text-decoration:none">${APP_URL}</a>
        </p>
      </div>`,
    })
    const cost = CHANNEL_COST.email
    results.push({ channel: 'email', result: r, cost })
    if (r.ok) {
      delivered = true
      usedChannel = usedChannel === 'none' ? 'email' : usedChannel
      usedCost = usedChannel === 'email' ? cost : usedCost
    }
    }
  }

  if (claimedEmailLogId && claimedEmailDelivery) {
    await db.notificationLog.update({
      where: { id: claimedEmailLogId },
      data: {
        status: results.find((entry) => entry.channel === 'email')?.result.ok ? 'sent' : 'failed',
        cost: results.find((entry) => entry.channel === 'email')?.result.ok ? CHANNEL_COST.email : 0,
      },
    }).catch(() => {})
  }

  // WhatsApp and SMS removed — Kynthai only uses Push + Email channels.

  // ALWAYS write an in-app inbox row for the user (doctor, patient, family, lab).
  // Push/email are delivery channels; the bell/inbox is the product surface —
  // same idea as native apps' notification center.
  const recipient = target.pushToken || target.email || target.userId || 'unknown'
  let logId: string | undefined
  if (target.userId) {
    // The browser alarm and server sender share the same dose key. Reuse an
    // existing in-app row rather than creating a second named notification.
    const existingInApp = payload.dedupeKey
      ? await db.notificationLog.findFirst({
          where: {
            userId: target.userId,
            channel: { in: ['in-app', 'app'] },
            OR: [
              { dedupeKey: payload.dedupeKey },
              { body: { contains: `[ref:${payload.dedupeKey}]` } },
            ],
          },
          select: { id: true },
        }).catch(() => null)
      : null
    if (existingInApp) {
      logId = existingInApp.id
    } else {
      const storedBody = payload.dedupeKey
        ? `${payload.body}\n[ref:${payload.dedupeKey}]`
        : payload.body
      logId = await logNotification({
        userId: target.userId,
        channel: 'in-app',
        type: payload.type,
        title: payload.title,
        body: storedBody,
        recipient: target.userId,
        status: 'sent',
        cost: 0,
        dedupeKey: payload.dedupeKey,
      })
    }
  }

  // Finalize the atomic push claim, or log a non-deduped external delivery.
  // Body MUST carry the same [ref:dedupeKey] as the in-app row — the reminder
  // cron dedupes against channel='push' rows, so without the key a delivered
  // dose would be re-pushed by every subsequent tick/catchup.
  if (claimedPushLogId && claimedPushDelivery) {
    await db.notificationLog.update({
      where: { id: claimedPushLogId },
      data: {
        status: pushDelivered ? 'sent' : 'failed',
        cost: 0,
      },
    }).catch(() => {})
  } else if (delivered && usedChannel !== 'none') {
    await logNotification({
      userId: target.userId,
      channel: usedChannel,
      type: payload.type,
      title: payload.title,
      body: payload.dedupeKey ? `${payload.body}\n[ref:${payload.dedupeKey}]` : payload.body,
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
    timezone: u.timezone,
    // WhatsApp + push token are not yet columns on User — leave null and
    // callers can override via the optional overrides param.
  }
}

/** Send a medication reminder to a user.
 *  FIX #23: title/body that reach the lock screen are GENERIC (no drug name or
 *  dose) — the identifiable details travel only in the unrendered push `data`
 *  block and in the in-app inbox merge. `extraData` threads reminder/medication
 *  ids so deep links and the alarm host can act on the exact dose. */
export async function sendReminder(
  userId: string,
  medName: string,
  dosage: string,
  scheduledTime: string,
  overrides: Partial<NotificationTarget> = {},
  dedupeKey?: string,
  extraData?: { reminderId?: string; medicationId?: string },
): Promise<RouteResult> {
  const target = { ...(await loadUserTarget(userId)), ...overrides }
  const alarmParams = new URLSearchParams({ alarm: '1', time: scheduledTime, med: medName.slice(0, 80) })
  if (extraData?.reminderId) alarmParams.set('rid', extraData.reminderId)
  if (extraData?.medicationId) alarmParams.set('mid', extraData.medicationId)
  return sendNotification(target, {
    title: 'Medication reminder',
    body: `A dose is due now · ${scheduledTime}. Tap to open.`,
    type: 'reminder',
    data: {
      medName,
      scheduledTime,
      dosage,
      type: 'reminder',
      url: `/patient?${alarmParams.toString()}`,
      ...(extraData?.reminderId ? { reminderId: extraData.reminderId } : {}),
      ...(extraData?.medicationId ? { medicationId: extraData.medicationId } : {}),
    },
    dedupeKey,
  })
}

/** Escalate a missed dose to the patient + their caretaker. */
export async function sendEscalation(
  userId: string,
  medName: string,
  scheduledTime: string,
  caretakerId?: string | null,
  overrides: Partial<NotificationTarget> = {},
  dedupeKey?: string,
): Promise<RouteResult> {
  const target = { ...(await loadUserTarget(userId)), ...overrides }
  const r = await sendNotification(target, {
    title: 'Missed dose — please take now',
    body: `Your ${medName} reminder at ${scheduledTime} was missed. Please take it now or mark as skipped.`,
    type: 'reminder_escalation',
    data: { medName, scheduledTime, escalated: '1', url: '/patient' },
    ...(dedupeKey ? { dedupeKey: `${dedupeKey}:patient` } : {}),
  })

  // Also nudge the caretaker if provided.
  if (caretakerId && caretakerId !== userId) {
    const ct = { ...(await loadUserTarget(caretakerId)) }
    await sendNotification(ct, {
      title: 'Family member missed a dose',
      body: `Your family member missed ${medName} at ${scheduledTime}. You may want to reach out.`,
      type: 'reminder_escalation',
      data: { medName, scheduledTime, forUserId: userId, url: '/caretaker' },
      ...(dedupeKey ? { dedupeKey: `${dedupeKey}:caretaker` } : {}),
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
  dedupeKey?: string,
): Promise<RouteResult> {
  const target = { ...(await loadUserTarget(patientId)), ...overrides }
  return sendNotification(target, {
    title: `Nudge from Dr. ${doctorName}`,
    body: message,
    type: 'nudge',
    data: { doctorName },
    ...(dedupeKey ? { dedupeKey } : {}),
  })
}

/** Send a prescription invite link to a patient and their family caretakers. */
export async function sendInvite(
  patientId: string,
  doctorName: string,
  inviteLink: string,
  medCount: number,
  overrides: Partial<NotificationTarget> = {},
  dedupeKey?: string,
): Promise<RouteResult> {
  const target = { ...(await loadUserTarget(patientId)), ...overrides }
  const r = await sendNotification(target, {
    title: `Prescription from Dr. ${doctorName}`,
    body: `You have a new prescription with ${medCount} medication(s). Review and accept: ${inviteLink}\n\nFor reliable phone reminders, download the Kynthai Android app: ${APP_URL}/download`,
    type: 'invite',
    data: { inviteLink, doctorName },
    ...(dedupeKey ? { dedupeKey: `${dedupeKey}:patient` } : {}),
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
          try {
            const ct = { ...(await loadUserTarget(caretaker.userId)) }
            await sendNotification(ct, {
              title: `New prescription for your family member`,
              body: `Dr. ${doctorName} sent a prescription with ${medCount} medication(s). Help them review it: ${inviteLink}`,
              type: 'invite',
              data: { inviteLink, doctorName, forUserId: patientId },
              ...(dedupeKey ? { dedupeKey: `${dedupeKey}:caretaker:${caretaker.userId}` } : {}),
            })
          } catch {
            /* best-effort per caretaker */
          }
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
    title: `Follow-up with Dr. ${doctorName}`,
    body: `Your follow-up appointment is scheduled for ${formatNotificationDate(scheduledAt, target.timezone)}. Tap to join the video call: ${APP_URL}/patient`,
    type: 'follow_up',
    data: { doctorName, scheduledAt, appointmentId: appointmentId || '', url: '/patient' },
    ...(appointmentId ? { dedupeKey: `appointment:${appointmentId}:follow-up` } : {}),
  })
}

/** SOS emergency alert — broadcast to caretaker + linked doctors. */
export async function sendEmergency(
  reporterId: string,
  memberName: string,
  notes: string,
  notifiedDoctorIds: string[] = [],
  overrides: Partial<NotificationTarget> = {},
  dedupeKey?: string,
): Promise<RouteResult> {
  const target = { ...(await loadUserTarget(reporterId)), ...overrides }
  const r = await sendNotification(target, {
    title: 'Emergency SOS received',
    body: `Your SOS alert for ${memberName} has been sent to your caretaker and linked doctors. For ambulance or emergency services, contact local emergency services immediately.${notes ? ` Notes: ${notes}` : ''}`,
    type: 'emergency',
    data: { memberName, notes, url: '/caretaker' },
    ...(dedupeKey ? { dedupeKey: `${dedupeKey}:reporter` } : {}),
  })

  const recipientIds = new Set<string>(notifiedDoctorIds)
  // Notify accepted family members as well as linked doctors. This keeps SOS
  // delivery consistent whether it originates in the patient or caretaker
  // portal; the caller's own confirmation remains separate above.
  try {
    const families = await db.family.findMany({
      where: {
        OR: [
          { ownerId: reporterId },
          { members: { some: { userId: reporterId, inviteStatus: 'accepted' } } },
        ],
      },
      include: {
        members: {
          where: { userId: { not: reporterId }, inviteStatus: 'accepted' },
          select: { userId: true },
        },
      },
    })
    for (const family of families) {
      for (const member of family.members) if (member.userId) recipientIds.add(member.userId)
    }
  } catch {
    /* family lookup is best-effort; linked doctors still receive the alert */
  }

  // Fan out to linked doctors and family members. Each recipient is isolated
  // so a bad token or provider error cannot block the remaining responders.
  for (const docId of recipientIds) {
    try {
      const dt = { ...(await loadUserTarget(docId)) }
      await sendNotification(dt, {
        title: `SOS from ${memberName}`,
        body: `A family under your care triggered an SOS. ${notes ? `Notes: ${notes}` : ''} Please respond urgently.`,
        type: 'emergency',
        data: { memberName, notes, reporterId, url: '/caretaker' },
        ...(dedupeKey ? { dedupeKey: `${dedupeKey}:recipient:${docId}` } : {}),
      })
    } catch {
      /* best-effort per recipient; other responders still receive the SOS */
    }
  }

  return r
}
