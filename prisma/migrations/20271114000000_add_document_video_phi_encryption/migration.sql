-- Encrypted shadows for the two remaining PHI free-text fields (KYN-MED-006).
-- Additive only: existing plaintext columns stay in place until the controlled
-- backfill (scripts/encrypt-existing-data.mjs) populates these and
-- ENCRYPTION_TRANSITIONAL is set to false.

ALTER TABLE "medical_documents" ADD COLUMN IF NOT EXISTS "title_enc" TEXT;
ALTER TABLE "medical_documents" ADD COLUMN IF NOT EXISTS "description_enc" TEXT;
ALTER TABLE "video_calls" ADD COLUMN IF NOT EXISTS "notes_enc" TEXT;
ALTER TABLE "lab_bookings" ADD COLUMN IF NOT EXISTS "deliveryAddress_enc" TEXT;
ALTER TABLE "lab_bookings" ADD COLUMN IF NOT EXISTS "deliveryCity_enc" TEXT;
ALTER TABLE "lab_bookings" ADD COLUMN IF NOT EXISTS "deliveryZip_enc" TEXT;
