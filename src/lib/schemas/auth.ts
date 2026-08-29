import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Valid email is required').max(254),
  password: z.string().min(1, 'Password is required').max(200),
  captchaToken: z.string().optional(),
  // Best-effort device IANA timezone (e.g. "Asia/Kolkata") — persisted so the
  // reminder cron fires doses on the user's local wall clock, not New York's.
  timezone: z.string().max(64).optional(),
})

export const registerSchema = z.object({
  email:    z.string().email('Valid email is required').max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  name:     z.string().min(1, 'Name is required').max(120),
  role:     z.enum(['patient', 'doctor', 'lab', 'caretaker']).optional().default('patient'),
  phone:    z.string().regex(/^\+[1-9]\d{6,14}$/, 'Phone must be E.164 with country code, e.g. +919876543210'),
  dateOfBirth: z.string(),
  consentAccepted:         z.boolean().optional().default(false),
  dataProcessingConsent:   z.boolean().optional().default(false),
  aiTrainingConsent:       z.boolean().optional().default(false),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email('Valid email is required').max(254),
})

export const resetPasswordSchema = z.object({
  token:    z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
})
