import { z } from 'zod'
import { dbId, dbIdOptional } from './ids'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const medicationBase = {
  name:             z.string().min(1, 'Medication name is required').max(120),
  dosage:           z.string().min(1, 'Dosage is required').max(60),
  frequency:        z.string().max(60).optional().default('Daily'),
  instructions:     z.string().max(500).optional().nullable(),
  notes:            z.string().max(500).optional().nullable(),
  color:            z.string().max(30).optional().default('emerald'),
  active:           z.boolean().optional().default(true),
  stockRemaining:   z.number().int().nonnegative().optional().nullable(),
}

const timeSchema = z.preprocess(
  (v) => (Array.isArray(v) ? v : v === undefined ? undefined : [v]),
  z.array(z.string().regex(TIME_RE, 'Time must be HH:MM format')).default(['09:00'])
)

/** H-H:MM string like 09:00 — used by the timeWindowEnd field */
const hmString = z.preprocess(
  (v) => (typeof v === 'string' && TIME_RE.test(v) ? v : '09:00'),
  z.string().regex(TIME_RE)
)

/** POST /api/medications — create a new medication */
export const createMedicationSchema = z.object({
  ...medicationBase,
  times:            timeSchema,
  familyMemberId:   dbIdOptional,
  timeWindowEnd:    hmString,
  reminderInterval: z.number().int().min(1).max(1440).optional().default(10),
})

/** PUT /api/medications/[id] — update (all fields optional, partial) */
export const updateMedicationSchema = z.object({
  name:             z.string().min(1).max(120).optional(),
  dosage:           z.string().min(1).max(60).optional(),
  times:            z.array(z.string().regex(TIME_RE)).optional(),
  frequency:        z.string().max(60).optional(),
  instructions:     z.string().max(500).optional().nullable(),
  notes:            z.string().max(500).optional().nullable(),
  color:            z.string().max(30).optional(),
  active:           z.boolean().optional(),
  stockRemaining:   z.number().int().nonnegative().optional().nullable(),
})

/** GET /api/medications — query parameters */
export const medicationsQuerySchema = z.object({
  userId:         dbIdOptional,
  familyMemberId: dbId.optional(),
  active:         z.enum(['true','false','all']).optional().default('all'),
  cursor:         z.string().optional(),
  limit:          z.coerce.number().int().min(1).max(100).optional().default(20),
  fields:         z.string().optional(),
})
