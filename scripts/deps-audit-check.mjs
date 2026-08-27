#!/usr/bin/env node
/**
 * CI dependency audit gate runner.
 *
 * Runs `npm audit --json`, fails the build on any HIGH or CRITICAL advisory
 * UNLESS the advisory is a known next-bundled platform advisory that is
 * unfixable without upgrading next to a version that breaks the Vercel
 * production build (see check-deps.mjs for the allowlist and reasoning).
 *
 * Exit 0 = clean or only allowlisted advisories.
 * Exit 1 = an un-allowlisted high/critical advisory (blocks release).
 */
import { execFileSync } from 'node:child_process';
import { isAllowlistedAdvisory, isAllowlistedPackage } from './check-deps.mjs';

let raw;
try {
  raw = execFileSync('npm', ['audit', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  // npm audit exits non-zero when findings exist; stdout still has the JSON.
  raw = `${e.stdout || ''}`;
}

let audit;
try {
  audit = JSON.parse(raw);
} catch {
  console.error('[deps] could not parse npm audit output');
  process.exit(2);
}

const vulnerabilities = audit?.vulnerabilities || {};
const blockers = [];
const allowlisted = [];

for (const [name, info] of Object.entries(vulnerabilities)) {
  const sev = (info?.severity || '').toLowerCase();
  if (sev !== 'high' && sev !== 'critical') continue;
  const via = info?.via || [];
  // Collect GHSA ids: `via` items are either advisory objects (with .url) or
  // plain dependency-name strings that reference sibling vulnerability
  // entries. Handle both.
  const ghsas = new Set();
  for (const v of via) {
    if (typeof v === 'object' && v && v.url) {
      const g = ((v.url) || '').split('/').pop();
      if (g) ghsas.add(g);
    } else if (typeof v === 'string') {
      const sibling = vulnerabilities[v];
      const svia = sibling?.via || [];
      for (const s of svia) {
        if (s && s.url) {
          const g = s.url.split('/').pop();
          if (g) ghsas.add(g);
        }
      }
    }
  }
  const ghsaList = Array.from(ghsas);
  // Allow when every GHSA is known-allowlisted, OR when the advisory surfaces
  // without any GHSA id against a package-level allowlist entry (e.g. `prisma`
  // reporting GHSA-ggr8-5vv4-36mx with an empty via id — see check-deps.mjs).
  const allowed =
    (ghsaList.length > 0 && ghsaList.every((g) => isAllowlistedAdvisory(g))) ||
    (ghsaList.length === 0 && isAllowlistedPackage(name));
  (allowed ? allowlisted : blockers).push({
    name,
    severity: sev,
    ghsas: ghsaList,
    isDirect: info?.isDirect ?? false,
    range: info?.range || '',
  });
}

if (allowlisted.length) {
  console.log(
    '[deps] allowlisted next-bundled advisories (unfixable without breaking prod build):\n' +
      allowlisted
        .map((a) => `  - ${a.name} (${a.severity}) ${a.range} via ${a.ghsas.join(', ')}`)
        .join('\n')
  );
}

if (blockers.length) {
  console.error('[deps] BLOCKING high/critical advisories (fix before release):\n' +
    blockers.map((a) => `  - ${a.name} (${a.severity}) ${a.range} via ${a.ghsas.join(', ')}`).join('\n'));
  process.exit(1);
}

console.log(`[deps] OK — no un-allowlisted high/critical advisories (checked ${Object.keys(vulnerabilities).length} packages)`);
