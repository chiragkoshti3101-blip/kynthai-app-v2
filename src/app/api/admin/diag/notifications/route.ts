import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireOperatorToken } from '@/lib/operator-token'

export const dynamic = 'force-dynamic'

// No physical-schema guessing: Reminder maps to reminders in the model metadata.
// Read only aggregate fields, never subscription tokens or clinical bodies.
async function grouped(model: any, field: string, where = {}, limit?: number) {
  const counts = new Map<string, number>()
  const size = 500
  let cursor: string | undefined
  for (;;) {
    const rows = await model.findMany({
      where, select: { id: true, [field]: true }, orderBy: { id: 'asc' },
      take: size, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    for (const row of rows) {
      const key = row[field] ?? 'unknown'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    if (rows.length < size) break
    cursor = rows[rows.length - 1].id
  }
  const result = [...counts].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n)
  return limit ? result.slice(0, limit) : result
}

export async function GET(req: NextRequest) {
  const unauthorized = requireOperatorToken(req)
  if (unauthorized) return unauthorized

  const out: Record<string, unknown> = { ok: true, generatedAt: new Date().toISOString() }
  const unavailable: string[] = []
  const read = async (key: string, query: () => Promise<unknown>) => {
    try { out[key] = await query() }
    catch { out[key] = null; unavailable.push(key) }
  }
  const timezoneWhere = { AND: [{ timezone: { not: null } }, { timezone: { not: '' } }] }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  await read('usersTotal', () => db.user.count())
  await read('usersWithTimezone', () => db.user.count({ where: timezoneWhere }))
  await read('topTimezones', () => grouped(db.user, 'timezone', timezoneWhere, 8))
  await read('pushSubsTotal', () => db.pushSubscription.count())
  await read('pushSubsByType', () => grouped(db.pushSubscription, 'type'))
  await read('pushSubsDistinctUsers', async () => (await grouped(db.pushSubscription, 'userId')).length)
  out.reminderTable = 'reminders'
  await read('remindersTotalRows', () => db.reminder.count())
  await read('reminders24hByStatus', () => grouped(db.reminder, 'status', { date: { gte: since }, deletedAt: null }))
  await read('remindersPendingTotal', () => db.reminder.count({ where: { status: 'pending', deletedAt: null } }))
  await read('remindersAllByStatus', () => grouped(db.reminder, 'status'))
  await read('remindersDateRange', async () => {
    const [first, last] = await Promise.all([
      db.reminder.findFirst({ where: { date: { not: null } }, orderBy: { date: 'asc' }, select: { date: true } }),
      db.reminder.findFirst({ where: { date: { not: null } }, orderBy: { date: 'desc' }, select: { date: true } }),
    ])
    return { mn: first?.date ?? null, mx: last?.date ?? null }
  })
  await read('medicationsTotal', () => db.medication.count())
  await read('medicationsActive', () => db.medication.count({ where: { active: true } }))
  await read('notifs24hByChannel', () => grouped(db.notificationLog, 'channel', { createdAt: { gte: since } }))
  await read('doseReminders24h', () => db.notificationLog.count({ where: { createdAt: { gte: since }, type: 'reminder' } }))
  await read('pushDeliveries24h', () => db.notificationLog.count({ where: { createdAt: { gte: since }, channel: 'push' } }))
  await read('lastNotificationAt', async () => (await db.notificationLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }))?.createdAt ?? null)
  out.ok = unavailable.length === 0
  if (unavailable.length) out.unavailable = unavailable
  return Response.json(out, { status: unavailable.length ? 503 : 200 })
}
