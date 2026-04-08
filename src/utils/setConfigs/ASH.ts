// @ts-nocheck
/**
 * Set Configuration for ASH - Ashes of the Empire
 * Set 8
 *
 * Pack rules are a copy of LAW (Set 7) until FFG announces changes:
 * - No regular foils - foil slot is ALWAYS Hyperspace Foil
 * - Guaranteed Hyperspace card in every pack (last common slot)
 * - Prestige cards in standard boosters (~1 in 18 packs)
 * - Showcase leaders are significantly rarer
 * - Triple-aspect cards (fewer than LAW)
 *
 * NOTE: Card counts are placeholder (copied from LAW).
 * Run `npm run fetch-cards` to update when full data is available.
 */

import { SET_7_PLUS_CONSTANTS } from '../packConstants'
import type { SetConfig } from './index'

const constants = SET_7_PLUS_CONSTANTS

export const ASH_CONFIG: SetConfig = {
  setCode: 'ASH',
  setName: 'Ashes of the Empire',
  setNumber: 8,
  color: '#8B0000', // Dark red/empire theme
  prereleaseDate: '2026-07-10',
  releaseDate: '2026-07-17',

  // Card counts - PLACEHOLDER (copied from LAW, update when data available)
  cardCounts: {
    leaders: {
      common: 8,
      rare: 8,
      total: 18
    },
    bases: {
      common: 8,
      rare: 3,
      total: 12
    },
    commons: 100,
    uncommons: 60,
    rares: 47,
    legendaries: 20,
    specials: 10
  },

  // Pack construction rules - same as LAW
  packRules: {
    rareBasesInRareSlot: true,
    foilSlotIsHyperspaceFoil: true,
    guaranteedHyperspaceCommon: true,
    hyperspaceCommonSlot: 5,
    prestigeInStandardPacks: true,
    specialInFoilSlot: constants.specialInFoilSlot,
  },

  rarityWeights: {
    hyperspaceFoilSlot: constants.hyperspaceFoilSlotWeights || {
      Common: 65,
      Uncommon: 20,
      Rare: 8,
      Special: 4,
      Legendary: 3,
    },
    ucSlot3Upgraded: constants.ucSlot3UpgradedWeights,
    hyperspaceNonFoil: constants.hyperspaceNonFoilWeights,
  },

  beltRatios: {
    rareToLegendary: constants.rareSlotLegendaryRatio,
  },

  upgradeProbabilities: {
    leaderToHyperspace: constants.leaderHyperspaceRate,
    leaderToShowcase: constants.showcaseLeaderRate,
    baseToHyperspace: constants.baseHyperspaceRate,
    foilToHyperfoil: 0,
    thirdUCToHyperspaceRL: constants.ucSlot3UpgradeRate,
    firstUCToHyperspaceUC: constants.uncommonHyperspaceRate,
    secondUCToHyperspaceUC: constants.uncommonHyperspaceRate,
    commonToHyperspace: 0,
    rareToPrestige: 0,
    uc3ToPrestige: constants.uc3PrestigeRate || 1/18,
  },

  // Triple-aspect cards present but fewer than LAW
  tripleAspect: {
    enabled: true,
    beltAssignment: 'primaryAspectPriority',
  },
}
