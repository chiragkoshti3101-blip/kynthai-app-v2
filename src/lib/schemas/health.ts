import { z } from 'zod'
import { dbIdOptional } from './ids'

/** GET /api/health — no input params (health probe endpoint) */
// Defines the allowed *response* shape; no request schema needed for a GET probe.
export const healthResponseSchema = z.object({
  status:    z.enum(['ok', 'error']),
  timestamp: z.string().datetime(),
  uptime:    z.number(),
})

/** GET /api/health/score — query parameters */
export const healthScoreQuerySchema = z.object({
  userId: dbIdOptional,
  period: z.enum(['7d','30d','90d','1y']).optional().default('30d'),
})
