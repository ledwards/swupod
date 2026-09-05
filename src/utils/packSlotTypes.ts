/**
 * Position-based slot types for 16-card booster packs.
 *
 * Lives apart from `trackGeneration.ts` because that module opens a database pool
 * at import time. Backfill migrations and pure tracking helpers need the constant
 * without the connection, so it has a DB-free home here and is re-exported from
 * `trackGeneration.ts` for existing callers.
 *
 * Mapping a card's index within a pack to its slot avoids inference bugs where
 * e.g. UC3 upgrading to Rare gets misclassified as 'rare_legendary'.
 */
export type SlotType = 'leader' | 'base' | 'foil' | 'common' | 'uncommon' | 'rare_legendary' | 'unknown'

export const PACK_SLOT_TYPES: SlotType[] = [
  'leader',        // 0
  'base',          // 1
  'common',        // 2
  'common',        // 3
  'common',        // 4
  'common',        // 5
  'common',        // 6
  'common',        // 7
  'common',        // 8
  'common',        // 9
  'common',        // 10
  'uncommon',      // 11
  'uncommon',      // 12
  'uncommon',      // 13 (UC3 - stays uncommon even when upgraded)
  'rare_legendary', // 14
  'foil',          // 15
]
