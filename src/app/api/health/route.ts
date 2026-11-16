import { NextRequest, NextResponse } from 'next/server'
import { applyStandardHeaders } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const checks: Record<string, string> = {}
  let healthy = true

  // Read-only, bounded probe of the same backend used by application queries.
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      db.user.findFirst({ select: { id: true } }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Database health timeout')), 5000)
      }),
    ])
    checks.database = 'ok'
  } catch (err: any) {
    checks.database = 'error'
    healthy = false
    logger.phiSafeError(err, 'health_check.db')
  } finally {
    clearTimeout(timer)
  }

  // SECURITY: Only return minimal health info — no env, no uptime, no internals
  const status = healthy ? 200 : 503
  const result = NextResponse.json({
    status: healthy ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  }, { status })

  applyStandardHeaders(result, req)
  result.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  result.headers.set('Pragma', 'no-cache')
  result.headers.set('Expires', '0')
  return result
}
