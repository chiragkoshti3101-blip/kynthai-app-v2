/**
 * Operator-token guard for one-off operational endpoints
 * (`/api/admin/bootstrap-schema` and `/api/admin/diag/*`).
 *
 * These routes are not part of the user-facing admin surface: they run fixed
 * DDL or send real pushes, so they are deliberately unreachable from the app
 * and guarded by a single deployment secret (`SCHEMA_BOOTSTRAP_TOKEN`).
 *
 * The previous per-route check was `provided !== \`Bearer ${expected}\``, which
 * leaks token length/prefix through string comparison timing and had no
 * throttling. This guard compares in constant time, rate-limits attempts to
 * 5/min per caller, and fails closed when the secret is unset (so forgetting to
 * configure it can never expose the endpoint). Unset the env var to disable the
 * endpoints entirely once the migrations are done.
 */
import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/security'

export function requireOperatorToken(req: NextRequest): NextResponse | null {
  const limited = rateLimit(req, 5, 60_000)
  if (limited) return limited

  const expected = process.env.SCHEMA_BOOTSTRAP_TOKEN
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const provided = Buffer.from(req.headers.get('authorization') ?? '')
  const wanted = Buffer.from(`Bearer ${expected}`)
  const matches = provided.length === wanted.length && timingSafeEqual(provided, wanted)

  return matches ? null : NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}
