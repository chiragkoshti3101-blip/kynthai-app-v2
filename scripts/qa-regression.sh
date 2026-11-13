#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

: "${ENCRYPTION_KEY:?ENCRYPTION_KEY required in .env.local for QA}"
: "${DATABASE_URL:?DATABASE_URL required for QA}"

echo "=== QA regression: typecheck ==="
npm run typecheck

echo "=== QA regression: lint ==="
npm run lint

echo "=== QA regression: vitest ==="
npm run test:ci

echo "=== QA regression: build ==="
npm run build

export QA_LOCAL_DB=1
export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://localhost:3000}"

echo "=== QA regression: playwright (core + QA suites) ==="
npx playwright test \
  e2e/ci-smoke.spec.ts \
  e2e/auth.spec.ts \
  e2e/scenarios-matrix.spec.ts \
  e2e/qa-stripe.spec.ts \
  e2e/qa-routes-navigation.spec.ts \
  e2e/qa-auth-recovery.spec.ts \
  --project=chromium-desktop \
  --workers=1

if curl -sf "${PLAYWRIGHT_BASE_URL}/api/health" >/dev/null 2>&1; then
  echo "=== QA regression: API route probe ==="
  PROBE_URL="${PLAYWRIGHT_BASE_URL}" node scripts/qa-api-routes.mjs
else
  echo "SKIP qa-api-routes.mjs — server not running (run playwright with webServer or npm start)"
fi

echo "=== QA regression complete ==="
