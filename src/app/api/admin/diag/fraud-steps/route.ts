import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Removed endpoint.
 *
 * This was a temporary, admin-only probe used to locate the
 * `/api/admin/overview` + `/api/admin/fraud` 500s. It did its job: the shared
 * fraud engine was failing because the Prisma encryption middleware rebuilt
 * `Date` operands in `where` clauses as empty objects (fixed in
 * `src/lib/prisma-encryption-middleware.ts`).
 *
 * The probe is no longer needed. It is tombstoned rather than deleted because
 * the connected GitHub app cannot delete files; it is safe to remove by hand.
 */
export function GET() {
  return new NextResponse(null, { status: 404 })
}
