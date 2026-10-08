#!/usr/bin/env bash
# Two-phase swuapi v2 rollout.
#
# Phase 1 — soft launch (run this script):
#   - swuapi v2 is deployed WITHOUT SWUAPI_REQUIRE_AUTH, so unauthenticated
#     requests still pass through. Safe to run before clients have keys.
#   - Creates/validates the API key and sets it in swupod's Railway env.
#   - Deploys swupod so it starts sending the key on every request.
#   - Lets you verify in production that the key is working (check
#     api_keys.last_used_at in swuapi's DB) before locking the door.
#
# Phase 2 — enforce (run this script with --enforce, or do it manually):
#   - Sets SWUAPI_REQUIRE_AUTH=true in swuapi's Railway env.
#   - Railway restarts swuapi; requests without a valid key now get 401.
#   - No code deploy needed — config change only.
#
# Rollback: ./scripts/rollback-swuapi-v2.sh
#   Fast path: unsets SWUAPI_REQUIRE_AUTH in swuapi (instant, no deploy).
#   Full path:  also reverts swupod code and removes key from Railway.
#
# Usage:
#   ./scripts/deploy-swuapi-v2.sh                  # Phase 1
#   ./scripts/deploy-swuapi-v2.sh --enforce         # Phase 2 only
#   ./scripts/deploy-swuapi-v2.sh --api-key KEY     # skip prompt
#   ./scripts/deploy-swuapi-v2.sh --url URL         # non-default swuapi URL
#   ./scripts/deploy-swuapi-v2.sh --env staging

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ENVIRONMENT="production"
API_KEY=""
SWUAPI_URL_OVERRIDE=""
ENFORCE_ONLY=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --api-key)  API_KEY="$2"; shift 2 ;;
    --url)      SWUAPI_URL_OVERRIDE="$2"; shift 2 ;;
    --env)      ENVIRONMENT="$2"; shift 2 ;;
    --enforce)  ENFORCE_ONLY=true; shift ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

cd "$REPO_DIR"

# ── Shared pre-checks ────────────────────────────────────────────────────────

if ! command -v railway &>/dev/null; then
  echo -e "${RED}❌ Railway CLI not found. Install: npm install -g @railway/cli${NC}"
  exit 1
fi
if ! railway whoami &>/dev/null 2>&1; then
  echo -e "${RED}❌ Not logged in to Railway. Run: railway login${NC}"
  exit 1
fi

# ── Phase 2: enforce auth ────────────────────────────────────────────────────

if $ENFORCE_ONLY; then
  echo ""
  echo "🔒 Phase 2: Enforcing swuapi auth ($ENVIRONMENT)"
  echo "=================================================="
  echo ""
  echo "This sets SWUAPI_REQUIRE_AUTH=true in swuapi's Railway environment."
  echo "Railway will restart swuapi. Requests without a valid key will get 401."
  echo ""
  echo "Before doing this, confirm swupod is successfully sending the key:"
  echo "  SELECT consumer_name, last_used_at FROM api_keys ORDER BY last_used_at DESC LIMIT 5;"
  echo ""
  printf "Ready to enforce? (yes/no): "
  read -r confirm
  [ "$confirm" == "yes" ] || { echo "Cancelled."; exit 0; }

  echo ""
  echo "📦 Setting SWUAPI_REQUIRE_AUTH=true in swuapi Railway ($ENVIRONMENT)..."
  echo "   (Run this against the swuapi Railway service, not swupod)"
  echo ""
  echo "   railway variables set SWUAPI_REQUIRE_AUTH=true -e $ENVIRONMENT"
  echo "   (in the swuapi project directory)"
  echo ""
  echo "Or set it directly in the Railway dashboard for the swuapi service."
  echo ""
  echo -e "${GREEN}✅ Done. Monitor swuapi logs for any 401s from unexpected clients.${NC}"
  echo ""
  echo "To roll back enforcement instantly (no deploy needed):"
  echo "  railway variables delete SWUAPI_REQUIRE_AUTH -e $ENVIRONMENT  (in swuapi dir)"
  exit 0
fi

# ── Phase 1: soft launch ─────────────────────────────────────────────────────

echo ""
echo "🚀 Phase 1: swuapi v2 soft launch ($ENVIRONMENT)"
echo "=================================================="
echo ""

BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo -e "${RED}❌ Must be on main branch (currently: $BRANCH)${NC}"
  exit 1
fi
echo "✅ Railway CLI ready ($(railway whoami 2>/dev/null))"
echo "✅ On main branch"

# ── Resolve SWUAPI_URL ────────────────────────────────────────────────────────

if [ -n "$SWUAPI_URL_OVERRIDE" ]; then
  SWUAPI_URL="$SWUAPI_URL_OVERRIDE"
  echo "ℹ️  Using --url: $SWUAPI_URL"
else
  SWUAPI_URL=$(railway variables -e "$ENVIRONMENT" --json 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('SWUAPI_URL',''))" 2>/dev/null || echo "")
  if [ -z "$SWUAPI_URL" ]; then
    SWUAPI_URL="https://api.swuapi.com"
    echo "ℹ️  SWUAPI_URL not set in Railway — using default: $SWUAPI_URL"
  else
    echo "ℹ️  SWUAPI_URL from Railway: $SWUAPI_URL"
  fi
fi

# ── Verify swuapi v2 is up ────────────────────────────────────────────────────

echo ""
echo "🔍 Checking swuapi health..."
HEALTH_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${SWUAPI_URL}/health" 2>/dev/null || echo "000")
if [ "$HEALTH_HTTP" != "200" ]; then
  echo -e "${RED}❌ ${SWUAPI_URL}/health returned HTTP $HEALTH_HTTP — is swuapi v2 deployed?${NC}"
  exit 1
fi
echo "✅ /health → 200"

# Verify /export/cards is accessible (auth not yet enforced — should be 200)
echo "🔍 Checking /export/cards is reachable (auth not enforced yet)..."
EXPORT_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${SWUAPI_URL}/export/cards" 2>/dev/null || echo "000")
if [ "$EXPORT_HTTP" == "401" ]; then
  echo -e "${YELLOW}⚠️  /export/cards returned 401 — auth is already enforced.${NC}"
  echo "   If you haven't set SWUAPI_API_KEY in swupod yet, this is a problem."
  printf "Continue anyway? (yes/no): "
  read -r confirm
  [ "$confirm" == "yes" ] || { echo "Cancelled."; exit 0; }
elif [ "$EXPORT_HTTP" != "200" ]; then
  echo -e "${RED}❌ /export/cards returned HTTP $EXPORT_HTTP — something is wrong.${NC}"
  exit 1
else
  echo "✅ /export/cards → 200 (auth not yet enforced — good for phase 1)"
fi

# ── Get and validate the API key ─────────────────────────────────────────────

if [ -z "$API_KEY" ]; then
  echo ""
  echo "🔑 Enter the API key created on the swuapi host."
  echo "   If you haven't created one yet, run on the swuapi server:"
  echo "     node scripts/create-api-key.js swupod-production"
  echo ""
  printf "Paste key (swuapi_...): "
  read -rs API_KEY
  echo ""
fi
[ -n "$API_KEY" ] || { echo -e "${RED}❌ No API key provided.${NC}"; exit 1; }

echo ""
echo "🔍 Testing API key against ${SWUAPI_URL}/export/cards..."
KEY_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  "${SWUAPI_URL}/export/cards" 2>/dev/null || echo "000")
case "$KEY_HTTP" in
  200) echo "✅ Key accepted (200)" ;;
  401) echo -e "${RED}❌ Key rejected (401) — check the key is correct.${NC}"; exit 1 ;;
  *)   echo -e "${RED}❌ Unexpected HTTP $KEY_HTTP.${NC}"; exit 1 ;;
esac

# ── Set key in swupod's Railway env ──────────────────────────────────────────

echo ""
echo "📦 Setting SWUAPI_API_KEY in swupod Railway ($ENVIRONMENT)..."
railway variables set "SWUAPI_API_KEY=$API_KEY" -e "$ENVIRONMENT"
echo "✅ SWUAPI_API_KEY set"

if [ -n "$SWUAPI_URL_OVERRIDE" ] && [ "$SWUAPI_URL_OVERRIDE" != "https://api.swuapi.com" ]; then
  echo "📦 Setting SWUAPI_URL=$SWUAPI_URL in swupod Railway ($ENVIRONMENT)..."
  railway variables set "SWUAPI_URL=$SWUAPI_URL" -e "$ENVIRONMENT"
  echo "✅ SWUAPI_URL set"
fi

# ── Push swupod to trigger redeploy ──────────────────────────────────────────

echo ""
echo "The env var is set. Railway deploys swupod on push to main."
printf "Push main to origin now? (yes/no): "
read -r do_push
if [ "$do_push" == "yes" ]; then
  git push origin main
  echo "✅ Pushed — swupod redeploy triggered"
else
  echo "ℹ️  Skipped push. Run 'git push origin main' when ready."
fi

echo ""
echo -e "${GREEN}✅ Phase 1 complete.${NC}"
echo ""
echo "Next steps:"
echo "  1. Wait for swupod to redeploy and stabilize"
echo "  2. Confirm the key is being used (in swuapi DB):"
echo "       SELECT consumer_name, last_used_at FROM api_keys ORDER BY last_used_at DESC LIMIT 5;"
echo "  3. When confident, enforce auth in swuapi (Phase 2):"
echo "       ./scripts/deploy-swuapi-v2.sh --enforce --env $ENVIRONMENT"
echo ""
echo "To roll back:"
echo "  ./scripts/rollback-swuapi-v2.sh --env $ENVIRONMENT"
