import { z } from 'zod'

// ── Lab bookings ─────────────────────────────────────────────────────

export const createLabBookingSchema = z.object({
  labId:       z.string().uuid('labId must be a valid UUID'),
  patientId:   z.string().uuid().optional().nullable(),
  scheduledAt: z.string().datetime('scheduledAt must be an ISO date/time'),
  tests: z.array(
    z.object({
      name:  z.string().min(1).max(200),
      price: z.number().positive('Test price must be positive'),
    })
  ).min(1, 'At least one test is required'),
  homeCollection: z.boolean().optional().default(false),
})

// ── Emergency / SOS ──────────────────────────────────────────────────

export const emergencySosSchema = z.object({
  location:    z.string().max(300).optional().nullable(),
  notes:       z.string().max(1000).optional().nullable(),
  medicalInfo: z.string().max(1000).optional().nullable(),
})

// ── Doctor: notes ────────────────────────────────────────────────────

export const createDoctorNoteSchema = z.object({
  patientId: z.string().uuid('patientId must be a valid UUID'),
  content:   z.string().min(1, 'content is required').max(5000),
  type:      z.enum(['observation', 'diagnosis', 'follow-up']).default('observation'),
})

// ── Doctor: availability ─────────────────────────────────────────────

export const availabilitySlotSchema = z.object({
  day:   z.enum(['monday','tuesday','wednesday','thursday','friday','saturday','sunday']),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'start must be HH:MM'),
  end:   z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'end must be HH:MM'),
})

export const availabilityUpdateSchema = z.object({
  schedule: z.array(
    z.object({
      day:   z.enum(['monday','tuesday','wednesday','thursday','friday','saturday','sunday']),
      slots: z.array(
        z.object({
          start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          end:   z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        })
      ),
    })
  ).min(1, 'Schedule array must not be empty'),
})

// ── Doctor: prescribe ────────────────────────────────────────────────

export const prescribeSchema = z.object({
  patientId:    z.string().uuid().optional().nullable(),
  patientEmail: z.string().email().max(254).optional().nullable(),
  medications: z.array(
    z.object({
      name:        z.string().min(1).max(200),
      dosage:      z.string().min(1).max(100),
      times:       z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1),
      frequency:   z.string().max(60).optional().default('Daily'),
      instructions: z.string().max(500).optional().nullable(),
    })
  ).min(1, 'At least one medication is required'),
  notes:         z.string().max(2000).optional().nullable(),
  followUpDate:  z.string().datetime().optional().nullable(),
})

// ── Admin: doctor/lab actions ────────────────────────────────────────

export const adminActionSchema = z.object({
  id:     z.string().min(1, 'id is required'),
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional().nullable(),
}).refine(
  data => data.action === 'approve' || (data.action === 'reject' && data.reason && data.reason.trim().length > 0),
  { message: 'reason is required for rejection', path: ['reason'] }
)

// ── Consult messages ─────────────────────────────────────────────────

export const consultMessageSchema = z.object({
  appointmentId: z.string().uuid('appointmentId must be a valid UUID'),
  content:       z.string().min(1, 'content is required').max(5000),
})

// ── Prescription scan / identify-medicine ────────────────────────────

export const prescriptionScanSchema = z.object({
  image: z.string().min(1, 'image is required').max(10 * 1024 * 1024),
})

export const identifyMedicineSchema = z.object({
  image: z.string().min(1, 'image is required').max(10 * 1024 * 1024),
})
