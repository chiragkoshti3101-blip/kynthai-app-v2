-- Enable Row Level Security on internal tables created by Prisma migrations.
--
-- These tables are created by `prisma migrate` (not by the hand-written
-- Supabase migrations), so they never received RLS. On Supabase, default
-- privileges grant `anon` / `authenticated` access to new tables in `public`,
-- which makes any table without RLS readable through PostgREST with the anon
-- key that ships in the browser bundle.
--
-- The application only touches these tables through Prisma with the service
-- role, which bypasses RLS, so enabling RLS here and adding no policies keeps
-- the app working while denying every browser-side role. The REVOKEs are
-- belt-and-braces for projects that later grant explicit policies.

ALTER TABLE IF EXISTS "medical_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "revoked_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "newsletter_subscribers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "free_tier_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "free_tier_usage_audit" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "medical_documents" FROM anon;
    REVOKE ALL ON TABLE "push_subscriptions" FROM anon;
    REVOKE ALL ON TABLE "revoked_sessions" FROM anon;
    REVOKE ALL ON TABLE "feedback" FROM anon;
    REVOKE ALL ON TABLE "newsletter_subscribers" FROM anon;
    REVOKE ALL ON TABLE "free_tier_usage" FROM anon;
    REVOKE ALL ON TABLE "free_tier_usage_audit" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "medical_documents" FROM authenticated;
    REVOKE ALL ON TABLE "push_subscriptions" FROM authenticated;
    REVOKE ALL ON TABLE "revoked_sessions" FROM authenticated;
    REVOKE ALL ON TABLE "feedback" FROM authenticated;
    REVOKE ALL ON TABLE "newsletter_subscribers" FROM authenticated;
    REVOKE ALL ON TABLE "free_tier_usage" FROM authenticated;
    REVOKE ALL ON TABLE "free_tier_usage_audit" FROM authenticated;
  END IF;
END $$;
