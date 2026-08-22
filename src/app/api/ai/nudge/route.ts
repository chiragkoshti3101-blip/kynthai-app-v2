import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { jsonOk, jsonError, requireAuth } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'
import { todayStr, daysAgo } from '@/lib/utils'
import { rateLimit } from '@/lib/security'
// Prevent static generation — this route reads session + DB at runtime
export const dynamic = 'force-dynamic'

// ── GET ──────────────────────────────────────────────────────────────
// Returns up to 2 proactive health nudges based on user data.
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, 30, 60000);
  if (limited) return limited;
  try {
    const { response, user } = await requireAuth(req)
    if (response || !user) return response!

    const userId = user.id

  // Audit: AI health nudge generation (queries medication, reminder, journal sensitive health data)
  await logAudit({
    userId: user.id,
    action: 'ai.nudge',
    resourceType: 'HealthJournal',
    category: 'access',
    outcome: 'success',
  })

    // ── Parallel data fetch ────────────────────────────────────────
    const [activeMeds, missedReminders, journalEntries, streak, recentChats] =
      await Promise.all([
        // Active medications
        db.medication.findMany({
          where: { userId, active: true },
          select: { id: true, name: true, createdAt: true },
        }),
        // Missed / skipped reminders in last 24 h
        // daysAgo()/todayStr() already return full ISO-8601 timestamps; do NOT
        // wrap them in toISODateTime() (that appends a second suffix and Prisma
        // rejects the DateTime with "trailing input").
        db.reminder.findMany({
          where: {
            date: {
              gte: daysAgo(1),
              lte: todayStr()
            },
            status: { in: ['pending', 'skipped'] },
            medication: { userId },
          },
          include: { medication: { select: { name: true } } },
          take: 10,
        }),
        // Recent journal entries (last 5)
        db.healthJournal.findMany({
          where: { userId },
          orderBy: { date: 'desc' },
          take: 5,
          select: { date: true, symptoms: true, mood: true, notes: true },
        }),
        // Daily-meds streak
        db.userStreak.findFirst({
          where: { userId, type: 'daily_meds' },
          select: { count: true },
        }),
        // Recent chat messages (last 5)
        db.chatMessage.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { role: true, content: true, createdAt: true },
        }),
      ])

    const medIds = activeMeds.map((m: any) => m.id)
    const today = todayStr()

    // Today's reminders (for adherence check)
    const todayReminders = medIds.length > 0
      ? await db.reminder.findMany({
          where: {
            medicationId: { in: medIds },
            date: today
          },
        })
      : []

    const takenToday = todayReminders.filter((r: any) => r.status === 'taken').length
    const totalToday = todayReminders.length

    // ── Nudge generation ───────────────────────────────────────────
    const nudges: Array<{
      id: string
      type: 'tip' | 'warning' | 'celebration' | 'reminder'
      title: string
      message: string
      action?: string
      actionLabel?: string
      dismissible: boolean
    }> = []

    // 1) Missed doses in last 24 h → warning
    const missedCount = missedReminders.length
    if (missedCount >= 2) {
      const missedNames = [...new Set(missedReminders.map((r: any) => r.medication.name))]
      const list = missedNames.length <= 2 ? missedNames.join(' and ') : `${missedNames.slice(0, 2).join(', ')} +${missedNames.length - 2}`
      nudges.push({
        id: 'missed-dose',
        type: 'warning',
        title: 'Missed medication doses',
        message: `You have ${missedCount} pending doses (${list}). Try to take them now to stay on track.`,
        action: '/meds',
        actionLabel: 'View medications',
        dismissible: true,
      })
    }

    // 2) 7-day streak → celebration
    const streakCount = streak?.count ?? 0
    if (streakCount >= 7) {
      nudges.push({
        id: 'streak-7',
        type: 'celebration',
        title: `${streakCount}-day streak!`,
        message: streakCount >= 30
          ? 'Incredible! A full month of consistent medication adherence. You are unstoppable!'
          : 'Amazing consistency! You have taken your medications on time for a full week. Keep it up!',
        action: '/meds',
        actionLabel: 'Keep going',
        dismissible: true,
      })
    }

    // 3) No journal entry in 3+ days → tip
    if (journalEntries.length === 0 || journalEntries[0]?.date && new Date(journalEntries[0]!.date) < new Date(daysAgo(3))) {
      nudges.push({
        id: 'journal-tip',
        type: 'tip',
        title: 'How are you feeling today?',
        message: 'It has been a few days since your last journal entry. Tracking your symptoms helps your care team give better advice.',
        action: 'log-mood',
        actionLabel: 'Log your mood',
        dismissible: true,
      })
    }

    // 4) New medication added in last 7 days → reminder
    const newMeds = activeMeds.filter((m: any) => (m.createdAt ? m.createdAt >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : false))
    if (newMeds.length > 0) {
      const name = newMeds[0]!.name
      nudges.push({
        id: 'new-medication',
        type: 'reminder',
        title: `New medication: ${name}`,
        message: `${name} has been added to your regimen. Remember to take it as prescribed and track any side effects in your journal.`,
        action: '/meds',
        actionLabel: 'View details',
        dismissible: true,
      })
    }

    // 5) Symptom logged + recent medication change → interaction check
    const recentSymptoms = journalEntries.some((j: any) => {
      try {
        const s = JSON.parse(j.symptoms || '[]')
        return Array.isArray(s) && s.length > 0
      } catch {
        return false
      }
    })
    if (recentSymptoms && newMeds.length > 0) {
      nudges.push({
        id: 'interaction-check',
        type: 'warning',
        title: 'New medication + symptoms logged',
        message: 'You recently logged symptoms and added a new medication. Consider asking Dr. Kynthai about possible interactions.',
        action: 'ask-ai',
        actionLabel: 'Ask Dr. Kynthai',
        dismissible: true,
      })
    }

    // 6) Morning medication reminder (before 10 am)
    const hour = new Date().getHours()
    if (hour < 10 && medIds.length > 0 && totalToday > 0 && takenToday < totalToday) {
      const remaining = totalToday - takenToday
      nudges.push({
        id: 'morning-meds',
        type: 'reminder',
        title: 'Morning medication reminder',
        message: remaining === 1
          ? 'You have 1 medication remaining to take today.'
          : `You have ${remaining} medications remaining to take today.`,
        action: '/meds',
        actionLabel: 'Take now',
        dismissible: true,
      })
    }

    // ── Limit to 2 nudges ──────────────────────────────────────────
    const limited = nudges.slice(0, 2)

    return jsonOk({ nudges: limited })
  } catch (error) {
    logger.phiSafeError(error)
    return jsonError('Internal server error', 500)
  }
}
