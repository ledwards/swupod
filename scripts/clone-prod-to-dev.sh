#!/bin/bash
# Clone production database to development (both on Railway)
# Usage: ./scripts/clone-prod-to-dev.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/../.backups"
mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/dev_backup_$(date +%Y%m%d_%H%M%S).sql"
PROD_DUMP_FILE="/tmp/swupod_prod_dump.sql"

# Allow skipping confirmation with --yes flag
if [[ "$1" != "--yes" && "$1" != "-y" ]]; then
  echo "⚠️  This will OVERWRITE your dev database with prod data."
  printf "Are you sure? (yes/no): "
  read -r confirm
  confirm=$(echo "$confirm" | tr -d '\r\n')
  if [ "$confirm" != "yes" ]; then
    echo "Cancelled."
    exit 0
  fi
fi

echo ""
echo "📋 This script requires public database URLs from Railway."
echo "   If you haven't enabled public networking:"
echo "   1. Go to Railway dashboard"
echo "   2. Select your Postgres service"
echo "   3. Go to Settings > Networking > Public Networking"
echo "   4. Enable it for both dev and prod environments"
echo ""

# Try to get DATABASE_URL from Railway (public URL)
echo "🔍 Getting database URLs from Railway..."

# Get prod URL
PROD_DB_URL=$(railway variables -e production --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('DATABASE_PUBLIC_URL') or d.get('DATABASE_URL') or d.get('POSTGRES_URL') or '')" 2>/dev/null || echo "")

# Get dev URL
DEV_DB_URL=$(railway variables -e development --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('DATABASE_PUBLIC_URL') or d.get('DATABASE_URL') or d.get('POSTGRES_URL') or '')" 2>/dev/null || echo "")

# Check for internal URLs
if [[ "$PROD_DB_URL" == *".railway.internal"* ]] || [[ "$DEV_DB_URL" == *".railway.internal"* ]]; then
  echo ""
  echo "❌ Got internal Railway URLs which won't work from your local machine."
  echo ""
  echo "Option 1: Enable public networking in Railway dashboard (recommended)"
  echo "Option 2: Set DATABASE_PUBLIC_URL in each environment"
  echo "Option 3: Use the manual method below"
  echo ""
  echo "Manual method using Railway proxy:"
  echo "  # Terminal 1 - proxy to prod:"
  echo "  railway connect postgres -e production"
  echo ""
  echo "  # Terminal 2 - dump prod (replace PORT with the one shown):"
  echo "  pg_dump 'postgresql://postgres:YOUR_PASS@localhost:PORT/railway' > /tmp/prod.sql"
  echo ""
  echo "  # Terminal 3 - proxy to dev:"
  echo "  railway connect postgres -e development"
  echo ""
  echo "  # Terminal 4 - restore to dev:"
  echo "  psql 'postgresql://postgres:YOUR_PASS@localhost:PORT/railway' < /tmp/prod.sql"
  exit 1
fi

if [ -z "$PROD_DB_URL" ] || [ -z "$DEV_DB_URL" ]; then
  echo "❌ Could not get database URLs from Railway."
  echo "   PROD_DB_URL: ${PROD_DB_URL:-(empty)}"
  echo "   DEV_DB_URL: ${DEV_DB_URL:-(empty)}"
  echo ""
  echo "   Make sure you're logged in: railway login"
  echo "   And linked to the project: railway link"
  exit 1
fi

echo "   ✅ Got prod URL: ${PROD_DB_URL:0:50}..."
echo "   ✅ Got dev URL: ${DEV_DB_URL:0:50}..."

echo ""
echo "💾 Backing up current dev database..."
pg_dump --no-owner --no-acl "$DEV_DB_URL" > "$BACKUP_FILE"
echo "   ✅ Saved: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

echo ""
echo "📥 Dumping production database..."
pg_dump --no-owner --no-acl "$PROD_DB_URL" > "$PROD_DUMP_FILE"
echo "   ✅ Saved: $PROD_DUMP_FILE ($(du -h "$PROD_DUMP_FILE" | cut -f1))"

echo ""
echo "📤 Restoring to dev database..."
psql "$DEV_DB_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>/dev/null || true
psql "$DEV_DB_URL" < "$PROD_DUMP_FILE"

echo ""
# The restore above continues past errors and loads with triggers disabled, so a
# partially-failed restore can leave orphans and stale sequences behind while
# still looking successful. Always verify; --fix repairs sequences only.
echo "🔍 Verifying the restored database..."
TARGET_DATABASE_URL="$DEV_DB_URL" npx tsx "$(dirname "$0")/verifyDevDb.ts" --fix || true

echo ""
echo "✅ Done! Your dev database now mirrors production."
echo ""
echo "To restore your original dev database later:"
echo "  ./scripts/restore-dev-db.sh .backups/$(basename $BACKUP_FILE)"
