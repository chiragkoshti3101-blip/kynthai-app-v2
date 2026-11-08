#!/usr/bin/env node
/**
 * Normalize a production Postgres DSN for use by `prisma migrate diff` / `psql`.
 *
 * Supabase pooler URLs (aws-*.pooler.supabase.com:6543, user postgres.<ref>)
 * do not work with the Prisma CLI introspection or psql (transaction-mode
 * pgbouncer rejects the extended query protocol). This rewrites them to the
 * direct 5432 endpoint (db.<ref>.supabase.co, user postgres, sslmode=require).
 *
 * Other DSNs pass through unchanged (except stripping `pgbouncer=true`).
 *
 * Usage: node scripts/db-sync/normalize-url.js "<dsn>"  → prints normalized DSN
 * The masked target (host:port) is logged to stderr; credentials stay out.
 */
const dsn = process.argv[2] || '';
if (!dsn) {
  console.error('[db-sync] no DSN provided');
  process.exit(2);
}

function fail(msg) {
  console.error(`[db-sync] ${msg}`);
  process.exit(2);
}

let url;
try {
  url = new URL(dsn);
} catch {
  fail('unparseable DSN');
}

if (url.hostname.endsWith('.pooler.supabase.com')) {
  const ref = url.username.startsWith('postgres.') ? url.username.slice('postgres.'.length) : null;
  if (!ref) fail('Supabase pooler DSN without postgres.<ref> username; cannot derive the project ref');
  const pass = url.password || '';
  url = new URL(`postgresql://postgres:${encodeURIComponent(pass)}@db.${ref}.supabase.co:5432/postgres?sslmode=require`);
  console.error(`[db-sync] pooler → direct: db.${ref}.supabase.co:5432`);
} else {
  url.searchParams.delete('pgbouncer');
  if (url.hostname.includes('supabase.co')) {
    url.searchParams.set('sslmode', 'require');
  }
  console.error(`[db-sync] target ${url.hostname}:${url.port}${url.pathname} (user=${url.username})`);
}

process.stdout.write(url.toString());
