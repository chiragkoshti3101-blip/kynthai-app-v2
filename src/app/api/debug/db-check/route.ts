import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const url = process.env.DATABASE_URL || 'NOT SET'
  const masked = url.replace(/:([^@]+)@/, ':***@')
  return NextResponse.json({
    databaseUrl: masked,
    isConfigured: url.startsWith('postgresql://') || url.startsWith('file:'),
    length: url.length,
  })
}
