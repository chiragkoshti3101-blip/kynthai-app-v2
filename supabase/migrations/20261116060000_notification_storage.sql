-- Trusted operator migration. Never run DDL from an HTTP request.
BEGIN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.doctor_profiles ADD COLUMN IF NOT EXISTS state TEXT;
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'webpush',
  token TEXT,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'webpush';
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS token TEXT;
-- Duplicate legacy rows must be resolved explicitly, not silently discarded.
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_userId_endpoint_type_key"
  ON public.push_subscriptions ("userId", endpoint, type);
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_userId_type_token_key"
  ON public.push_subscriptions ("userId", type, token);
CREATE INDEX IF NOT EXISTS "push_subscriptions_userId_idx" ON public.push_subscriptions ("userId");
DROP INDEX IF EXISTS public."push_subscriptions_userId_endpoint_key";
ALTER TABLE public.notification_logs ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS notification_logs_user_channel_dedupe_key
  ON public.notification_logs ("userId", channel, "dedupeKey") WHERE "dedupeKey" IS NOT NULL;
-- NULL user ids need their own uniqueness rule for email-only invitations.
CREATE UNIQUE INDEX IF NOT EXISTS notification_logs_anonymous_channel_dedupe_key
  ON public.notification_logs (channel, "dedupeKey") WHERE "userId" IS NULL AND "dedupeKey" IS NOT NULL;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
