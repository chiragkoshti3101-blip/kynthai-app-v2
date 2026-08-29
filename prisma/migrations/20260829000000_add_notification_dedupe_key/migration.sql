-- Stable per-dose identity. One in-app row and one push audit row may exist,
-- but the same channel cannot claim the same dose twice.
ALTER TABLE "notification_logs"
  ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "notification_logs_user_channel_dedupe_key"
  ON "notification_logs" ("userId", "channel", "dedupeKey")
  WHERE "dedupeKey" IS NOT NULL;
