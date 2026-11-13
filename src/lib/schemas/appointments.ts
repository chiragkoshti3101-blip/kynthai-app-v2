import { z } from 'zod';
import { dbId, dbIdOptional, dbIdWithMessage } from './ids';

/** POST /api/appointments — book an appointment */
export const createAppointmentSchema = z.object({
  patientId: dbIdOptional,
  doctorId: dbIdWithMessage('doctorId must be a valid id'),
  scheduledAt: z.string().datetime('scheduledAt must be a valid ISO date/time'),
  type: z.enum(['video', 'audio', 'chat', 'in-person']).optional().default('video'),
  reason: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  consultationConsent: z.boolean().optional().default(false),
  durationMinutes: z.coerce.number().int().min(5).max(120).optional().default(15),
});

/** PUT /api/appointments — update status */
export const updateAppointmentSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled', 'no-show', 'rescheduled'], {
    error: 'Status must be one of: pending, confirmed, completed, cancelled, no-show, rescheduled',
  }),
  notes: z.string().max(1000).optional().nullable(),
});

/** GET /api/appointments — query parameters */
export const appointmentsQuerySchema = z.object({
  patientId: dbId.optional(),
  doctorId: dbId.optional(),
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled', 'no-show']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  fields: z.string().optional(),
});
