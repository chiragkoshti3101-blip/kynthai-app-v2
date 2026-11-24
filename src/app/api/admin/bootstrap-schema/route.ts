import { NextRequest } from 'next/server'
import { requireOperatorToken } from '@/lib/operator-token'

export const dynamic = 'force-dynamic'

/** Schema changes belong to reviewed SQL migrations, not GET requests. */
export async function GET(req: NextRequest) {
  const unauthorized = requireOperatorToken(req)
  if (unauthorized) return unauthorized
  return Response.json({
    ok: false,
    error: 'Runtime schema bootstrap is disabled. Apply the trusted database migrations.',
  }, { status: 410 })
}
