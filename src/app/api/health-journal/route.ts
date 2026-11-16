import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  requireAuth,
  requireAuthWithCsrf,
  jsonOk,
  jsonError,
  readJson,
  parseJsonCol,
} from '@/lib/api-helpers'
import { logAudit } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { todayStr, toISODateTime } from '@/lib/utils'
export const dynamic = 'force-dynamic'

// healthJournal.date is a DateTime column — normalize date-only input
// ("2026-08-11") to a full ISO-8601 datetime or Prisma rejects the query.
function normalizeDate(raw: unknown): string {
  const s = typeof raw === 'string' && raw ? raw : todayStr()
  return s.includes('T') ? s : toISODateTime(s)
}

// GET /api/health-journal — recent journal entries for the session user.
export async function GET(req: NextRequest) {
  try {
    const { response, user } = await requireAuth(req)
    if (response || !user) return response!

    await logAudit(user.id, 'journal.read', { resourceType: 'HealthJournal' })

    const entries = await db.healthJournal.findMany({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
      take: 30,
    })

    return jsonOk({
      entries: entries.map((e) => ({
        id: e.id,
        date: e.date,
        mood: e.mood,
        symptoms: parseJsonCol<unknown[]>(e.symptoms, []),
        notes: e.notes,
        vitals: parseJsonCol<Record<string, unknown> | null>(e.vitals, null),
      })),
    })
  } catch (error) {
    logger.phiSafeError(error)
    return jsonError('Failed to load journal entries', 500, 'JOURNAL_ERROR')
  }
}

// POST /api/health-journal — upsert the journal entry for (user, date).
// One entry per day; a second save for the same day updates the first.
export async function POST(req: NextRequest) {
  try {
    const { response, user } = await requireAuthWithCsrf(req)
    if (response || !user) return response!

    const body = await readJson<{
      date?: unknown
      mood?: unknown
      symptoms?: unknown
      notes?: unknown
      vitals?: unknown
    }>(req)
    if (!body) return jsonError('Invalid JSON', 400, 'INVALID_JSON')

    if (body.date !== undefined && (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(body.date) || Number.isNaN(Date.parse(body.date)))) {
      return jsonError('Invalid journal date', 422, 'VALIDATION_ERROR')
    }
    const date = normalizeDate(body.date)
    const mood = typeof body.mood === 'string' && body.mood ? body.mood.slice(0, 50) : null
    const symptoms = Array.isArray(body.symptoms) ? JSON.stringify(body.symptoms) : '[]'
    const notes = typeof body.notes === 'string' ? body.notes.slice(0, 5000) : null
    const vitals =
      body.vitals && typeof body.vitals === 'object' && !Array.isArray(body.vitals)
        ? JSON.stringify(body.vitals)
        : null

    const entry = await db.healthJournal.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: { mood, symptoms, notes, vitals },
      create: { userId: user.id, date, mood, symptoms, notes, vitals },
    })

    await logAudit(user.id, 'journal.upsert', { resourceType: 'HealthJournal' })
    return jsonOk({ entry })
  } catch (error) {
    logger.phiSafeError(error)
    return jsonError('Failed to save journal entry', 500, 'JOURNAL_ERROR')
  }
}
