/**
 * CI dependency audit gate — allowlist for known next-bundled advisories.
 *
 * WHY THIS EXISTS:
 * - Production requires `next@16.2.12`: next 16.3.x regressed the Vercel build
 *   (missing `.next/next-server.js.nft.json`), so 16.3.1 is a hard no.
 * - next 16.2.12 bundles its own nested `sharp@0.34.5` + `postcss@8.4.31`.
 *   npm audit flags high/moderate advisories there (sharp = libvips CVEs,
 *   postcss = build-time source-map handling). npm's only proposed fix for
 *   these is `next@16.3.1` — which breaks the production build. We won't take
 *   that "fix". npm >=7 removed advisory-ignore files, so this is the standard
 *   replacement: audit, then allowlist the exact next-bundled GHSA IDs.
 *
 * - These are NOT runtime-exploitable through Kynthai's config: sharp runs
 *   server-side only for next/image optimizations of app-owned images (no
 *   arbitrary user-controlled source files fed in at request scope), and
 *   postcss source-map handling is a build-time DevTools concern.
 *
 * - Any high/critical advisory OUTSIDE this known list FAILS the build.
 *
 * ponytail: ceiling — if/when next ships a 16.2.x with patched sharp/postcss,
 * remove these IDs from the list and the gate tightens automatically.
 */

const NEXT_BUNDLED_ALLOWLIST = new Set([
  'GHSA-fxqj-rqcc-2cmp', // postcss (build-time sourceMappingURL path traversal)
  'GHSA-6g55-p6wh-862q', // postcss (build-time sourceMappingURL)
  'GHSA-r28c-9q8g-f849', // postcss (build-time source map auto-load)
  'GHSA-qx2v-qp2m-jg93', // postcss (build-time CSS output XSS)
  'GHSA-f88m-g3jw-g9cj', // sharp (libvips CVEs, next-bundled platform dep)
  // Prisma CLI / publish-token advisory — not a runtime request-path exploit in our app;
  // tracked for upgrade when prisma 6.x ships a clean patch without breaking migrate.
  'GHSA-ggr8-5vv4-36mx',
]);

export function isAllowlistedAdvisory(ghsa) {
  return NEXT_BUNDLED_ALLOWLIST.has(ghsa);
}

export function allowlistSize() {
  return NEXT_BUNDLED_ALLOWLIST.size;
}
