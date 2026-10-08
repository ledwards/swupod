#!/usr/bin/env bash
# Regenerate src/data/duplicateStats.json (powers the Duplicates tab on /qa).
#
# Produces three numbers per set: Simulated (Monte Carlo over the live generator),
# Theoretical (variant-collision model), and Actual (real opened sealed pools from
# the DB), plus the shuffled-sealed simulation and the actual-vs-simulated verdict.
#
# Set list is derived from the set-config registry, so NEW SETS are picked up
# automatically — just re-run this after adding a set config.
#
# Usage:  npm run dupe-stats            (N=2000 per set)
#         npm run dupe-stats -- 4000    (custom sample size)
#
# DB for the Actual column: uses $DATABASE_URL if set, else falls back to the
# local dev DB in .env.local. Never reads the production .env. The Actual step is
# optional — if no DB is reachable the tab just shows Simulated + Theoretical.
set -euo pipefail
cd "$(dirname "$0")/.."

N="${1:-2000}"
echo "▶ Regenerating duplicate stats (N=$N per set)…"

SETS="$(npx tsx src/qa/duplicateAnalysis.ts 0 list)"
echo "  sets: $SETS"

echo "▶ Simulating (one process per set, in parallel)…"
for s in $SETS; do
  npx tsx src/qa/duplicateAnalysis.ts "$N" run "$s" > "/tmp/da_${s}.json" &
done
wait

echo "▶ Querying actual opened pools from the DB…"
npx tsx src/qa/duplicateAnalysis.ts "$N" actual || echo "  (no DB reachable — skipping Actual column)"

echo "▶ Merging → src/data/duplicateStats.json"
DA_DATE="$(date +%F)" npx tsx src/qa/duplicateAnalysis.ts "$N" build

echo "✓ Done. Rebuild/redeploy to publish the refreshed Duplicates tab on /qa."
