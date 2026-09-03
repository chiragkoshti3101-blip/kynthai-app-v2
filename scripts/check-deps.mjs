/**
 * CI dependency audit allowlist.
 *
 * The current dependency graph is clean at HIGH/CRITICAL severity, so no
 * advisory exception is needed. Keep both sets empty: any future finding
 * must be upgraded, overridden, or explicitly fixed before release.
 */

const ADVISORY_ALLOWLIST = new Set();
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
