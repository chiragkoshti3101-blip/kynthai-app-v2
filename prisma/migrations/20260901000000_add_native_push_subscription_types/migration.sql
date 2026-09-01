-- Store the native transport type and token alongside existing Web Push rows.
-- Existing Web Push rows receive the webpush default and keep their endpoint.
ALTER TABLE "push_subscriptions"
  ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'webpush';

ALTER TABLE "push_subscriptions"
  ADD COLUMN IF NOT EXISTS "token" TEXT;

-- The Prisma model now scopes a device by transport type. This permits one
-- browser subscription and one native token to coexist for the same account.
DROP INDEX IF EXISTS "push_subscriptions_userId_endpoint_key";

CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_userId_endpoint_type_key"
  ON "push_subscriptions"("userId", "endpoint", "type");

CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_userId_type_token_key"
  ON "push_subscriptions"("userId", "type", "token");

CREATE INDEX IF NOT EXISTS "push_subscriptions_userId_idx"
  ON "push_subscriptions"("userId");
