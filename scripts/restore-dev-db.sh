#!/bin/bash
# Restore dev database from a backup
# Usage: ./scripts/restore-dev-db.sh [backup_file]
#
# If no backup file specified, lists available backups

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/../.backups"

# Load local env to get dev database URL
source .env 2>/dev/null || source .env.local 2>/dev/null || true

if [ -z "$POSTGRES_URL" ]; then
  echo "❌ POSTGRES_URL not set. Make sure .env or .env.local exists with your dev database URL."
  exit 1
fi

# If no argument, list available backups
if [ -z "$1" ]; then
  echo "Available backups:"
  echo ""
  if [ -d "$BACKUP_DIR" ] && [ "$(ls -A $BACKUP_DIR 2>/dev/null)" ]; then
    ls -lh "$BACKUP_DIR"/*.sql 2>/dev/null | awk '{print "  " $NF " (" $5 ")"}'
    echo ""
    echo "Usage: ./scripts/restore-dev-db.sh <backup_file>"
    echo ""
    echo "Example:"
    LATEST=$(ls -t "$BACKUP_DIR"/*.sql 2>/dev/null | head -1)
    if [ -n "$LATEST" ]; then
      echo "  ./scripts/restore-dev-db.sh $LATEST"
    fi
  else
    echo "  No backups found in $BACKUP_DIR"
  fi
  exit 0
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "⚠️  This will OVERWRITE your local dev database with the backup."
echo "   Backup: $BACKUP_FILE"
read -p "Are you sure? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "Cancelled."
  exit 0
fi

echo ""
echo "📤 Restoring from backup..."
psql "$POSTGRES_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>/dev/null || true
psql "$POSTGRES_URL" < "$BACKUP_FILE"

echo ""
# Same reasoning as the clone scripts: the restore continues past errors, so
# verify what actually landed. --fix repairs sequences only, deletes nothing.
echo "🔍 Verifying the restored database..."
TARGET_DATABASE_URL="$POSTGRES_URL" npx tsx "$(dirname "$0")/verifyDevDb.ts" --fix || true

echo ""
echo "✅ Done! Dev database restored from backup."
