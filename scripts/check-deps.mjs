/**
 * CI dependency audit allowlist.
 *
 * Keep this list deliberately narrow. The release gate fails on every HIGH or
 * CRITICAL advisory except these five IDs, which are currently surfaced by
 * Next 16.2.12's bundled postcss/sharp dependency tree. PostCSS is build-time
 * tooling and sharp is server-side image processing; neither is exposed as a
 * direct application feature.
 *
 * Next 16.3.4 was tested, but its clean Vercel preview failed in the platform
 * post-build step because `.next/next-server.js.nft.json` was missing. Keep
 * the compatible Next release until a Vercel-compatible upgrade is verified.
 * Remove these exceptions when that upgrade or a safe upstream dependency
 * resolution is available. Any other advisory, and every package-level
 * fallback, must block the release.
 */

const ADVISORY_ALLOWLIST = new Set([
  'GHSA-fxqj-rqcc-2cmp',
  'GHSA-6g55-p6wh-862q',
  'GHSA-r28c-9q8g-f849',
  'GHSA-qx2v-qp2m-jg93',
  'GHSA-f88m-g3jw-g9cj',
]);
const PACKAGE_ALLOWLIST = new Set();

export function isAllowlistedPackage(name) {
  return PACKAGE_ALLOWLIST.has(name);
}

export function isAllowlistedAdvisory(ghsa) {
  return ADVISORY_ALLOWLIST.has(ghsa);
}

export function allowlistSize() {
  return ADVISORY_ALLOWLIST.size;
}
