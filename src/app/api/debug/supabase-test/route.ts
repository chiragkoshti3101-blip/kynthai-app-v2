import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'NOT SET'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || 'NOT SET'
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'NOT SET'
  
  // Test Supabase auth health
  let authStatus = 'unknown'
  let authError = ''
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { 'apikey': anonKey },
    })
    authStatus = `${res.status} ${res.statusText}`
    authError = await res.text()
  } catch (e: any) {
    authStatus = 'fetch failed'
    authError = e?.message || String(e)
  }

  // Test REST API
  let restStatus = 'unknown'
  try {
    const res = await fetch(`${url}/rest/v1/users?select=count`, {
      headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
    })
    restStatus = `${res.status} ${res.statusText}`
  } catch (e: any) {
    restStatus = 'fetch failed: ' + (e?.message || String(e))
  }

  return NextResponse.json({
    supabaseUrl: url,
    serviceKeySet: key !== 'NOT SET',
    anonKeySet: anonKey !== 'NOT SET',
    authHealth: authStatus,
    authError: authError.slice(0, 200),
    restStatus,
  })
}
