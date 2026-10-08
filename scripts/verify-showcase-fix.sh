#!/bin/bash
# Verify showcase attribution fix
# Usage: ./scripts/verify-showcase-fix.sh [before|after]
#
# Run with "before" after cloning prod, then run migration, then run with "after"

set -e

# Load local env
source .env 2>/dev/null || source .env.local 2>/dev/null || true

if [ -z "$POSTGRES_URL" ]; then
  echo "❌ POSTGRES_URL not set."
  exit 1
fi

MODE="${1:-check}"

echo "=========================================="
echo "Showcase Attribution Verification ($MODE)"
echo "=========================================="
echo ""

# Get user IDs for our test users
echo "📋 Looking up test users..."
TERRONK_ID=$(psql "$POSTGRES_URL" -t -c "SELECT id FROM users WHERE username = 'terronk'" | tr -d ' \n')
TSKI_ID=$(psql "$POSTGRES_URL" -t -c "SELECT id FROM users WHERE username ILIKE '%tski8825%'" | tr -d ' \n')

echo "   terronk user_id: $TERRONK_ID"
echo "   tski8825 user_id: $TSKI_ID"
echo ""

# Count showcases with NULL user_id
echo "📊 Showcase leaders with NULL user_id:"
NULL_COUNT=$(psql "$POSTGRES_URL" -t -c "
  SELECT COUNT(*) FROM card_generations
  WHERE treatment = 'showcase'
    AND card_type = 'Leader'
    AND user_id IS NULL
" | tr -d ' \n')
echo "   Count: $NULL_COUNT"
echo ""

# List them
echo "   Details:"
psql "$POSTGRES_URL" -c "
  SELECT card_name, source_type, source_share_id
  FROM card_generations
  WHERE treatment = 'showcase'
    AND card_type = 'Leader'
    AND user_id IS NULL
  ORDER BY generated_at
"
echo ""

# Check terronk's showcases
echo "📊 terronk's showcase leaders:"
TERRONK_COUNT=$(psql "$POSTGRES_URL" -t -c "
  SELECT COUNT(*) FROM card_generations
  WHERE treatment = 'showcase'
    AND card_type = 'Leader'
    AND user_id = '$TERRONK_ID'
" | tr -d ' \n')
echo "   Count: $TERRONK_COUNT"
psql "$POSTGRES_URL" -c "
  SELECT card_name, source_type, source_share_id
  FROM card_generations
  WHERE treatment = 'showcase'
    AND card_type = 'Leader'
    AND user_id = '$TERRONK_ID'
"
echo ""

# Check DJ specifically (terronk's missing showcase)
echo "📊 DJ from draft lgcw3Jxc (terronk's missing showcase):"
psql "$POSTGRES_URL" -c "
  SELECT card_name, user_id, source_type, source_share_id,
         CASE WHEN user_id = '$TERRONK_ID' THEN '✅ CORRECT'
              WHEN user_id IS NULL THEN '❌ NULL'
              ELSE '❌ WRONG USER' END as status
  FROM card_generations
  WHERE card_name = 'DJ'
    AND source_share_id = 'lgcw3Jxc'
"
echo ""

# Check tski8825's showcases
echo "📊 tski8825's showcase leaders:"
TSKI_COUNT=$(psql "$POSTGRES_URL" -t -c "
  SELECT COUNT(*) FROM card_generations
  WHERE treatment = 'showcase'
    AND card_type = 'Leader'
    AND user_id = '$TSKI_ID'
" | tr -d ' \n')
echo "   Count: $TSKI_COUNT"
psql "$POSTGRES_URL" -c "
  SELECT card_name, source_type, source_share_id
  FROM card_generations
  WHERE treatment = 'showcase'
    AND card_type = 'Leader'
    AND user_id = '$TSKI_ID'
"
echo ""

# Summary
echo "=========================================="
echo "SUMMARY"
echo "=========================================="
echo "  NULL user_id showcases: $NULL_COUNT"
echo "  terronk showcases:      $TERRONK_COUNT"
echo "  tski8825 showcases:     $TSKI_COUNT"
echo ""

if [ "$MODE" = "before" ]; then
  echo "Expected BEFORE fix:"
  echo "  - NULL count should be ~11"
  echo "  - terronk should have 2 (Mon Mothmas), missing DJ"
  echo "  - tski8825 should have 1 (Sly Moore), missing another"
elif [ "$MODE" = "after" ]; then
  echo "Expected AFTER fix:"
  echo "  - NULL count should be 0 (or near 0)"
  echo "  - terronk should have 3+ (including DJ)"
  echo "  - tski8825 should have 2+"
fi
echo ""
