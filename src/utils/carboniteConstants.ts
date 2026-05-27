// @ts-nocheck
/**
 * Carbonite Booster Pack Constants
 *
 * Carbonite packs are premium packs where every card is a variant
 * (foil, hyperspace, prestige, or showcase). Available for Sets 4-8.
 *
 * Pack structure differs between pre-LAW and LAW+ sets because
 * LAW eliminated traditional foils entirely. ASH (Set 8) inherits
 * LAW's pack rules verbatim until FFG announces changes.
 */

/**
 * Pre-LAW Carbonite (JTL, LOF, SEC) — 16 cards:
 * [0]     Leader — always Hyperspace (showcase upgrade ~1/20)
 * [1-4]   Common Foil x 4 (from CarboniteSlotBelt)
 * [5-6]   Uncommon Foil x 2 (from CarboniteSlotBelt)
 * [7]     R/L Foil x 1 (from CarboniteFoilRLBelt, weighted 70/20/10)
 * [8]     Prestige (synthesized from R/L pool)
 * [9-11]  Common Hyperspace x 3 (from CarboniteSlotBelt)
 * [12]    Uncommon Hyperspace x 1 (from CarboniteSlotBelt)
 * [13]    R/L Hyperspace x 1 (from CarboniteSlotBelt, weighted 70/20/10)
 * [14-15] Hyperspace Foil x 2 (from HyperfoilBelt)
 *
 * LAW+ Carbonite (LAW, ASH) — 16 cards:
 * [0]     Leader — always Hyperspace (showcase upgrade ~1/48)
 * [1]     Prestige (synthesized from R/L pool)
 * [2-5]   HS Common x 4 (fixed Common, from CarboniteSlotBelt)
 * [6-8]   HS Flex x 3 (weighted: C:32, UC:63, R:3, S:1, L:1)
 * [9]     HS Top x 1 (always R/S/L, weighted: R:60, S:20, L:20)
 * [10-13] HSF Flex x 4 (weighted: C:43, UC:44, R:10, S:1.5, L:1.5)
 * [14-15] HSF Common x 2 (fixed Common)
 */

export const CARBONITE_CONSTANTS = {
  // Which sets support Carbonite packs
  supportedSets: ['JTL', 'LOF', 'SEC', 'LAW', 'ASH'] as const,

  // Showcase leader upgrade rates (independent coin flip)
  showcaseRate: {
    preLaw: 1 / 20,   // ~5% per pack
    law: 1 / 48,       // ~2% per pack
  },

  // Prestige tier weights (determines visual tier of prestige card)
  prestigeTierWeights: {
    tier1: 80,
    tier2: 18,
    serialized: 2,
  },

  // Foil R/L belt weights (guaranteed R/L foil slot)
  foilRLWeights: {
    Rare: 70,
    Special: 20,
    Legendary: 10,
  } as Record<string, number>,

  // HS R/L belt weights (same distribution as foil R/L)
  hsRLWeights: {
    Rare: 70,
    Special: 20,
    Legendary: 10,
  } as Record<string, number>,

  // LAW+ HS flex slot weights (3 of 8 HS slots — middle flex positions)
  hsFlexWeights: {
    Common: 32,
    Uncommon: 63,
    Rare: 3,
    Special: 1,
    Legendary: 1,
  } as Record<string, number>,

  // LAW+ HS top slot weights (1 of 8 HS slots — always R/S/L)
  hsTopWeights: {
    Rare: 60,
    Special: 20,
    Legendary: 20,
  } as Record<string, number>,

  // LAW+ HSF flex slot weights (4 of 6 HSF slots)
  hsfFlexWeights: {
    Common: 43,
    Uncommon: 44,
    Rare: 10,
    Special: 1.5,
    Legendary: 1.5,
  } as Record<string, number>,

  // Pre-LAW pack slot counts (rarity-specific belts)
  preLaw: {
    commonFoils: 4,     // Common Foil slots
    uncommonFoils: 2,   // Uncommon Foil slots
    foilRL: 1,          // R/L Foil slot (weighted)
    prestige: 1,        // Prestige slot
    commonHS: 3,        // Common Hyperspace slots
    uncommonHS: 1,      // Uncommon Hyperspace slot
    rlHS: 1,            // R/L Hyperspace slot (weighted)
    hsFoil: 2,          // Hyperspace Foil slots
  },

  // LAW+ pack slot counts (tiered: fixed C + flex + top)
  law: {
    prestige: 1,
    hsCommon: 4,    // [2-5]   fixed Common HS
    hsFlex: 3,      // [6-8]   flex HS (weighted rarity)
    hsTop: 1,       // [9]     guaranteed R/S/L HS
    hsfFlex: 4,     // [10-13] flex HSF (weighted rarity)
    hsfCommon: 2,   // [14-15] fixed Common HSF
  },
} as const

/**
 * Check if a set code supports Carbonite packs
 */
export function isCarboniteSupported(baseSetCode: string): boolean {
  return (CARBONITE_CONSTANTS.supportedSets as readonly string[]).includes(baseSetCode)
}

/**
 * Extract the base set code from a composite Carbonite code
 * e.g., 'JTL-CB' -> 'JTL', 'LAW' -> 'LAW'
 */
export function getBaseSetCode(setCode: string): string {
  return setCode.replace('-CB', '')
}

/**
 * Check if a set code is a Carbonite composite code
 */
export function isCarboniteCode(setCode: string): boolean {
  return typeof setCode === 'string' && setCode.endsWith('-CB')
}
