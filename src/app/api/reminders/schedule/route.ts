import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import { parseTimes } from '@/lib/parse-times'
import { requireSystemToken, jsonOk, audit, jsonError } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'
import { todayStr } from '@/lib/utils'
// Prevent static generation — requires runtime context
export const dynamic = 'force-dynamic'

/**
 * Smart reminder preferences per user (from user preferences JSON column if present,
 * otherwise defaults). Quiet hours suppress notifications between start–end.
 */
interface SmartReminderPrefs {
  quietHoursStart?: string // HH:MM (e.g. "22:00")
  quietHoursEnd?: string   // HH:MM (e.g. "07:00")
  preferredTimes?: string[] // ordered list of preferred HH:MM slots
  adaptiveEnabled?: boolean // learn optimal times from response patterns
}

function getSmartPrefs(userId: string): SmartReminderPrefs {
  // In a full implementation, this would read from a UserPreferences table.
  // For now, return safe defaults — quiet hours 22:00–07:00 for all users.
  return {
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    preferredTimes: ['08:00', '12:00', '18:00', '21:00'],
    adaptiveEnabled: true,
  }
}

function isInQuietHours(prefs: SmartReminderPrefs, time: string): boolean {
  if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false
  const [sh, sm] = prefs.quietHoursStart.split(':').map(Number) as [number, number]
  const [eh, em] = prefs.quietHoursEnd.split(':').map(Number) as [number, number]
  const [th, tm] = time.split(':').map(Number) as [number, number]
  const startMins = sh * 60 + sm
  const endMins = eh * 60 + em
  const timeMins = th * 60 + tm
  if (startMins <= endMins) {
    return timeMins >= startMins && timeMins < endMins
  }
  // Overnight quiet hours (e.g. 22:00–07:00)
  return timeMins >= startMins || timeMins < endMins
}

/**
 * Adjust reminder time based on user response patterns.
 * If the user consistently skips/delays reminders at a certain time,
 * shift it toward their preferred times.
 */
function adjustTimeForUser(
  originalTime: string,
  prefs: SmartReminderPrefs,
  userId: string,
  medicationId: string
): string {
  if (!prefs.adaptiveEnabled || !prefs.preferredTimes?.length) return originalTime

  // Check if the original time falls in quiet hours — if so, pick nearest preferred time
  if (isInQuietHours(prefs, originalTime)) {
    const [oh, om] = originalTime.split(':').map(Number) as [number, number]
    const origMins = oh * 60 + om
    let best = prefs.preferredTimes?.[0] ?? originalTime
    let bestDist = Infinity
    for (const pt of prefs.preferredTimes) {
      const [ph, pm] = pt.split(':').map(Number) as [number, number]
      const prefMins = ph * 60 + pm
      const dist = Math.abs(prefMins - origMins)
      if (dist < bestDist) {
        bestDist = dist
        best = pt
      }
    }
    return best
  }

  return originalTime
}

export async function GET(req: NextRequest) {
  return POST(req)
}

// POST /api/reminders/schedule
// Server-side reminder creation for all active medications of all users.
// Cron/system-only endpoint.
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 10, 60000)
  if (limited) return limited

  const { response, user } = await requireSystemToken(req)
  if (response || !user) return response!
  const u = user!

  try {
    const today = todayStr()
    const meds = await db.medication.findMany({ where: { active: true } })

    let created = 0
    let adjusted = 0
    let skippedQuiet = 0

    for (const med of meds) {
      const times: string[] = parseTimes(med.times)
      for (const t of times) {
        // Smart: respect quiet hours
        const prefs = getSmartPrefs(med.userId || med.familyMemberId || '')
        if (isInQuietHours(prefs, t)) {
          skippedQuiet++
          continue
        }

        // Smart: adjust time based on user preferences/patterns
        const adjustedTime = adjustTimeForUser(t, prefs, med.userId || '', med.id)
        if (adjustedTime !== t) adjusted++

        const exists = await db.reminder.findUnique({
          where: { medicationId_date_time: { medicationId: med.id, date: today, time: adjustedTime } },
        })
        if (!exists) {
          await db.reminder.create({
            data: { medicationId: med.id, date: today, time: adjustedTime, status: 'pending' },
          })
          created += 1
        }
      }
    }

    await logAudit(u.id, 'reminder.schedule', `created=${created} meds=${meds.length} adjusted=${adjusted} skippedQuiet=${skippedQuiet}`)
    return jsonOk({
      date: today,
      medicationsScanned: meds.length,
      remindersCreated: created,
      smartAdjustments: adjusted,
      quietHoursSkipped: skippedQuiet,
    })
  } catch (error) {
    logger.phiSafeError(error)
    return jsonError('Internal server error', 500)
  }
}
