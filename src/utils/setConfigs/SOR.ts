// @ts-nocheck
/**
 * Set Configuration for SOR - Spark of Rebellion
 * Set 1
 */

import { SETS_1_3_CONSTANTS } from '../packConstants'
import type { SetConfig } from './index'

const constants = SETS_1_3_CONSTANTS

export const SOR_CONFIG: SetConfig = {
  setCode: 'SOR',
  setName: 'Spark of Rebellion',
  setNumber: 1,
  color: '#CC0000', // Darker red
  prereleaseDate: '2024-03-01',
  releaseDate: '2024-03-08',

  // Card counts (Normal variants only)
  cardCounts: {
    leaders: {
      common: 8,
      rare: 10, // Includes both Rare and Legendary leaders
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
    specials: 8
  },

  // Pack construction rules
  packRules: {
    // Rare bases can appear in rare slot
    rareBasesInRareSlot: true,

    // Special rarity cards can appear in foil/hyperfoil slots only
    specialInFoilSlot: constants.specialInFoilSlot,
    specialInHyperspaceSlots: constants.specialInHyperspaceSlot ?? false,
    specialShowcaseLeaders: false, // SOR showcase pool excludes Special-rarity leaders
    baseLineAspectConflict: constants.baseLineAspectConflict,
    uncommonAspectInterleave: constants.uncommonAspectInterleave,
    lineStackingCollation: constants.lineStackingCollation,
    carboniteTiered: constants.carboniteTiered,
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
    uncommon: constants.uncommonDedupWindow,
  },

  // Upgrade probabilities
  // NOTE: For Sets 1-6, HS upgrades are belt-driven (HyperspaceUpgradeBelt),
  // not independent coin flips. These values are used as fallback for LAW+
  // and for non-HS upgrades (Showcase, Hyperfoil).
  // Actual HS rates are in HS_BELT_CONFIGS in packConstants.ts.
  upgradeProbabilities: {
    // Leader upgrades
    leaderToHyperspace: constants.leaderHyperspaceRate,         // ~1/6 (belt: 10/60)
    leaderToShowcase: constants.showcaseLeaderRate,             // ~1/288 (independent)

    // Base upgrade
    baseToHyperspace: constants.baseHyperspaceRate,             // ~1/6 (belt: 10/60)

    // Foil upgrade
    foilToHyperfoil: constants.hyperfoilRate,                   // ~1/50 (independent)

    // UC slot upgrades
    thirdUCToHyperspaceRL: constants.ucSlot3UpgradeRate,        // ~1/5.5 (belt: 8/60)
    firstUCToHyperspaceUC: constants.uncommonHyperspaceRate,    // ~1/8.5 (belt: 4/60)
    secondUCToHyperspaceUC: constants.uncommonHyperspaceRate,   // ~1/8.5 (belt: 2/60)

    // Common upgrade
    commonToHyperspace: constants.commonHyperspaceRate,         // ~1/3 (belt: 12/60)

    // NOTE: Rare slot NEVER upgrades to HS. HS rares only appear via UC3 upgrade.
  }
}
