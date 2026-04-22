// @ts-nocheck
/**
 * Pack Generation Constants
 *
 * Centralized configuration for all pack generation parameters.
 * All probabilities and ratios are defined here for easy auditing.
 *
 * Sources:
 * - FFG official announcements
 * - Community box break analysis
 * - Experimental data from opened packs
 *
 * NOTE: These values are best estimates. Some may be adjusted as more data becomes available.
 */

// ============================================================================
// PACK STRUCTURE (applies to all sets)
// ============================================================================

export const PACK_STRUCTURE = {
  totalCards: 16,
  leaders: 1,
  bases: 1,
  commons: 9,        // Alternating between Belt A and Belt B
  uncommons: 3,      // UC slot 1, 2, and 3 (slot 3 can upgrade)
  rareOrLegendary: 1,
  foils: 1,
} as const

// ============================================================================
// ASPECT COVERAGE (applies to all sets)
// ============================================================================

export const ASPECT_COVERAGE = {
  // Every pack guarantees all 6 aspects in commons
  requiredAspects: ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Heroism', 'Villainy'],

  // Belt A aspects (draw positions 0, 2, 4, 6, 8)
  beltAAspects: ['Vigilance', 'Command', 'Heroism'],

  // Belt B aspects (draw positions 1, 3, 5, 7)
  beltBAspects: ['Aggression', 'Cunning', 'Villainy'],
} as const

// ============================================================================
// Type definitions for constants
// ============================================================================

export interface RarityWeights {
  Common: number
  Uncommon: number
  Rare: number
  Legendary: number
  Special: number
}

export interface UCSlot3UpgradedWeights {
  Uncommon: number
  Rare: number
  Legendary: number
  Special: number
}

export interface PackConstants {
  foilSlotWeights: RarityWeights | null
  hyperfoilRate: number
  rareSlotLegendaryRatio: number
  ucSlot3UpgradeRate: number
  ucSlot3UpgradedWeights: UCSlot3UpgradedWeights
  leaderHyperspaceRate: number
  baseHyperspaceRate: number
  commonHyperspaceRate: number
  uncommonHyperspaceRate: number
  // NOTE: Rare slot NEVER upgrades to Hyperspace. HS rares only appear via UC3 upgrade.
  hyperspaceNonFoilWeights: RarityWeights
  hyperfoilWeights: RarityWeights
  showcaseLeaderRate: number
  rareBaseRate: number
  specialInFoilSlot: boolean
  specialInHyperspaceSlot?: boolean
  hyperspaceFoilSlotWeights?: RarityWeights
  prestigeInRareSlotRate?: number
  uc3PrestigeRate?: number
  guaranteedHyperspaceCommon?: boolean
  hyperspaceCommonSlot?: number
  rareBasesInRareSlot?: boolean
}

// ============================================================================
// SETS 1-3 CONSTANTS (SOR, SHD, TWI)
// ============================================================================

export const SETS_1_3_CONSTANTS: PackConstants = {
  // ---------------------------------------------------------------------------
  // Foil Slot Rarity Weights (Question 1)
  // FoilBelt uses RARITY_QUANTITIES (54/18/6/1) per unique card.
  // Actual distribution depends on card count per rarity in each set.
  // These weights approximate the effective distribution for stats comparison.
  // ---------------------------------------------------------------------------
  foilSlotWeights: {
    Common: 78,
    Uncommon: 17,
    Rare: 5,
    Legendary: 0.3,
    Special: 0,  // No Special in foil slot for sets 1-3
  },

  // ---------------------------------------------------------------------------
  // Hyperfoil Rate (Question 2)
  // ~1 in 50 packs (approximately 1 per 2 boxes)
  // ---------------------------------------------------------------------------
  hyperfoilRate: 1 / 50,

  // ---------------------------------------------------------------------------
  // Rare Slot Legendary Ratio (Question 15)
  // Standard Legendary rate is 1 in 8 (7:1 ratio R:L, 7 rares per 1 legendary)
  // ---------------------------------------------------------------------------
  rareSlotLegendaryRatio: 7,  // 7:1 means 7 rares for every 1 legendary (1 in 8)

  // ---------------------------------------------------------------------------
  // UC Slot 3 Upgrade Rate (Question 3)
  // ~1 in 5.5 packs total HS upgrade rate
  // ---------------------------------------------------------------------------
  ucSlot3UpgradeRate: 1 / 5.5,

  // ---------------------------------------------------------------------------
  // UC Slot 3 Upgraded Rarity Weights (Question 4, 14)
  // ~64% U / 31% R / 5% L
  // ---------------------------------------------------------------------------
  ucSlot3UpgradedWeights: {
    Uncommon: 64,
    Rare: 31,
    Legendary: 5,
    Special: 0,
  },

  // ---------------------------------------------------------------------------
  // Leader Hyperspace Upgrade Rate (Question 5)
  // ~1 in 6 packs (4 per box)
  // ---------------------------------------------------------------------------
  leaderHyperspaceRate: 1 / 6,

  // ---------------------------------------------------------------------------
  // Base Hyperspace Upgrade Rate (Question 6)
  // ~1 in 6 packs (~4 per box)
  // ---------------------------------------------------------------------------
  baseHyperspaceRate: 1 / 6,

  // ---------------------------------------------------------------------------
  // Common Hyperspace Upgrade Rate (Question 7)
  // ~1 in 3 packs (replaces a common slot)
  // ---------------------------------------------------------------------------
  commonHyperspaceRate: 1 / 3,

  // ---------------------------------------------------------------------------
  // Uncommon Hyperspace Upgrade Rate (Question 8)
  // ~1 in 8.5 packs (goes in UC Slot 3)
  // ---------------------------------------------------------------------------
  uncommonHyperspaceRate: 1 / 8.5,

  // NOTE: Rare slot NEVER upgrades to Hyperspace. HS rares only appear via UC3 upgrade.

  // ---------------------------------------------------------------------------
  // HS Non-Foil Rarity Weights (Question 12)
  // 90% C / 6% U / 3% R / 1% L
  // ---------------------------------------------------------------------------
  hyperspaceNonFoilWeights: {
    Common: 90,
    Uncommon: 6,
    Rare: 3,
    Legendary: 1,
    Special: 0,
  },

  // ---------------------------------------------------------------------------
  // Hyperfoil Rarity Weights (Question 13)
  // Mirrors foil slot distribution
  // ---------------------------------------------------------------------------
  hyperfoilWeights: {
    Common: 78,
    Uncommon: 17,
    Rare: 5,
    Legendary: 0.3,
    Special: 0,
  },

  // ---------------------------------------------------------------------------
  // Showcase Leader Rate
  // Very rare - approximately 1 in 288 packs
  // ---------------------------------------------------------------------------
  showcaseLeaderRate: 1 / 288,

  // ---------------------------------------------------------------------------
  // Rare Base Rate (in base slot)
  // Same as rare leader rate: ~1 in 6 packs
  // Only applies to sets that have rare bases (e.g., LAW+)
  // ---------------------------------------------------------------------------
  rareBaseRate: 1 / 6,

  // ---------------------------------------------------------------------------
  // Special Rarity Handling
  // Sets 1-3: No Special rarity cards in packs (Question 11)
  // ---------------------------------------------------------------------------
  specialInFoilSlot: false,
  specialInHyperspaceSlot: false,
}

// ============================================================================
// SETS 4-6 CONSTANTS (JTL, LOF, SEC)
// ============================================================================

export const SETS_4_6_CONSTANTS: PackConstants = {
  // ---------------------------------------------------------------------------
  // Foil Slot Rarity Weights (Questions 1, 11)
  // FoilBelt uses RARITY_QUANTITIES per unique card. Special multiplier is
  // dynamically scaled so total Special output = total Rare output.
  // Actual distribution depends on card count per rarity in each set.
  // These weights approximate the effective distribution for stats comparison.
  // ---------------------------------------------------------------------------
  foilSlotWeights: {
    Common: 75,
    Uncommon: 17,
    Rare: 4,
    Special: 4,
    Legendary: 0.3,
  },

  // ---------------------------------------------------------------------------
  // Hyperfoil Rate (Question 2)
  // ~1 in 50 packs (remains the "chase")
  // ---------------------------------------------------------------------------
  hyperfoilRate: 1 / 50,

  // ---------------------------------------------------------------------------
  // Rare Slot Legendary Ratio (Question 15)
  // Standard Legendary rate is 1 in 6 (5:1 ratio R:L, 5 rares per 1 legendary)
  // ---------------------------------------------------------------------------
  rareSlotLegendaryRatio: 5,  // 5:1 means 5 rares for every 1 legendary (1 in 6)

  // ---------------------------------------------------------------------------
  // UC Slot 3 Upgrade Rate (Question 3)
  // ~1 in 5 packs (slightly more frequent than sets 1-3)
  // ---------------------------------------------------------------------------
  ucSlot3UpgradeRate: 1 / 5,

  // ---------------------------------------------------------------------------
  // UC Slot 3 Upgraded Rarity Weights (Question 4, 14)
  // ~60% U / 25% R / 10% S / 5% L
  // ---------------------------------------------------------------------------
  ucSlot3UpgradedWeights: {
    Uncommon: 60,
    Rare: 25,
    Special: 10,
    Legendary: 5,
  },

  // ---------------------------------------------------------------------------
  // Leader Hyperspace Upgrade Rate (Question 5)
  // ~1 in 6 packs (4 per box)
  // ---------------------------------------------------------------------------
  leaderHyperspaceRate: 1 / 6,

  // ---------------------------------------------------------------------------
  // Base Hyperspace Upgrade Rate (Question 6)
  // ~1 in 6 packs (~4 per box)
  // ---------------------------------------------------------------------------
  baseHyperspaceRate: 1 / 6,

  // ---------------------------------------------------------------------------
  // Common Hyperspace Upgrade Rate (Question 7)
  // ~1 in 3 packs (replaces a common slot)
  // ---------------------------------------------------------------------------
  commonHyperspaceRate: 1 / 3,

  // ---------------------------------------------------------------------------
  // Uncommon Hyperspace Upgrade Rate (Question 8)
  // ~1 in 8 packs (goes in UC Slot 3)
  // ---------------------------------------------------------------------------
  uncommonHyperspaceRate: 1 / 8,

  // NOTE: Rare slot NEVER upgrades to Hyperspace. HS rares only appear via UC3 upgrade.

  // ---------------------------------------------------------------------------
  // HS Non-Foil Rarity Weights (Question 12)
  // 85% C / 7% U / 4% R / 3% S / 1% L
  // ---------------------------------------------------------------------------
  hyperspaceNonFoilWeights: {
    Common: 85,
    Uncommon: 7,
    Rare: 4,
    Special: 3,
    Legendary: 1,
  },

  // ---------------------------------------------------------------------------
  // Hyperfoil Rarity Weights (Question 13)
  // Mirrors foil slot distribution for sets 4-6
  // Special = Rare (dynamic multiplier in HyperfoilBelt)
  // ---------------------------------------------------------------------------
  hyperfoilWeights: {
    Common: 75,
    Uncommon: 17,
    Rare: 4,
    Special: 4,
    Legendary: 0.3,
  },

  // ---------------------------------------------------------------------------
  // Showcase Leader Rate
  // Very rare - approximately 1 in 288 packs
  // ---------------------------------------------------------------------------
  showcaseLeaderRate: 1 / 288,

  // ---------------------------------------------------------------------------
  // Rare Base Rate (in base slot)
  // Same as rare leader rate: ~1 in 6 packs
  // ---------------------------------------------------------------------------
  rareBaseRate: 1 / 6,

  // ---------------------------------------------------------------------------
  // Special Rarity Handling
  // Sets 4-6: Special rarity cards appear in packs
  // ---------------------------------------------------------------------------
  specialInFoilSlot: true,
  specialInHyperspaceSlot: true,
}

// ============================================================================
// SET 7+ CONSTANTS (LAW onwards)
// Major changes from official FFG announcement:
// - No regular foils - foil slot is ALWAYS Hyperspace Foil
// - Guaranteed Hyperspace card in every pack (common slot)
// - Prestige cards in standard boosters (~1 in 18 packs)
// - Showcase leaders are significantly rarer
// - Triple-aspect cards (double primary aspect)
//
// Source: https://starwarsunlimited.com/articles/a-shift-from-what-was
// ============================================================================

export const SET_7_PLUS_CONSTANTS: PackConstants = {
  // ---------------------------------------------------------------------------
  // Foil Slot - ELIMINATED
  // Regular foils are gone. The foil slot is now ALWAYS a Hyperspace Foil.
  // ---------------------------------------------------------------------------
  foilSlotWeights: null, // Not used - foil slot is always hyperspace foil

  // ---------------------------------------------------------------------------
  // Hyperspace Foil Slot Rarity Weights
  // Since the slot is always HS Foil, these weights determine rarity
  // ---------------------------------------------------------------------------
  hyperspaceFoilSlotWeights: {
    Common: 65,
    Uncommon: 20,
    Rare: 8,
    Special: 4,
    Legendary: 3,
  },

  // ---------------------------------------------------------------------------
  // Hyperfoil Rate - N/A (foil slot IS hyperspace foil now)
  // No longer an "upgrade" - it's the default
  // ---------------------------------------------------------------------------
  hyperfoilRate: 1.0, // Always hyperspace foil

  // ---------------------------------------------------------------------------
  // Rare Slot Legendary Ratio
  // Keeping similar to Set 4-6 until we have more data
  // ---------------------------------------------------------------------------
  rareSlotLegendaryRatio: 5,

  // ---------------------------------------------------------------------------
  // Prestige Card Rate in Rare Slot
  // LAW: 0 — prestige moved to UC3 slot, not rare slot
  // ---------------------------------------------------------------------------
  prestigeInRareSlotRate: 0,

  // ---------------------------------------------------------------------------
  // Prestige Card Rate in UC3 Slot (NEW in LAW)
  // ~1 in 18 packs — UC3 upgrades to Prestige tier 1 (checked before HS R/L)
  // ---------------------------------------------------------------------------
  uc3PrestigeRate: 1 / 18,

  // ---------------------------------------------------------------------------
  // UC Slot 3 Upgrade Rate
  // ---------------------------------------------------------------------------
  ucSlot3UpgradeRate: 1 / 3,

  // ---------------------------------------------------------------------------
  // UC Slot 3 Upgraded Rarity Weights
  // From 4-box (96 pack) observation: UC:R:S:L = 20:10:3:1 → weights 24:12:3:1
  // ---------------------------------------------------------------------------
  ucSlot3UpgradedWeights: {
    Uncommon: 24,
    Rare: 12,
    Special: 3,
    Legendary: 1,
  },

  // ---------------------------------------------------------------------------
  // Leader Hyperspace Upgrade Rate
  // ---------------------------------------------------------------------------
  leaderHyperspaceRate: 1 / 6,

  // ---------------------------------------------------------------------------
  // Base Hyperspace Upgrade Rate
  // Same as sets 1-6 (belt-driven)
  // ---------------------------------------------------------------------------
  baseHyperspaceRate: 1 / 6,

  // ---------------------------------------------------------------------------
  // Dedicated HS Common Slot (LAW)
  // Slot 5 is drawn from HyperspaceCommonBelt (always HS, equal distribution)
  // The other 8 common spots do NOT upgrade to HS
  // ---------------------------------------------------------------------------
  guaranteedHyperspaceCommon: true,
  hyperspaceCommonSlot: 5, // Slot 5 (1-indexed) - dedicated HS common belt

  // ---------------------------------------------------------------------------
  // Common Hyperspace Upgrade Rate
  // LAW: 0 — commons don't upgrade; slot 5 comes pre-HS from dedicated belt
  // ---------------------------------------------------------------------------
  commonHyperspaceRate: 0,

  // ---------------------------------------------------------------------------
  // Uncommon Hyperspace Upgrade Rate
  // ---------------------------------------------------------------------------
  uncommonHyperspaceRate: 1 / 8,

  // NOTE: Rare slot NEVER upgrades to Hyperspace. HS rares only appear via UC3 upgrade.

  // ---------------------------------------------------------------------------
  // HS Non-Foil Rarity Weights
  // ---------------------------------------------------------------------------
  hyperspaceNonFoilWeights: {
    Common: 85,
    Uncommon: 7,
    Rare: 4,
    Special: 3,
    Legendary: 1,
  },

  // ---------------------------------------------------------------------------
  // Hyperfoil Rarity Weights - same as hyperspaceFoilSlotWeights
  // ---------------------------------------------------------------------------
  hyperfoilWeights: {
    Common: 65,
    Uncommon: 20,
    Rare: 8,
    Special: 4,
    Legendary: 3,
  },

  // ---------------------------------------------------------------------------
  // Showcase Leader Rate
  // "Significantly reduced" per FFG - roughly doubling the rarity
  // ---------------------------------------------------------------------------
  showcaseLeaderRate: 1 / 576,

  // ---------------------------------------------------------------------------
  // Special Rarity Handling
  // ---------------------------------------------------------------------------
  specialInFoilSlot: true,
  specialInHyperspaceSlot: true,

  // ---------------------------------------------------------------------------
  // Rare Bases in Rare Slot
  // All sets (1-7) put rare bases in the rare slot via RareLegendaryBelt.
  // The BaseBelt supports rareBasesInRareSlot: false for future sets if needed.
  // ---------------------------------------------------------------------------
  rareBasesInRareSlot: true,
}

// ============================================================================
// HELPER FUNCTION TO GET CONSTANTS BY SET
// ============================================================================

// ============================================================================
// HYPERSPACE UPGRADE BELT CONFIGS
// ============================================================================

export interface HSBeltConfig {
  cycleSize: number
  budgetDistribution: { 0: number, 1: number, 2: number }
  slotCounts: {
    leader: number
    base: number
    common: number
    uc1: number
    uc2: number
    uc3: number
    // NOTE: Rare slot NEVER upgrades to HS. HS rares only appear via UC3 upgrade.
  }
}

/**
 * HS Belt configurations by set group.
 *
 * Cycle of 60 packs:
 *   budget-0: 20 (33.3% — 1/3 of packs have no HS)
 *   budget-1: 30 (50.0%)
 *   budget-2: 10 (16.7%)
 *   total upgrades: 0×20 + 1×30 + 2×10 = 50 → μ = 0.833
 *
 * σ = 0.687, Z(2) = 1.70, Z(3) = 3.16
 *
 * Extra margin in μ accounts for real belt variance from independent
 * variant-belt draws, which add noise above theoretical σ.
 */
export const HS_BELT_CONFIGS: Record<string, HSBeltConfig> = {
  // NOTE: Rare slot NEVER upgrades to HS. HS rares only appear via UC3 upgrade.
  '1-3': {
    cycleSize: 60,
    budgetDistribution: { 0: 24, 1: 26, 2: 10 },
    slotCounts: {
      leader: 10,   // 1/6
      base: 10,     // 1/6
      common: 12,   // 1/5
      uc1: 4,       // ~1/15
      uc2: 2,       // ~1/30
      uc3: 8,       // ~1/7.5
    }
    // total: 10+10+12+4+2+8 = 46 ✓
  },
  '4-6': {
    cycleSize: 60,
    budgetDistribution: { 0: 24, 1: 26, 2: 10 },
    slotCounts: {
      leader: 10,   // 1/6
      base: 10,     // 1/6
      common: 12,   // 1/5
      uc1: 4,       // ~1/15
      uc2: 2,       // ~1/30
      uc3: 8,       // ~1/7.5
    }
    // total: 46 ✓
  },
  // LAW (Set 7+): Slot 5 is a dedicated HS common from HyperspaceCommonBelt.
  // The belt handles non-common HS upgrades only.
  // common: 0 because the HS common comes from a dedicated belt, not an upgrade.
  // UC3 can still upgrade to HS R/L (if prestige doesn't trigger first).
  'LAW': {
    cycleSize: 60,
    budgetDistribution: { 0: 22, 1: 30, 2: 8 },
    slotCounts: {
      leader: 10,   // 1/6
      base: 10,     // 1/6
      common: 0,    // No common HS upgrades; dedicated belt provides HS common
      uc1: 4,       // ~1/15
      uc2: 2,       // ~1/30
      uc3: 20,      // ~1/3 (from 4-box observation: 34 HS upgrades in 96 packs)
    }
    // total: 10+10+0+4+2+20 = 46 ✓
    // budget: 0×22 + 1×30 + 2×8 = 46 ✓
    // μ = 46/60 ≈ 0.77 belt upgrades + 1 guaranteed HS common = ~1.77 HS/pack
  },
}

/**
 * Get pack constants for a specific set number
 * @param setNumber - The set number (1-7+)
 * @returns The constants for that set group
 */
export function getPackConstants(setNumber: number): PackConstants {
  if (setNumber >= 1 && setNumber <= 3) {
    return SETS_1_3_CONSTANTS
  } else if (setNumber >= 4 && setNumber <= 6) {
    return SETS_4_6_CONSTANTS
  } else if (setNumber >= 7) {
    return SET_7_PLUS_CONSTANTS
  }
  // Default to sets 4-6 for unknown sets
  return SETS_4_6_CONSTANTS
}

interface RarityWeight {
  rarity: string
  weight: number
}

/**
 * Convert rarity weights object to an array suitable for belt filling
 * @param weights - Object with rarity keys and weight values
 * @returns Array of {rarity, weight} objects, sorted by weight descending
 */
export function weightsToArray(weights: Record<string, number>): RarityWeight[] {
  return Object.entries(weights)
    .filter(([_, weight]) => weight > 0)
    .map(([rarity, weight]) => ({ rarity, weight }))
    .sort((a, b) => b.weight - a.weight)
}

/**
 * Calculate the total weight from a weights object
 * @param weights - Object with rarity keys and weight values
 * @returns Total weight
 */
export function totalWeight(weights: Record<string, number>): number {
  return Object.values(weights).reduce((sum, w) => sum + w, 0)
}
