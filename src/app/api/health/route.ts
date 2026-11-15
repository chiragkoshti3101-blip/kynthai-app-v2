import { NextRequest, NextResponse } from 'next/server'
import { applyStandardHeaders } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const checks: Record<string, string> = {}
  let healthy = true

  // Check database connectivity via Supabase REST API (HTTPS — works from Vercel)
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase URL or Anon Key not configured')
    }
    const res = await fetch(`${supabaseUrl}/rest/v1/users?select=count`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    })
    if (!res.ok) {
      throw new Error(`Supabase REST returned ${res.status}`)
    }
    checks.database = 'ok'
  } catch (err: any) {
    checks.database = 'error'
    healthy = false
    logger.phiSafeError(err, 'health_check.db')
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
