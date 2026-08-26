-- Add missing rejectionReason column to doctor_profiles and lab_profiles.
-- The Prisma schema declares these but no migration ever created them.
ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
ALTER TABLE "lab_profiles" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
