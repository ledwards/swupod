/**
 * Position-based slot types for 16-card booster packs.
 *
 * Lives apart from `trackGeneration.ts` because that module opens a database pool
 * at import time. Backfill migrations and pure tracking helpers need the constant
 * without the connection, so it has a DB-free home here and is re-exported from
 * `trackGeneration.ts` for existing callers.
 *
 * Icons 2027 Edition prints a 9-card pack with no leader or base slot, LAW+ (Set 7+)
 * prints its 16 cards in a different physical order, and Carbonite prints its own
 * all-variant layouts, so each has its own map — see `slotTypeForPackCard`, which
 * every tracking site uses.
 *
 * Mapping a card's index within a pack to its slot avoids inference bugs where
 * e.g. UC3 upgrading to Rare gets misclassified as 'rare_legendary'.
 */
import { getSetConfig, hasLeaderSlot } from './setConfigs'

/**
 * Carbonite slots. A Carbonite pack is a different product from a standard booster
 * (no base, every card a variant), so its slots never share a standard label: the
 * pack-quality and generation stats measure standard collation and leave these out.
 */
export type CarboniteSlotType =
  | 'carbonite_leader' | 'carbonite_prestige'
  | 'carbonite_foil_common' | 'carbonite_foil_uncommon' | 'carbonite_foil_rare_legendary'
  | 'carbonite_hs_common' | 'carbonite_hs_uncommon' | 'carbonite_hs_rare_legendary'
  | 'carbonite_hs_flex' | 'carbonite_hs_top' | 'carbonite_hs'
  | 'carbonite_hsf_flex' | 'carbonite_hsf_common' | 'carbonite_hsf_top' | 'carbonite_hsf'

export type SlotType = 'leader' | 'base' | 'foil' | 'common' | 'uncommon' | 'rare_legendary' | 'unknown' | CarboniteSlotType

/** Every Carbonite slot label starts with this, so SQL can exclude them with one LIKE. */
export const CARBONITE_SLOT_PREFIX = 'carbonite_'

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
 * Carbonite layouts, in `generateCarboniteBoosterPack` order. Which one a pack uses
 * follows the generator: ASH has its own calibrated layout, other tiered sets
 * (`packRules.carboniteTiered`) use the LAW layout, and earlier sets the pre-LAW one.
 */
export const CARBONITE_PRE_LAW_SLOT_TYPES: CarboniteSlotType[] = [
  'carbonite_leader',              // 0 (hyperspace, or showcase)
  'carbonite_foil_common',         // 1
  'carbonite_foil_common',         // 2
  'carbonite_foil_common',         // 3
  'carbonite_foil_common',         // 4
  'carbonite_foil_uncommon',       // 5
  'carbonite_foil_uncommon',       // 6
  'carbonite_foil_rare_legendary', // 7
  'carbonite_prestige',            // 8
  'carbonite_hs_common',           // 9
  'carbonite_hs_common',           // 10
  'carbonite_hs_common',           // 11
  'carbonite_hs_uncommon',         // 12
  'carbonite_hs_rare_legendary',   // 13
  'carbonite_hsf',                 // 14
  'carbonite_hsf',                 // 15
]

export const CARBONITE_LAW_SLOT_TYPES: CarboniteSlotType[] = [
  'carbonite_leader',     // 0
  'carbonite_prestige',   // 1
  'carbonite_hs_common',  // 2
  'carbonite_hs_common',  // 3
  'carbonite_hs_common',  // 4
  'carbonite_hs_common',  // 5
  'carbonite_hs_flex',    // 6
  'carbonite_hs_flex',    // 7
  'carbonite_hs_flex',    // 8
  'carbonite_hs_top',     // 9 (always R/S/L)
  'carbonite_hsf_flex',   // 10
  'carbonite_hsf_flex',   // 11
  'carbonite_hsf_flex',   // 12
  'carbonite_hsf_flex',   // 13
  'carbonite_hsf_common', // 14
  'carbonite_hsf_common', // 15
]

/** ASH's runs are rarity-sorted, so fixed and flex cards share one label per run. */
export const CARBONITE_ASH_SLOT_TYPES: CarboniteSlotType[] = [
  'carbonite_leader',   // 0
  'carbonite_hs',       // 1  HS run, ascending: 4 Common + 1 swing + 2 elevated
  'carbonite_hs',       // 2
  'carbonite_hs',       // 3
  'carbonite_hs',       // 4
  'carbonite_hs',       // 5
  'carbonite_hs',       // 6
  'carbonite_hs',       // 7
  'carbonite_hs_top',   // 8  (R/L)
  'carbonite_prestige', // 9
  'carbonite_hsf_top',  // 10 (at least Uncommon)
  'carbonite_hsf',      // 11 HSF run, descending: 3 Common + 2 flex
  'carbonite_hsf',      // 12
  'carbonite_hsf',      // 13
  'carbonite_hsf',      // 14
  'carbonite_hsf',      // 15
]

function carboniteSlotTypes(baseSetCode: string): CarboniteSlotType[] {
  if (baseSetCode === 'ASH') return CARBONITE_ASH_SLOT_TYPES
  if (getSetConfig(baseSetCode)?.packRules?.carboniteTiered === true) return CARBONITE_LAW_SLOT_TYPES
  return CARBONITE_PRE_LAW_SLOT_TYPES
}

/**
 * The slot a card was printed in, from its index within its pack and the pack's
 * layout. Every card in a pack shares one set, so the card's own set picks the map.
 *
 * `packSetCode` is the set the pack was opened as (`ASH` or `ASH-CB`). A Carbonite
 * pack holds ordinary `ASH` cards, so only the pack's code says it is Carbonite;
 * every caller that can open Carbonite must pass it.
 */
export function slotTypeForPackCard(cardValue: unknown, cardIndex: number, packSetCode?: unknown): SlotType | null {
  // Stored cards are loosely typed; only `set` and `isLeader` are read.
  const card = (cardValue ?? {}) as { set?: unknown; isLeader?: unknown }
  if (typeof card.set === 'string' && card.set && !hasLeaderSlot(card.set)) {
    const slot = ICONS_PACK_SLOT_TYPES[cardIndex]
    if (slot === 'leader_or_common') return card.isLeader === true ? 'leader' : 'common'
    return slot ?? null
  }
  if (typeof packSetCode === 'string' && packSetCode.endsWith('-CB')) {
    return carboniteSlotTypes(packSetCode.slice(0, -'-CB'.length))[cardIndex] ?? null
  }
  if (typeof card.set === 'string' && getSetConfig(card.set)?.packRules?.foilSlotIsHyperspaceFoil === true) {
    return LAW_PLUS_PACK_SLOT_TYPES[cardIndex] ?? null
  }
  return PACK_SLOT_TYPES[cardIndex] ?? null
}
