-- Keep this migration additive and safe to rerun against projects that may
-- already have one or more of the columns from an earlier manual rollout.
ALTER TABLE "lab_bookings" ADD COLUMN IF NOT EXISTS "tests_enc" TEXT;

-- Add a stable non-PHI reconciliation key for consultation payments.
-- The nullable column preserves existing non-appointment payments.
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "appointmentId" TEXT;
CREATE INDEX IF NOT EXISTS "payments_appointmentId_idx" ON "payments"("appointmentId");

-- Deterministic keyed digests support exact equality checks without querying
-- randomized ciphertext. Values are populated by the controlled backfill job.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordResetToken_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerificationToken_enc" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerificationToken_hash" TEXT;
ALTER TABLE "family_members" ADD COLUMN IF NOT EXISTS "inviteEmail_hash" TEXT;
ALTER TABLE "family_members" ADD COLUMN IF NOT EXISTS "inviteToken_hash" TEXT;
ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "licenseNumber_hash" TEXT;
ALTER TABLE "lab_profiles" ADD COLUMN IF NOT EXISTS "licenseNumber_hash" TEXT;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "notes_enc" TEXT;
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "description_enc" TEXT;
CREATE INDEX IF NOT EXISTS "users_phone_hash_idx" ON "users"("phone_hash");
CREATE INDEX IF NOT EXISTS "family_members_inviteEmail_hash_idx" ON "family_members"("inviteEmail_hash");
CREATE INDEX IF NOT EXISTS "family_members_inviteToken_hash_idx" ON "family_members"("inviteToken_hash");
CREATE INDEX IF NOT EXISTS "doctor_profiles_licenseNumber_hash_idx" ON "doctor_profiles"("licenseNumber_hash");
CREATE INDEX IF NOT EXISTS "lab_profiles_licenseNumber_hash_idx" ON "lab_profiles"("licenseNumber_hash");
