# Supabase Setup Guide for Kynthai

## Production project (current — Mumbai, being migrated to US)

- **Project ref:** `wsgwhwbdxhqtfpehplep`
- **Project URL:** https://wsgwhwbdxhqtfpehplep.supabase.co
- **Region:** `ap-south-1` (Mumbai) — **NOT** US; must be migrated to `us-east-1` for US launch.
- **Supabase CLI link:** `supabase link --project-ref wsgwhwbdxhqtfpehplep`

> ⚠️ The previously documented ref `wsgwhwbdxhqtfpehplep` is stale and must not be used.

## US migration (required for launch)

1. Create a new Supabase project in **N. Virginia (`us-east-1`)** via the Dashboard.
2. Apply the Prisma schema (creates camelCase columns matching `prisma/schema.prisma`): run `npx prisma migrate deploy` with `DATABASE_URL`/`DIRECT_URL` pointed at the new project (or `npm run db:migrate:deploy`). Do NOT run `supabase-schema.sql` — it creates an incompatible snake_case schema (`password_hash` vs Prisma's `password`, etc.) and will break every Prisma query.
   - Optional RLS policies from `supabase/migrations/*.sql` may be applied afterwards if you want Supabase-level RLS; they are not required for Prisma (which connects as the DB owner).
3. Copy the new project's **Transaction pooler** (port 6543) string into Vercel `DATABASE_URL` with `?pgbouncer=true&sslmode=require`, and the **Direct connection** (port 5432) into `DIRECT_URL` with `?sslmode=require`.
4. Update `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS_URL` to the new project.
5. Redeploy (push to `main` or Vercel redeploy).
6. Seed demo data: `node prisma/seed.js --force` (only against the new empty project).
7. Verify with `POST /api/auth/register` returning 200 and `POST /api/auth/login` returning a session cookie.

The CLI project ref is also stored in `supabase/config.json` so `supabase` commands
can resolve the project automatically.

## Quick Start

1. Create / open your Supabase project at https://supabase.com
2. Get your API keys from Project Settings → API
3. Run the migration file in SQL Editor (see [Migration](#migration) below)

## Environment Variables

Copy `.env.example` to `.env.production` (gitignored) and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://wsgwhwbdxhqtfpehplep.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx        # server-only — never expose to client
SUPABASE_JWT_SECRET=                            # Dashboard → Settings → API
SUPABASE_JWKS_URL=https://wsgwhwbdxhqtfpehplep.supabase.co/auth/v1/.well-known/jwks.json
```

> The anon / publishable key is safe to ship to the browser. The service_role
> / secret key bypasses RLS and MUST stay server-side.

## Migration

Run `supabase/migrations/20260101_initial_schema.sql` in Supabase SQL Editor
(https://supabase.com/dashboard/project/wsgwhwbdxhqtfpehplep/sql/new).

This creates:
- All tables with RLS enabled
- Storage buckets for medical documents
- Enum types for strict validation

Or, after linking the CLI:

```bash
supabase db push
```

## Storage Buckets

Create via Dashboard → Storage or via SQL:

| Bucket | Size Limit | Allowed Types |
|--------|------------|---------------|
| medical-documents | 5MB | pdf, jpeg, png, webp |
| prescriptions | 5MB | jpeg, png, webp, pdf |
| lab-results | 10MB | pdf, jpeg, png |

## Auth Providers (Recommended)

Enable in Dashboard → Auth → Providers:
- Email (with custom SMTP via SendGrid)
- Google (for easy signup)
- Magic Links (passwordless option)

## Connection strings

Two connection strings from Supabase Dashboard → Settings → Database.

> ⚠️ **Read this carefully — it was previously documented backwards and broke
> production (see [Production incident: register/login 500](#production-incident-registerlogin-500)).**

| Variable | Use | Where to find it |
|----------|-----|-----------------|
| `DATABASE_URL` | **Runtime queries** — must be the **Transaction pooler** (port **6543**) with `?pgbouncer=true` | Settings → Database → Connection string → **Transaction pooler** |
| `DIRECT_URL`   | **Migrations only** — the **Direct connection** (port **5432**); never goes through PgBouncer | Settings → Database → Connection string → **Direct connection** |

This matches `prisma/schema.prisma`, which states:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
// DATABASE_URL = postgresql://user:pass@host:6543/postgres?pgbouncer=true&sslmode=require
// DIRECT_URL   = postgresql://user:pass@host:5432/postgres?sslmode=require
```

Append `?sslmode=require` to both. URL-encode any special characters in the
password (e.g. `@` → `%40`). **`DATABASE_URL` MUST include `?pgbouncer=true`** —
without it Prisma won't enable connection pooling, and Vercel serverless
functions can't hold a direct Postgres connection.

### Example (correct)

```bash
DATABASE_URL=postgresql://postgres.wsgwhwbdxhqtfpehplep:YOUR_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
DIRECT_URL=postgresql://postgres.wsgwhwbdxhqtfpehplep:YOUR_PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
```

---

## Production incident: register/login 500

**Status:** Open (requires the env fix below) · **Detected:** 2026-08-01 · **Severity:** Critical (blocks user onboarding)

### Symptom

`POST /api/auth/register` and `POST /api/auth/login` return `500 INTERNAL_ERROR` in
Vercel production. The Vercel runtime log stack references **port `5432`** — Prisma
cannot reach Postgres. Supabase Auth itself succeeds (the user is created; retries
then hit Supabase's `email rate limit exceeded`), but the Prisma profile step fails.

### Root cause

Production `DATABASE_URL` pointed at the **direct connection (5432)** — unreachable
from Vercel serverless (no PgBouncer pooling; IP/IPv6 allow-listing) — and
`DIRECT_URL` was **not set** at all. The mistake was driven by the outdated docs
above, which had `DATABASE_URL`/`DIRECT_URL` swapped relative to
`prisma/schema.prisma`. Every route that touches Prisma is affected, not just auth.

### Fix (apply in Vercel → Project → Settings → Environment Variables → Production)

1. Set `DATABASE_URL` to the **Transaction pooler** string (port **6543**) with `?pgbouncer=true&sslmode=require`.
2. Set `DIRECT_URL` to the **Direct connection** string (port **5432**) with `?sslmode=require`.
3. Redeploy (push to `main` or `vercel --prod`).
4. Verify: `POST /api/auth/register` with a test email + `dateOfBirth` (≥18) + the
   three consent flags returns `200` with an `id`, and `POST /api/auth/login`
   returns a session cookie instead of `500`.

### Regression guard

- `prisma/schema.prisma` documents the correct mapping — don't "fix" the doc's old
  swapped table back; the table above is now correct.
- If `DIRECT_URL` is ever missing, Prisma falls back to `DATABASE_URL` (no pooling)
  — the same failure returns. Always set both.

## Testing Locally

```bash
# Install Supabase CLI
brew install supabase       # macOS
# or: npm install -g supabase

# Link your project
supabase login
supabase link --project-ref wsgwhwbdxhqtfpehplep

# Run local development (uses .env.local)
npm run dev
```

## Migration Sync

To sync Prisma schema with Supabase:

```bash
# Generate migration
npx prisma migrate dev --name sync-supabase

# Apply to Supabase (requires additional tooling)
```

The app uses **dual database** pattern:
- Supabase Auth for authentication
- Prisma (PostgreSQL) for core app data
- Supabase Storage for file uploads

