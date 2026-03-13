// @ts-nocheck
/**
 * Set Configuration for TWI - Twilight of the Republic
 * Set 3
 */

import { SETS_1_3_CONSTANTS } from '../packConstants'
import type { SetConfig } from './index'

const constants = SETS_1_3_CONSTANTS

export const TWI_CONFIG: SetConfig = {
  setCode: 'TWI',
  setName: 'Twilight of the Republic',
  setNumber: 3,
  color: '#6B0000', // Reddish maroon
  prereleaseDate: '2024-11-01',
  releaseDate: '2024-11-08',

  // Card counts (Normal variants only)
  cardCounts: {
    leaders: {
      common: 8,
      rare: 10,
      total: 18
    },
    bases: {
      common: 12,
      rare: 0,
      total: 12
    },
    commons: 90,
    uncommons: 60,
    rares: 48,
    legendaries: 16,
    specials: 13
  },

  // Pack construction rules
  packRules: {
    rareBasesInRareSlot: true,
    specialInFoilSlot: constants.specialInFoilSlot,
  },

  // Rarity weights for different slots (from packConstants)
  rarityWeights: {
    foilSlot: constants.foilSlotWeights!,
    hyperfoil: constants.hyperfoilWeights,
    ucSlot3Upgraded: constants.ucSlot3UpgradedWeights,
    hyperspaceNonFoil: constants.hyperspaceNonFoilWeights,
  },

  // Belt ratios
  beltRatios: {
    rareToLegendary: constants.rareSlotLegendaryRatio,  // 7:1 for R slot (1 in 8)
  },

  // Upgrade probabilities
  // NOTE: For Sets 1-6, HS upgrades are belt-driven (HyperspaceUpgradeBelt).
  // Actual HS rates are in HS_BELT_CONFIGS in packConstants.ts.
  upgradeProbabilities: {
    leaderToHyperspace: constants.leaderHyperspaceRate,         // ~1/6 (belt: 10/60)
    leaderToShowcase: constants.showcaseLeaderRate,             // ~1/288 (independent)
    baseToHyperspace: constants.baseHyperspaceRate,             // ~1/6 (belt: 10/60)
    foilToHyperfoil: constants.hyperfoilRate,                   // ~1/50 (independent)
    thirdUCToHyperspaceRL: constants.ucSlot3UpgradeRate,        // ~1/5.5 (belt: 8/60)
    firstUCToHyperspaceUC: constants.uncommonHyperspaceRate,    // ~1/8.5 (belt: 4/60)
    secondUCToHyperspaceUC: constants.uncommonHyperspaceRate,   // ~1/8.5 (belt: 2/60)
    commonToHyperspace: constants.commonHyperspaceRate,         // ~1/3 (belt: 12/60)
    // NOTE: Rare slot NEVER upgrades to HS. HS rares only appear via UC3 upgrade.
  }
}
