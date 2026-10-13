-- Add US state columns for telemedicine state-licensing enforcement.
-- users.state = patient's location state; doctor_profiles.state = doctor's licensed state.
-- Idempotent (IF NOT EXISTS) so it is safe to apply on any environment.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "state" TEXT;
