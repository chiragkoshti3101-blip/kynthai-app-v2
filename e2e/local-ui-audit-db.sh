#!/usr/bin/env bash
# Local-only UI audit database bootstrap (never run against production).
# Requires: PostgreSQL reachable at DATABASE_URL (see docker-compose db or local install).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "${NODE_ENV:-}" == "production" ]]; then
  echo "Refusing: NODE_ENV=production" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f .env.local ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env.local
    set +a
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL or create .env.local (see .env.example)" >&2
  exit 1
fi

if [[ -z "${SESSION_SIGNING_SECRET:-}" ]] || [[ -z "${SESSION_SECRET:-}" ]]; then
  echo "Portal login requires SESSION_SECRET and SESSION_SIGNING_SECRET in .env.local" >&2
  exit 1
fi

echo "→ prisma db push (local schema sync)"
npx prisma db push

echo "→ prisma/seed.js (demo users Demo@2024)"
NODE_ENV=development node prisma/seed.js

echo "Done. Demo logins: patient@demo.kynthai.app / Demo@2024 (see prisma/seed.js)"
