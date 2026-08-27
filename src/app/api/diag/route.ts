import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const patient = await db.user.findUnique({ where: { email: 'patient@kynthai.app' } })
  if (!patient) return NextResponse.json({ error: 'patient not found' })
  const subs = await db.pushSubscription.findMany({
    where: { userId: patient.id },
    select: { id: true, type: true, endpoint: true, token: true, createdAt: true },
  })
  return NextResponse.json({
    userId: patient.id,
    totalSubs: subs.length,
    subs: subs.map(s => ({ type: s.type, endpoint: s.endpoint?.slice(0, 50), hasToken: !!s.token, tokenLen: s.token?.length || 0 })),
  })
}
