import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const patient = await db.user.findUnique({ where: { email: 'patient@kynthai.app' } })
  if (!patient) return NextResponse.json({ error: 'no patient' })
  const subs = await db.pushSubscription.findMany({
    where: { userId: patient.id, type: 'fcm' },
    select: { id: true, type: true, token: true, endpoint: true },
  })
  return NextResponse.json({ count: subs.length, tokens: subs.map(s => s.token) })
}
