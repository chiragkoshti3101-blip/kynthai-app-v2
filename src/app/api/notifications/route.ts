import { NextRequest } from 'next/server'
import { logAudit } from '@/lib/auth'
import { requireAuth, requireAuthWithCsrf, jsonOk, jsonError } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { clockParts } from '@/lib/reminder-clock'
export const dynamic = 'force-dynamic'

// GET /api/notifications
// List notifications for the authenticated user (paginated, last 50).
export async function GET(req: NextRequest) {
  const { response, user } = await requireAuth(req)
  if (response || !user) return response!

  try {
    const url = new URL(req.url)
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true'

    // Build query
    const where: Record<string, unknown> = { userId: user.id }
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
        createdAt: true,
      },
    })

    // Merge today's pending reminders so the bell is never a dead empty inbox
    // while the user still has doses on the schedule (cron may lag or miss).
    try {
      const clock = clockParts()
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
        const existingKeys = new Set(
          notifications.map((n) => `${n.type}|${n.title}|${n.body}`),
        )
        for (const r of pending) {
          const medName = r.medication?.name || 'medication'
          const due = r.time <= clock.timeStr
          const title = due ? `Time to take ${medName}` : `Upcoming: ${medName}`
          const body = [r.medication?.dosage, r.time].filter(Boolean).join(' · ')
          const key = `reminder|${title}|${body}`
          if (existingKeys.has(key)) continue
          existingKeys.add(key)
          notifications.push({
            id: `rem-${r.id}`,
            channel: 'in-app',
            type: 'reminder',
            title,
            body,
            recipient: user.id,
            status: 'sent',
            cost: 0,
            createdAt: r.createdAt,
          })
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
      where: { userId: user.id, status: { not: 'read' } },
    })
    const syntheticUnread = notifications.filter((n) => n.id.startsWith('rem-')).length

    // Map status → read boolean for the frontend
    const mapped = notifications.map((n) => ({
      ...n,
      read: n.status === 'read',
    }))

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

    // Mark as read — only for the current user's notifications
    const result = await db.notificationLog.updateMany({
      where: {
        id: { in: validIds.filter((id) => !id.startsWith('rem-')) },
        userId: user.id,
      },
      data: { status: 'read' },
    })

    await logAudit(user.id, 'notifications.markRead', `marked=${result.count}`)

    return jsonOk({ marked: result.count })
  } catch (error) {
    logger.phiSafeError(error)
    return jsonError('Internal server error', 500)
  }
}