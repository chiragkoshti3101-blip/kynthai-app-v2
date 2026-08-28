import { NextRequest } from 'next/server'
import { requireAuth, jsonError, jsonOk } from '@/lib/api-helpers'
import { isAiAvailable } from '@/lib/nvidia'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ai/status
 *
 * Tiny availability probe for the AI assistant UI (founder P0: the AI tab
 * must never market a composer that 402s). Returns a single boolean —
 * no model names, no provider names, no secrets, no PHI.
 *
 * `available` is true when any funded provider key is configured on the
 * server (CLINE_API_KEY / OPENAI_API_KEY / NVIDIA_API_KEY — same chain the
 * chat route uses). When false, the UI shows the honest "being set up"
 * panel instead of a dead composer.
 */
export async function GET(req: NextRequest) {
  const { response, user } = await requireAuth(req)
  if (response) return response
  if (!user) return jsonError('Unauthorized', 401)

  return jsonOk({ available: isAiAvailable() })
}
