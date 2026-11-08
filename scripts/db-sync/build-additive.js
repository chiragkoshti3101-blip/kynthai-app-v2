#!/usr/bin/env node
/**
 * Filter a `prisma migrate diff` script down to the ADDITIVE part only,
 * rewritten to be idempotent (safe to re-run any number of times against a
 * live database). Destructive or data-level statements are NEVER emitted;
 * they are listed on stderr so a human can decide deliberately.
 *
 * Usage: node scripts/db-sync/build-additive.js <in.sql> [out.sql]
 *   out omitted → write to stdout; summary always on stderr.
 */
const fs = require('fs');

const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath) {
  console.error('[db-sync] usage: build-additive.js <in.sql> [out.sql]');
  process.exit(2);
}
const src = fs.readFileSync(inPath, 'utf8');

// ── Split Prisma's SQL script into statements ─────────────────────────────
// Accumulate until a ';' that is outside single/double/dollar-quoted
// contexts and not part of a `$$`-style quoting terminator.
function splitStatements(text) {
  const stmts = [];
  let cur = '';
  let inS = false, inD = false, inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inS) {
      cur += c;
      if (c === "'") inS = false;
      continue;
    }
    if (inD) {
      cur += c;
      if (c === '"') inD = false;
      continue;
    }
    if (inQ) {
      cur += c;
      if (c === '$' && text[i + 1] === '$') {
        cur += '$';
        i++;
        inQ = false;
      }
      continue;
    }
    if (c === "'") inS = true;
    else if (c === '"') inD = true;
    else if (c === '$' && text[i + 1] === '$') {
      inQ = true;
      cur += '$$';
      i++;
      continue;
    } else if (c === ';') {
      if (cur.trim()) stmts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) stmts.push(cur.trim());
  return stmts;
}

// ── Idempotency guards ─────────────────────────────────────────────────────
// Every guarded block ends with a WHEN OTHERS catch-all so that one
// statement's failure (e.g. an FK constraint hitting inconsistent existing
// data) cannot abort the whole psql run. The post-apply "verify" step
// recomputes drift and surfaces anything that was skipped.
function guard(body, whenClauses) {
  return [
    'DO $db_sync$ BEGIN',
    ...body.split('\n'),
    'EXCEPTION',
    ...whenClauses.map((w) => `  WHEN ${w} THEN RAISE NOTICE '%', 'skipped (idempotency guard)';`),
    "  WHEN OTHERS THEN RAISE WARNING '%', 'skipped by catch-all: SQLSTATE % - %';",
    'END $db_sync$',
  ].join('\n');
}

const apply = [];
const skipped = [];

for (const raw of splitStatements(src)) {
  const norm = raw.replace(/^--[^\n]*\n/g, '').replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  if (!norm) continue;
  const u = norm.toUpperCase();

  if (/^CREATE TABLE IF NOT EXISTS/.test(u)) apply.push(raw);
  else if (/^CREATE TABLE\b/.test(u)) apply.push(raw.replace(/^CREATE TABLE/i, 'CREATE TABLE IF NOT EXISTS'));
  else if (/^CREATE SCHEMA IF NOT EXISTS/.test(u)) apply.push(raw);
  else if (/^CREATE SCHEMA\b/.test(u)) apply.push(raw.replace(/^CREATE SCHEMA/i, 'CREATE SCHEMA IF NOT EXISTS'));
  else if (/^CREATE (UNIQUE )?INDEX/.test(u)) apply.push(raw.replace(/^CREATE (UNIQUE )?INDEX/i, (m, uniq) => `CREATE ${uniq || ''}INDEX IF NOT EXISTS`));
  else if (/^CREATE TYPE\b/.test(u)) apply.push(guard(raw, ['duplicate_object', 'undefined_table']));
  else if (/^ALTER TYPE\b/.test(u)) apply.push(guard(raw, ['duplicate_object', 'undefined_table']));
  else if (/^ALTER TABLE\b.*ADD (COLUMN |CONSTRAINT |PRIMARY KEY|UNIQUE|FOREIGN KEY)/.test(u))
    apply.push(guard(raw, ['duplicate_column', 'duplicate_object', 'undefined_column', 'undefined_table']));
  else if (/^SET \S+ TO\b/.test(u) || /^SET \S+ = /.test(u) || /^SET TIME ZONE\b/.test(u)) apply.push(raw);
  else skipped.push(norm);
}

const out = apply.length ? apply.join('\n\n') + '\n' : '';
if (outPath) fs.writeFileSync(outPath, out);
else process.stdout.write(out);

console.error(`[db-sync] additive statements kept: ${apply.length}`);
console.error(`[db-sync] destructive/data-level statements SKIPPED (manual review): ${skipped.length}`);
for (const s of skipped) console.error(`[db-sync]   skipped: ${s.slice(0, 300)}`);
if (apply.length === 0) console.error('[db-sync] nothing additive to apply');
