// @ts-nocheck
/**
 * Set Configuration for LOF - Legends of the Force
 * Set 5
 */

import { SETS_4_6_CONSTANTS } from '../packConstants'
import type { SetConfig } from './index'

const constants = SETS_4_6_CONSTANTS

export const LOF_CONFIG: SetConfig = {
  setCode: 'LOF',
  setName: 'Legends of the Force',
  setNumber: 5,
  color: '#5DADE2', // Light blue
  prereleaseDate: '2025-07-04',
  releaseDate: '2025-07-11',

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
    commons: 100,
    uncommons: 60,
    rares: 46,
    legendaries: 20,
    specials: 8
  },

  // Pack construction rules
  packRules: {
    rareBasesInRareSlot: true,
    specialInFoilSlot: constants.specialInFoilSlot,
    specialInHyperspaceSlots: constants.specialInHyperspaceSlot ?? false,
    specialShowcaseLeaders: true,
    baseLineAspectConflict: constants.baseLineAspectConflict,
    lineStackingCollation: constants.lineStackingCollation,
    carboniteTiered: constants.carboniteTiered,  // true for Set 4+
  },

  // Rarity weights for different slots (from packConstants)
  rarityWeights: {
    foilSlot: constants.foilSlotWeights!,
    hyperfoil: constants.hyperfoilWeights,
    foilBeltTarget: constants.foilBeltTargetWeights,
    hyperspaceFoilSlot: constants.foilBeltTargetWeights,
    ucSlot3Upgraded: constants.ucSlot3UpgradedWeights,
    hyperspaceNonFoil: constants.hyperspaceNonFoilWeights,
  },

  // Belt ratios
  beltRatios: {
    rareToLegendary: constants.rareSlotLegendaryRatio,
    hyperspaceRareToLegendary: constants.hsRareSlotLegendaryRatio,
  },

  // Dedup windows (config-driven; belts must not branch on setNumber)
  dedupWindows: {
    rareLegendary: constants.rareLegendaryDedupWindow,
    leaderCap: constants.leaderDedupWindowCap,
    hyperspaceLeaderCap: constants.hyperspaceLeaderDedupWindowCap,
  },

  // Upgrade probabilities
  // NOTE: For Sets 1-6, HS upgrades are belt-driven (HyperspaceUpgradeBelt).
  // Actual HS rates are in HS_BELT_CONFIGS in packConstants.ts.
  upgradeProbabilities: {
    leaderToHyperspace: constants.leaderHyperspaceRate,         // ~1/6 (belt: 10/60)
    leaderToShowcase: constants.showcaseLeaderRate,             // ~1/288 (independent)
    baseToHyperspace: constants.baseHyperspaceRate,             // ~1/6 (belt: 10/60)
    foilToHyperfoil: constants.hyperfoilRate,                   // ~1/50 (independent)
    thirdUCToHyperspaceRL: constants.ucSlot3UpgradeRate,        // ~1/5 (belt: 8/60)
    firstUCToHyperspaceUC: constants.uncommonHyperspaceRate,    // ~1/8 (belt: 4/60)
    secondUCToHyperspaceUC: constants.uncommonHyperspaceRate,   // ~1/8 (belt: 2/60)
    commonToHyperspace: constants.commonHyperspaceRate,         // ~1/3 (belt: 12/60)
    // NOTE: Rare slot NEVER upgrades to HS. HS rares only appear via UC3 upgrade.
  }
}
