/**
 * Position-based slot types for 16-card booster packs.
 *
 * Lives apart from `trackGeneration.ts` because that module opens a database pool
 * at import time. Backfill migrations and pure tracking helpers need the constant
 * without the connection, so it has a DB-free home here and is re-exported from
 * `trackGeneration.ts` for existing callers.
 *
 * Icons 2027 Edition prints a 9-card pack with no leader or base slot, and LAW+
 * (Set 7+) prints its 16 cards in a different physical order, so each has its own
 * map — see `slotTypeForPackCard`, which every tracking site uses.
 *
 * Mapping a card's index within a pack to its slot avoids inference bugs where
 * e.g. UC3 upgrading to Rare gets misclassified as 'rare_legendary'.
 */
import { getSetConfig, hasLeaderSlot } from './setConfigs'

export type SlotType = 'leader' | 'base' | 'foil' | 'common' | 'uncommon' | 'rare_legendary' | 'unknown'

/** Sets 1-6 order (and the fallback when a card's set is unknown). */
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

/**
 * Position-based slot types for LAW+ (Set 7+) packs, in `generateBoosterPack` order,
 * which matches the physical pack order from real ASH boxes: the Hyperspace Foil
 * follows the commons and the R/L closes the pack. Selected by the same per-set flag
 * that switches generation to this order, `packRules.foilSlotIsHyperspaceFoil`.
 */
export const LAW_PLUS_PACK_SLOT_TYPES: SlotType[] = [
  'leader',         // 0
  'base',           // 1
  'common',         // 2
  'common',         // 3
  'common',         // 4
  'common',         // 5
  'common',         // 6 (guaranteed hyperspace common)
  'common',         // 7
  'common',         // 8
  'common',         // 9
  'common',         // 10
  'foil',           // 11 (hyperspace foil)
  'uncommon',       // 12
  'uncommon',       // 13
  'uncommon',       // 14 (UC3 - stays uncommon even when upgraded)
  'rare_legendary', // 15
]

/**
 * Position-based slot types for the 9-card Icons pack (`packLayout: 'icons9'`),
 * in `generateIconsBoosterPack` order. Index 3 is the shared leader/common slot:
 * the card came off the leader sheet or a common sheet, and the card itself says
 * which, so it is resolved per card in `slotTypeForPackCard`.
 */
export const ICONS_PACK_SLOT_TYPES: (SlotType | 'leader_or_common')[] = [
  'common',           // 0
  'common',           // 1
  'common',           // 2
  'leader_or_common', // 3 (leader about 1 pack in 4, otherwise a common)
  'common',           // 4 (guaranteed hyperspace common)
  'uncommon',         // 5 (UC1)
  'uncommon',         // 6 (UC2 - stays uncommon even when upgraded)
  'rare_legendary',   // 7
  'foil',             // 8 (hyperspace foil)
]

/**
 * The slot a card was printed in, from its index within its pack and the pack's
 * layout. Every card in a pack shares one set, so the card's own set picks the map.
 *
 * `packSetCode` is the set the pack was opened as, when the caller knows it. A
 * Carbonite pack (`ASH-CB`) holds ordinary `ASH` cards in its own tiered layout,
 * which neither 16-card map describes; it keeps the Sets 1-6 map it has always been
 * tracked with rather than being relabelled.
 */
export function slotTypeForPackCard(cardValue: unknown, cardIndex: number, packSetCode?: unknown): SlotType | null {
  // Stored cards are loosely typed; only `set` and `isLeader` are read.
  const card = (cardValue ?? {}) as { set?: unknown; isLeader?: unknown }
  if (typeof card.set === 'string' && card.set && !hasLeaderSlot(card.set)) {
    const slot = ICONS_PACK_SLOT_TYPES[cardIndex]
    if (slot === 'leader_or_common') return card.isLeader === true ? 'leader' : 'common'
    return slot ?? null
  }
  const isCarbonitePack = typeof packSetCode === 'string' && packSetCode.endsWith('-CB')
  if (!isCarbonitePack && typeof card.set === 'string' && getSetConfig(card.set)?.packRules?.foilSlotIsHyperspaceFoil === true) {
    return LAW_PLUS_PACK_SLOT_TYPES[cardIndex] ?? null
  }
  return PACK_SLOT_TYPES[cardIndex] ?? null
}
