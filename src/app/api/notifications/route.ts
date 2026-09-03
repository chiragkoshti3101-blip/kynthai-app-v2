import { NextRequest } from 'next/server'
import { logAudit } from '@/lib/auth'
import { requireAuth, requireAuthWithCsrf, jsonOk, jsonError } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { readNotificationPrefs } from '@/lib/notifications'
import { clockParts, DEFAULT_TZ } from '@/lib/reminder-clock'
import { safeNotificationPreview } from '@/lib/notification-privacy'
import { isDemoUser } from '@/lib/demo-mode'
import { getDemoNotifications } from '@/lib/demo-notifications'
export const dynamic = 'force-dynamic'

// GET /api/notifications
// List notifications for the authenticated user (paginated, last 50).
export async function GET(req: NextRequest) {
  const { response, user } = await requireAuth(req)
  if (response || !user) return response!

  // Seeded demo accounts are read-only and must not expose persisted database
  // history. Keep this response aligned with the client fixture so the badge,
  // rows, and role-specific content are deterministic and coherent.
  if (isDemoUser(user)) {
    const url = new URL(req.url)
    const all = getDemoNotifications(user.role)
    const notifications = url.searchParams.get('unreadOnly') === 'true'
      ? all.filter((notification) => !notification.read)
      : all
    const safeNotifications = notifications.map((notification) => {
      const safe = safeNotificationPreview(notification)
      return {
        ...notification,
        title: safe.title,
        body: safe.body,
        isEmergency: safe.isEmergency,
      }
    })
    return jsonOk({
      notifications: safeNotifications,
      unreadCount: all.filter((notification) => !notification.read).length,
    })
  }

  try {
    const url = new URL(req.url)
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true'
    const persisted = await db.user.findUnique({
      where: { id: user.id },
      select: { notificationPrefs: true, timezone: true },
    }).catch(() => null)
    const reminderPrefsEnabled = readNotificationPrefs(persisted?.notificationPrefs)["reminders"] !== false
    const recipientTimezone = persisted?.timezone || user.timezone || DEFAULT_TZ

    // Build query
    const where: Record<string, unknown> = { userId: user.id, channel: { in: ['in-app', 'app'] } }
    if (unreadOnly) {
      where.status = { not: 'read' }
    }

    // Fetch last 50 notifications, newest first
    let notifications = await db.notificationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        channel: true,
        type: true,
        title: true,
        body: true,
        recipient: true,
        status: true,
        cost: true,
        dedupeKey: true,
        createdAt: true,
      },
    })

    // The cron appends "[ref:dose:<id>]" to stored bodies for dedupe; that is
    // plumbing, not user-facing copy — strip it before serving the inbox.
    notifications = notifications.map((n) => ({
      ...n,
      body: n.body?.replace(/\n\[ref:[^\]]+\]$/, '') ?? n.body,
    }))

    // Merge pending reminders so the bell is never a dead empty inbox while
    // the user still has doses on the schedule (cron may lag or miss). The
    // category preference also controls this synthetic fallback.
    if (reminderPrefsEnabled) try {
      let clock
      try {
        clock = clockParts(recipientTimezone)
      } catch {
        clock = clockParts(DEFAULT_TZ)
      }
      const today = new Date(clock.isoDate)
      const meds = await db.medication.findMany({
        where: { active: true, OR: [{ userId: user.id }, { familyMember: { family: { ownerId: user.id } } }] },
        select: { id: true, name: true, dosage: true },
      })
      const medIds = meds.map((m) => m.id)
      if (medIds.length) {
        const pending = await db.reminder.findMany({
          where: { date: today, medicationId: { in: medIds }, status: 'pending' },
          include: { medication: { select: { name: true, dosage: true } } },
          orderBy: { time: 'asc' },
          take: 20,
        })
        // Materialize a fallback reminder into the same in-app log used by
        // cron delivery. The old `rem-<id>` rows were ephemeral, so Mark all
        // read could never persist them and every refresh resurrected them.
        const doseKeys = pending.map((r) => `dose:${r.id}`)
        const reminderLogs = doseKeys.length
          ? await db.notificationLog.findMany({
              where: {
                userId: user.id,
                channel: { in: ['in-app', 'app'] },
                dedupeKey: { in: doseKeys },
              },
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                channel: true,
                type: true,
                title: true,
                body: true,
                recipient: true,
                status: true,
                cost: true,
                dedupeKey: true,
                createdAt: true,
              },
            }).catch(() => [])
          : []
        const existingKeys = new Set(
          notifications.map((n) => `${n.type}|${n.title}|${n.body}`),
        )
        for (const r of pending) {
          const medName = r.medication?.name || 'medication'
          const due = r.time <= clock.timeStr
          const detailTitle = due ? `Time to take ${medName}` : `Upcoming: ${medName}`
          const detailBody = [r.medication?.dosage, r.time].filter(Boolean).join(' · ')
          const doseKey = `dose:${r.id}`
          const existing = reminderLogs.find((n) => n.dedupeKey === doseKey)
          if (existing) {
            // If the initial page was already full, keep the persisted reminder
            // visible so its read state remains stable across refreshes.
            if (!unreadOnly || existing.status !== 'read') {
              if (!notifications.some((n) => n.id === existing.id)) notifications.push(existing)
            }
            continue
          }

          // Generic cron rows share the time in their body — don't create a
          // second inbox entry for a dose already represented by a legacy row.
          const legacyKey = `reminder|${detailTitle}|${detailBody}`
          const covered = notifications.some(
            (n) => n.dedupeKey === doseKey ||
              (n.dedupeKey == null && n.type === 'reminder' && n.title === detailTitle && n.body === detailBody),
          )
          if (existingKeys.has(legacyKey) || covered) continue

          const created = await db.notificationLog.create({
            data: {
              userId: user.id,
              channel: 'in-app',
              type: 'reminder',
              // Store only the generic preview. Medication details stay in the
              // authorized medication workflow rather than the inbox row.
              title: 'Medication reminder',
              body: 'A scheduled medication reminder is available. Open Meds to review it.',
              recipient: user.id,
              status: 'sent',
              cost: 0,
              dedupeKey: doseKey,
              createdAt: r.createdAt,
            },
            select: {
              id: true,
              channel: true,
              type: true,
              title: true,
              body: true,
              recipient: true,
              status: true,
              cost: true,
              dedupeKey: true,
              createdAt: true,
            },
          }).catch(() => null)

          // A transient database/index issue must not hide a due reminder;
          // retain the old in-memory fallback, but the normal path is now
          // persistent and can be marked read by id.
          notifications.push(created ?? {
            id: `rem-${r.id}`,
            channel: 'in-app',
            type: 'reminder',
            title: detailTitle,
            body: detailBody,
            recipient: user.id,
            status: 'sent',
            cost: 0,
            dedupeKey: doseKey,
            createdAt: r.createdAt,
          })
          existingKeys.add(legacyKey)
        }
        notifications.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      }
    } catch {
      /* non-fatal — inbox still returns stored logs */
    }

    // First-time / empty inbox: seed one in-app system note so the center is not a dead empty state
    if (notifications.length === 0 && !unreadOnly) {
      try {
        const welcome = await db.notificationLog.create({
          data: {
            userId: user.id,
            channel: 'in-app',
            type: 'system',
            title: 'Welcome to Kynthai',
            body: 'Medication reminders and family alerts will show up here. Turn on push in Settings for device alerts.',
            status: 'sent',
            cost: 0,
          },
          select: {
            id: true,
            channel: true,
            type: true,
            title: true,
            body: true,
            recipient: true,
            status: true,
            cost: true,
            dedupeKey: true,
            createdAt: true,
          },
        })
        notifications = [welcome]
      } catch {
        /* non-fatal */
      }
    }

    // Compute unread count
    const unreadCount = await db.notificationLog.count({
      where: { userId: user.id, channel: { in: ['in-app', 'app'] }, status: { not: 'read' } },
    })
    const syntheticUnread = notifications.filter((n) => n.id.startsWith('rem-')).length

    // Privacy boundary: notification rows are encrypted at rest, but their
    // preview text can still be exposed on a shared/unlocked screen. Return
    // generic copy for clinical, family, appointment, lab, and legacy rows;
    // authorized detail remains available after the user opens the app.
    const mapped = notifications.map((n) => {
      const safe = safeNotificationPreview(n)
      return {
        ...n,
        title: safe.title,
        body: safe.body,
        isEmergency: safe.isEmergency,
        read: n.status === 'read',
      }
    })

    await logAudit(user.id, 'notifications.list', `count=${mapped.length}`)

    return jsonOk({
      notifications: mapped,
      unreadCount: unreadCount + syntheticUnread,
    })
  } catch (error) {
    logger.phiSafeError(error)
    return jsonError('Internal server error', 500)
  }
}

// POST /api/notifications
// Mark notifications as read.
export async function POST(req: NextRequest) {
  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request body', 400)
    }

    const { notificationIds } = body as { notificationIds?: string[] }

    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return jsonError('notificationIds array is required', 400)
    }

    // Validate IDs are strings
    const validIds = notificationIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    if (validIds.length === 0) {
      return jsonError('No valid notification IDs provided', 400)
    }

    // Mark persisted rows as read — only for the current user's notifications.
    const persistedIds = validIds.filter((id) => !id.startsWith('rem-'))
    const result = persistedIds.length
      ? await db.notificationLog.updateMany({
          where: {
            id: { in: persistedIds },
            userId: user.id,
          },
          data: { status: 'read' },
        })
      : { count: 0 }

    // Handle the short-lived fallback IDs emitted if a reminder log could not
    // be materialized during GET. Never change the medication itself here:
    // reading a reminder is separate from taking or skipping its dose.
    const reminderIds = validIds
      .filter((id) => id.startsWith('rem-'))
      .map((id) => id.slice(4))
      .filter((id) => id.length > 0 && id.length <= 128)
    let reminderMarked = 0
    if (reminderIds.length) {
      const reminders = await db.reminder.findMany({
        where: {
          id: { in: reminderIds },
          medication: {
            OR: [
              { userId: user.id },
              { familyMember: { family: { ownerId: user.id } } },
            ],
          },
        },
        select: { id: true },
      }).catch(() => [])
      for (const reminder of reminders) {
        const doseKey = `dose:${reminder.id}`
        const existing = await db.notificationLog.findFirst({
          where: { userId: user.id, channel: { in: ['in-app', 'app'] }, dedupeKey: doseKey },
          select: { id: true },
        }).catch(() => null)
        if (existing) {
          const updated = await db.notificationLog.updateMany({
            where: { id: existing.id, userId: user.id },
            data: { status: 'read' },
          })
          reminderMarked += updated.count
        } else {
          const created = await db.notificationLog.create({
            data: {
              userId: user.id,
              channel: 'in-app',
              type: 'reminder',
              title: 'Medication reminder',
              body: 'A scheduled medication reminder is available. Open Meds to review it.',
              recipient: user.id,
              status: 'read',
              cost: 0,
              dedupeKey: doseKey,
            },
            select: { id: true },
          }).catch(() => null)
          if (created) reminderMarked += 1
        }
      }
    }

    const marked = result.count + reminderMarked
    await logAudit(user.id, 'notifications.markRead', `marked=${marked}`)

    return jsonOk({ marked })
  } catch (error) {
    logger.phiSafeError(error)
    return jsonError('Internal server error', 500)
  }
}
