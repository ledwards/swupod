// @ts-nocheck
/**
 * Rarity Distribution Configuration
 *
 * Defines the distribution rates for foils, hyperspace variants, showcase leaders,
 * and other special card types for different time periods in Star Wars Unlimited.
 *
 * Based on official distribution rates from FFG/Asmodee.
 */

import { getSetConfig } from './setConfigs/index'
import type { SetCode } from '../types'

/**
 * Distribution period constants
 */
export const DISTRIBUTION_PERIODS = {
  PRE_LAWLESS_TIME: 'PRE_LAWLESS_TIME',
  A_LAWLESS_TIME_ONWARD: 'A_LAWLESS_TIME_ONWARD'
} as const

export type DistributionPeriod = typeof DISTRIBUTION_PERIODS[keyof typeof DISTRIBUTION_PERIODS]

interface SlotDistribution {
  inStandardPack: number
  inCarbonitePack: number | boolean | { min: number; max: number }
}

interface SerializedPrestigeDistribution extends SlotDistribution {
  serializationTypes: string[]
}

interface VariantDistribution {
  hyperspace: {
    inStandardPack: number
  }
  hyperspaceFoil: {
    inStandardPack: number
  }
}

interface PeriodDistribution {
  standardFoil: SlotDistribution
  hyperspaceFoil: SlotDistribution
  hyperspace: SlotDistribution
  nonFoilPrestige: SlotDistribution
  serializedPrestige: SerializedPrestigeDistribution
  showcaseLeader: SlotDistribution
  rareVariants: VariantDistribution
  legendaryVariants: VariantDistribution
}

/**
 * Rarity distribution configuration for each period
 */
export const RARITY_DISTRIBUTIONS: Record<DistributionPeriod, PeriodDistribution> = {
  [DISTRIBUTION_PERIODS.PRE_LAWLESS_TIME]: {
    // Standard Foils: In ~ 5/6 standard packs, 7 in each Carbonite pack
    standardFoil: {
      inStandardPack: 5/6, // ~83.3% chance per pack
      inCarbonitePack: 7 // Fixed count
    },

    // Hyperspace Foils: In ~ 1/6 standard packs, 2 in each Carbonite pack
    hyperspaceFoil: {
      inStandardPack: 1/6, // ~16.7% chance per pack
      inCarbonitePack: 2 // Fixed count
    },

    // Hyperspace: In ~ 2/3 standard packs, 5-6 in each Carbonite pack
    hyperspace: {
      inStandardPack: 2/3, // ~66.7% chance per pack
      inCarbonitePack: { min: 5, max: 6 } // Random between 5-6
    },

    // Non-foil Prestige: Only in Carbonite packs
    nonFoilPrestige: {
      inStandardPack: 0,
      inCarbonitePack: true
    },

    // Serialized Prestige: Only in Carbonite packs, All serialized X/250 cards
    serializedPrestige: {
      inStandardPack: 0,
      inCarbonitePack: true,
      serializationTypes: ['X/250']
    },

    // Showcase Leaders: In ~ 1/288 standard packs, In ~ 1/20 Carbonite packs
    showcaseLeader: {
      inStandardPack: 1/288, // ~0.347% chance per pack
      inCarbonitePack: 1/20 // ~5% chance per pack
    },

    // Rare Variants: Hyperspace in ~ 1/21 standard packs, Hyperspace foil in ~ 1/72 standard packs
    rareVariants: {
      hyperspace: {
        inStandardPack: 1/21 // ~4.76% chance per pack
      },
      hyperspaceFoil: {
        inStandardPack: 1/72 // ~1.39% chance per pack
      }
    },

    // Legendary Variants: Hyperspace in ~ 1/53 standard packs, Hyperspace foil in ~ 1/181 standard packs
    legendaryVariants: {
      hyperspace: {
        inStandardPack: 1/53 // ~1.89% chance per pack
      },
      hyperspaceFoil: {
        inStandardPack: 1/181 // ~0.55% chance per pack
      }
    }
  },

  [DISTRIBUTION_PERIODS.A_LAWLESS_TIME_ONWARD]: {
    // Standard Foils: Eliminated entirely
    standardFoil: {
      inStandardPack: 0,
      inCarbonitePack: 0
    },

    // Hyperspace Foils: 1 in every standard pack, 6 in each Carbonite pack
    hyperspaceFoil: {
      inStandardPack: 1, // 100% chance (guaranteed)
      inCarbonitePack: 6 // Fixed count
    },

    // Hyperspace: At least 1 in every standard pack, 8-9 in each Carbonite pack
    hyperspace: {
      inStandardPack: 1, // 100% chance (guaranteed at least 1)
      inCarbonitePack: { min: 8, max: 9 } // Random between 8-9
    },

    // Non-foil Prestige: In 1/18 standard packs, In Carbonite packs
    nonFoilPrestige: {
      inStandardPack: 1/18, // ~5.56% chance per pack
      inCarbonitePack: true
    },

    // Serialized Prestige: Only in Carbonite packs, Serialized X/250, X/100, X/50 cards
    serializedPrestige: {
      inStandardPack: 0,
      inCarbonitePack: true,
      serializationTypes: ['X/250', 'X/100', 'X/50']
    },

    // Showcase Leaders: In ~ 1/288 standard packs, In ~ 1/48 Carbonite packs
    showcaseLeader: {
      inStandardPack: 1/288, // ~0.347% chance per pack (same as before)
      inCarbonitePack: 1/48 // ~2.08% chance per pack
    },

    // Rare Variants: Hyperspace in ~ 1/12 standard packs, Hyperspace foil in ~ 1/24 standard packs
    rareVariants: {
      hyperspace: {
        inStandardPack: 1/12 // ~8.33% chance per pack
      },
      hyperspaceFoil: {
        inStandardPack: 1/24 // ~4.17% chance per pack
      }
    },

    // Legendary Variants: Hyperspace in ~ 1/48 standard packs, Hyperspace foil in ~ 1/96 standard packs
    legendaryVariants: {
      hyperspace: {
        inStandardPack: 1/48 // ~2.08% chance per pack
      },
      hyperspaceFoil: {
        inStandardPack: 1/96 // ~1.04% chance per pack
      }
    }
  }
}

/**
 * Set configuration mapping set codes to their distribution period
 * Uses set-specific configs from setConfigs/
 */
export function getSetDistributionPeriod(setCode: SetCode | string): DistributionPeriod {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = getSetConfig(setCode as SetCode) as any
  if (!config) {
    return DISTRIBUTION_PERIODS.PRE_LAWLESS_TIME
  }
  // Sets 7+ (LAW onward) use the new distribution
  return config.setNumber >= 7
    ? DISTRIBUTION_PERIODS.A_LAWLESS_TIME_ONWARD
    : DISTRIBUTION_PERIODS.PRE_LAWLESS_TIME
}

/**
 * Check if a set allows Special rarity in foil slots
 * @param setCode - The set code
 * @returns True if Special rarity can appear in foil slots
 */
export function allowsSpecialInFoil(setCode: SetCode | string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = getSetConfig(setCode as SetCode) as any
  return config ? config.packRules.specialInFoilSlot : false
}

/**
 * Get the distribution configuration for a given set code
 * @param setCode - The set code (e.g., 'SOR', 'JTL')
 * @returns The distribution configuration for that set
 */
export function getDistributionForSet(setCode: SetCode | string): PeriodDistribution {
  const period = getSetDistributionPeriod(setCode)
  return RARITY_DISTRIBUTIONS[period]
}

/**
 * Get the distribution period for a given set code
 * @param setCode - The set code (e.g., 'SOR', 'JTL')
 * @returns The distribution period constant
 */
export function getDistributionPeriod(setCode: SetCode | string): DistributionPeriod {
  return getSetDistributionPeriod(setCode)
}
