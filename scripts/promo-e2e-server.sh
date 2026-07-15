#!/usr/bin/env bash
# Boots the swupod server for the GC promo-packs e2e (started by playwright.promo.config.ts):
#   - Node 20 (server.ts requires it)
#   - PROMO_CLAIM_WINDOW_OVERRIDE=1 so the GC-weekend claim window is open year-round for tests
#   - POSTGRES_URL pointed at the working DATABASE_URL (migrate.ts/server read POSTGRES_URL, which
#     in some local .env files carries a stale password; DATABASE_URL is the source of truth)
#
# Needs a local Postgres with migration 078 applied and a local .env/.env.local (DATABASE_URL).
set -euo pipefail

PORT="${1:-3099}"
cd "$(dirname "$0")/.."

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use 20.20.2 >/dev/null 2>&1 || true

DB_URL="$(node -e "require('dotenv').config({path:'.env.local',quiet:true});require('dotenv').config({path:'.env',quiet:true});process.stdout.write(process.env.DATABASE_URL||'')" 2>/dev/null || true)"
export POSTGRES_URL="${DB_URL:-${POSTGRES_URL:-}}"
export PROMO_CLAIM_WINDOW_OVERRIDE=1
export PORT="$PORT"

exec npx tsx server.ts
