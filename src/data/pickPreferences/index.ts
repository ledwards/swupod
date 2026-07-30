/**
 * Per-set pick-preference aggregates — the single registry of sets whose tier
 * grades come from draft pick behavior (Bradley-Terry cards + Plackett-Luce
 * leaders) instead of win rates.
 *
 * Regenerate a set from prod (read-only; aggregate stats, no player data):
 *   DATABASE_URL=<prod> npx tsx scripts/analyze-pick-preferences.ts --set=ASH \
 *     --emit-stats=src/data/pickPreferences/ASH.json
 *
 * Sets without a file here keep the legacy win-rate grading — adding a set is
 * a deliberate per-set decision, per the architecture rules.
 */

import type { PickPreferenceSetStats } from '@/src/services/pickPreferenceGrades'
import ASH from './ASH.json'

export const PICK_PREFERENCE_STATS: Record<string, PickPreferenceSetStats> = {
  ASH: ASH as PickPreferenceSetStats,
}

export function pickPreferenceStatsForSet(setCode: string | null | undefined): PickPreferenceSetStats | null {
  if (!setCode) return null
  return PICK_PREFERENCE_STATS[setCode] || null
}
