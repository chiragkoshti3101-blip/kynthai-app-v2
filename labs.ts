import { z } from 'zod'

/** POST /api/labs — create / update lab profile */
export const labProfileSchema = z.object({
  userId:            z.string().uuid().optional().nullable(),
  labName:           z.string().min(1, 'Lab name is required').max(120),
  licenseNumber:     z.string().min(1, 'License number is required').max(60),
  city:              z.string().min(1, 'City is required').max(60),
  address:           z.string().max(500).optional().nullable(),
  homeCollection:    z.boolean().optional().default(false),
  tests: z.array(z.object({
  name:  z.string().min(1).max(120),
  price: z.number().nonnegative().optional().default(0),
})).optional().default([]),
  documents:         z.record(z.object({ id: z.string().min(1).max(100) }).nullable()).optional().default({}),
})

/** GET /api/labs — query parameters */
export const labsQuerySchema = z.object({
  city:   z.string().max(60).optional(),
  search: z.string().max(120).optional(),
  userId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit:  z.coerce.number().int().min(1).max(100).optional().default(20),
  fields: z.string().optional(),
})
