import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/auth'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

// PATCH /api/user/notification-prefs
// Update per-channel notification preference toggles.
// Requires authenticated CSRF-verified session. All fields are optional
// (partial update).
const notificationPrefsSchema = z.object({
  reminders:   z.boolean().optional(),
  labResults:  z.boolean().optional(),
  emergency:   z.boolean().optional(),
  insights:    z.boolean().optional(),
  family:      z.boolean().optional(),
})

export async function PATCH(req: NextRequest) {
  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!

  const raw = await req.text().catch(() => null)
  if (!raw) return jsonError('Request body is required', 400)

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return jsonError('Invalid JSON', 400)
  }

  const result = notificationPrefsSchema.safeParse(parsed)
  if (!result.success) {
    const fields: Record<string, string> = {}
    for (const issue of result.error.issues) {
      fields[issue.path.join('.')] = issue.message
    }
    return jsonError('Validation failed', 422, 'VALIDATION_ERROR', { fields })
  }

  const updates = result.data
  const updateKeys = Object.keys(updates)
  if (updateKeys.length === 0) {
    return jsonError('Provide at least one preference to update', 400)
  }

  try {
    // requireAuth intentionally returns a minimal user projection, so read the
    // persisted preference JSON directly before merging this partial update.
    const currentUser = await db.user.findUnique({
      where: { id: user.id },
      select: { notificationPrefs: true },
    })
    let currentPrefs = {
      reminders: true,
      labResults: true,
      emergency: true,
      insights: true,
      family: true,
    }
    if (currentUser?.notificationPrefs) {
      try {
        const parsed = JSON.parse(currentUser.notificationPrefs)
        if (parsed && typeof parsed === 'object') currentPrefs = { ...currentPrefs, ...parsed }
      } catch {
        /* malformed legacy JSON is replaced by safe defaults */
      }
    }

    const mergedPrefs = { ...currentPrefs, ...updates }

    await db.user.update({
      where: { id: user.id },
      data: { notificationPrefs: JSON.stringify(mergedPrefs) },
      select: { id: true, notificationPrefs: true },
    })

    await logAudit(user.id, 'notification_prefs.update', updateKeys.join(', '))

    return jsonOk({
      preferences: {
        reminders:  mergedPrefs.reminders,
        labResults: mergedPrefs.labResults,
        emergency:  mergedPrefs.emergency,
        insights:   mergedPrefs.insights,
        family:     mergedPrefs.family,
      },
    })
  } catch (error) {
    logger.phiSafeError(error, 'notification-prefs.PATCH')
    return jsonError('Failed to update notification preferences', 500)
  }
}

// GET /api/user/notification-prefs
// Returns current notification preferences (with sensible defaults if not yet set).
export async function GET(req: NextRequest) {
  const { response, user } = await requireAuth(req)
  if (response || !user) return response!

  try {
    const currentUser = await db.user.findUnique({
      where: { id: user.id },
      select: { notificationPrefs: true },
    })
    const defaults = {
      reminders: true,
      labResults: true,
      emergency: true,
      insights: true,
      family: true,
    }
    let prefs = defaults
    if (currentUser?.notificationPrefs) {
      try {
        const parsed = JSON.parse(currentUser.notificationPrefs)
        if (parsed && typeof parsed === 'object') prefs = { ...defaults, ...parsed }
      } catch {
        /* return safe defaults */
      }
    }

    return jsonOk({ preferences: prefs })
  } catch (error) {
    logger.phiSafeError(error, 'notification-prefs.GET')
    return jsonError('Failed to load notification preferences', 500)
  }
}
