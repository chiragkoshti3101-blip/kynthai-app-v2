-- Automated verification pre-screen for provider applications.
-- Stores the deterministic + optional AI screen result so the admin review
-- queue can order and explain applications. No PHI: only rule outcomes,
-- masked references and document slot names are stored.

ALTER TABLE "doctor_profiles"
  ADD COLUMN IF NOT EXISTS "aiReview" TEXT,
  ADD COLUMN IF NOT EXISTS "aiVerdict" TEXT,
  ADD COLUMN IF NOT EXISTS "aiReviewAt" TIMESTAMP(3);

ALTER TABLE "lab_profiles"
  ADD COLUMN IF NOT EXISTS "aiReview" TEXT,
  ADD COLUMN IF NOT EXISTS "aiVerdict" TEXT,
  ADD COLUMN IF NOT EXISTS "aiReviewAt" TIMESTAMP(3);
