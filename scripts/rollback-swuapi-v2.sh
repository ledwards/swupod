#!/usr/bin/env bash
# Roll back the swuapi v2 migration.
#
# Two rollback paths depending on how far the rollout got:
#
#   --fast   (default if Phase 2 enforcement was turned on)
#            Unsets SWUAPI_REQUIRE_AUTH in swuapi's Railway env.
#            Railway restarts swuapi; unauthenticated requests pass again.
#            No code change, no swupod deploy. Instant.
#            Use this if enforcement went live and something is breaking.
#
#   --full   Removes SWUAPI_API_KEY from swupod's Railway env AND reverts
#            the swuapi v2 code commits in swupod, then pushes.
#            Use this if you want to completely undo the migration.
#
# Usage:
#   ./scripts/rollback-swuapi-v2.sh --fast [--env production]
#   ./scripts/rollback-swuapi-v2.sh --full [--env production]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ENVIRONMENT="production"
MODE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --fast) MODE="fast"; shift ;;
    --full) MODE="full"; shift ;;
    --env)  ENVIRONMENT="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

if [ -z "$MODE" ]; then
  echo ""
  echo "⏪ swuapi v2 Rollback"
  echo "======================="
  echo ""
  echo "Choose a rollback mode:"
  echo ""
  echo "  --fast   Unset SWUAPI_REQUIRE_AUTH in swuapi (instant, no deploy)."
  echo "           Use this if auth enforcement went live and is causing 401s."
  echo "           swupod keeps its key; swuapi goes back to allowing all requests."
  echo ""
  echo "  --full   Remove SWUAPI_API_KEY from swupod + revert swuapi v2 code."
  echo "           Use this to completely undo the migration."
  echo ""
  printf "Mode (fast/full): "
  read -r MODE
fi

cd "$REPO_DIR"

# ── Fast rollback: unset SWUAPI_REQUIRE_AUTH in swuapi ──────────────────────

if [ "$MODE" == "fast" ]; then
  echo ""
  echo "⚡ Fast rollback: disabling auth enforcement in swuapi ($ENVIRONMENT)"
  echo "===================================================================="
  echo ""
  echo "This unsets SWUAPI_REQUIRE_AUTH in swuapi's Railway environment."
  echo "Railway restarts swuapi. Unauthenticated requests pass through again."
  echo "swupod code and Railway env are NOT changed."
  echo ""
  printf "Confirm fast rollback? (yes/no): "
  read -r confirm
  [ "$confirm" == "yes" ] || { echo "Cancelled."; exit 0; }

  echo ""
  echo "⚠️  This must be run in the swuapi project directory, not swupod."
  echo "   Run the following command:"
  echo ""
  echo "   cd /path/to/swuapi && railway variables delete SWUAPI_REQUIRE_AUTH -e $ENVIRONMENT"
  echo ""
  echo "Or unset it directly in the Railway dashboard for the swuapi service."
  echo ""
  echo -e "${GREEN}✅ Once done, swuapi will restart and unauthenticated requests will pass again.${NC}"
  echo ""
  echo "When you're ready to re-enforce, run:"
  echo "  ./scripts/deploy-swuapi-v2.sh --enforce --env $ENVIRONMENT"
  exit 0
fi

# ── Full rollback: revert swupod code + remove key from Railway ──────────────

if [ "$MODE" == "full" ]; then

  # swuapi v2 commits to revert — newest first (required by git revert)
  COMMITS=(
    "7a3603f"  # fix: use replaceAll for cardId separator normalization in deckImageApi
    "8e46c9b"  # fix: use replaceAll to normalize all underscores in collector_number
    "27b4032"  # feat: migrate ApiCard to snake_case fields and use uuid as primary card ID
    "7465b87"  # fix: throw on fetch errors, add max-page guard, exit non-zero on unhandled rejection
    "b598620"  # feat: migrate card fetch from /export/all to cursor-paginated /export/cards
    "6b8cd2b"  # refactor: rename SWUAPI_BASE_URL to SWUAPI_URL for consistency
    "2f9e740"  # feat: document SWUAPI_API_KEY in .env.example
    "ac9888f"  # feat: add SWUAPI_URL/SWUAPI_API_KEY env vars and auth headers for swuapi v2
  )

  echo ""
  echo "⏪ Full rollback: reverting swuapi v2 migration ($ENVIRONMENT)"
  echo "================================================================"
  echo ""
  echo "This will:"
  echo "  1. Remove SWUAPI_API_KEY from swupod Railway ($ENVIRONMENT)"
  echo "  2. Revert these commits on main:"
  for sha in "${COMMITS[@]}"; do
    msg=$(git log --oneline -1 "$sha" 2>/dev/null | sed 's/^[a-f0-9]* //' || echo "(not found)")
    echo "       $sha  $msg"
  done
  echo "  3. Push main (triggers swupod redeploy)"
  echo ""
  echo -e "${YELLOW}⚠️  Also do the fast rollback first if SWUAPI_REQUIRE_AUTH is set in swuapi:${NC}"
  echo "   cd /path/to/swuapi && railway variables delete SWUAPI_REQUIRE_AUTH -e $ENVIRONMENT"
  echo ""
  echo -e "${YELLOW}⚠️  This pushes a revert commit to origin/main, triggering a production deploy.${NC}"
  echo ""
  printf "Type 'rollback' to confirm: "
  read -r confirm
  [ "$confirm" == "rollback" ] || { echo "Cancelled."; exit 0; }

  # Pre-checks
  echo ""
  BRANCH=$(git branch --show-current)
  if [ "$BRANCH" != "main" ]; then
    echo -e "${RED}❌ Must be on main branch (currently: $BRANCH)${NC}"
    exit 1
  fi
  echo "✅ On main branch"

  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo -e "${RED}❌ Working tree has uncommitted changes. Commit or stash first.${NC}"
    git status --short
    exit 1
  fi
  echo "✅ Working tree clean"

  if ! command -v railway &>/dev/null; then
    echo -e "${RED}❌ Railway CLI not found.${NC}"; exit 1
  fi
  if ! railway whoami &>/dev/null 2>&1; then
    echo -e "${RED}❌ Not logged in to Railway. Run: railway login${NC}"; exit 1
  fi
  echo "✅ Railway CLI ready"

  echo "🔍 Verifying commits exist in this repo..."
  for sha in "${COMMITS[@]}"; do
    if ! git cat-file -e "${sha}^{commit}" 2>/dev/null; then
      echo -e "${RED}❌ Commit $sha not found — rollback script may be stale.${NC}"
      echo "   Check git log and update the COMMITS array in this script."
      exit 1
    fi
  done
  echo "✅ All commits found"

  # Remove env vars from swupod Railway
  echo ""
  echo "🗑️  Removing SWUAPI_API_KEY from swupod Railway ($ENVIRONMENT)..."
  if railway variables delete SWUAPI_API_KEY -e "$ENVIRONMENT" 2>/dev/null; then
    echo "✅ SWUAPI_API_KEY removed"
  else
    echo -e "${YELLOW}⚠️  SWUAPI_API_KEY not found in Railway ($ENVIRONMENT) — already unset${NC}"
  fi

  EXISTING_URL=$(railway variables -e "$ENVIRONMENT" --json 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('SWUAPI_URL',''))" 2>/dev/null || echo "")
  if [ -n "$EXISTING_URL" ]; then
    echo "🗑️  Removing SWUAPI_URL override from swupod Railway ($ENVIRONMENT)..."
    railway variables delete SWUAPI_URL -e "$ENVIRONMENT" 2>/dev/null && echo "✅ SWUAPI_URL removed" || true
  fi

  # Revert commits
  echo ""
  echo "⏪ Reverting swuapi v2 commits..."
  git revert --no-commit "${COMMITS[@]}"
  git commit -m "revert: roll back swuapi v2 migration

Reverts the following commits:
$(for sha in "${COMMITS[@]}"; do
  git log --oneline -1 "$sha" 2>/dev/null | sed 's/^/  /'
done)

Reason: swuapi v2 rollback — swupod reverts to unauthenticated /export/all."
  echo "✅ Revert commit created: $(git log --oneline -1)"

  # Push
  echo ""
  echo "🚀 Pushing to origin/main (triggers swupod redeploy)..."
  git push origin main
  echo "✅ Pushed"

  echo ""
  echo -e "${GREEN}✅ Full rollback complete.${NC}"
  echo ""
  echo "swupod is reverting to pre-v2 code. Railway is redeploying."
  echo ""
  echo "If SWUAPI_REQUIRE_AUTH is still set in swuapi, remove it:"
  echo "  cd /path/to/swuapi && railway variables delete SWUAPI_REQUIRE_AUTH -e $ENVIRONMENT"
  echo ""
  echo "To revoke the API key in swuapi:"
  echo "  node scripts/revoke-api-key.js swupod-production  (on swuapi host)"
  exit 0
fi

echo -e "${RED}❌ Unknown mode: $MODE. Use --fast or --full.${NC}"
exit 1
