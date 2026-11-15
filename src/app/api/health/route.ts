import { NextRequest, NextResponse } from 'next/server'
import { applyStandardHeaders } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const checks: Record<string, string> = {}
  let healthy = true

  // Check database connectivity
  try {
    const { db } = await import('@/lib/db')
    await db.$queryRaw`SELECT 1`
    checks.database = 'ok'
  } catch (err: any) {
    checks.database = 'error'
    checks.databaseError = err?.message || String(err)
    healthy = false
    logger.phiSafeError(err, 'health_check.db')
  }

  // SECURITY: Only return minimal health info — no env, no uptime, no internals
  const status = healthy ? 200 : 503
  const res = NextResponse.json({
    status: healthy ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  }, { status })

  applyStandardHeaders(res, req)
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.headers.set('Pragma', 'no-cache')
  res.headers.set('Expires', '0')
  return res
}
