/**
 * CI dependency audit allowlist.
 *
 * The release gate fails on every HIGH or CRITICAL advisory. These sets stay
 * empty by default: upgrade or override the affected dependency instead of
 * hiding a finding. A future exception must be explicit, reviewed, and
 * documented with a narrowly scoped reason and removal condition.
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
