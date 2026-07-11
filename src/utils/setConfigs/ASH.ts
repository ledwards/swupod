// @ts-nocheck
/**
 * Set Configuration for ASH - Ashes of the Empire
 * Set 8
 *
 * Pack rules are a copy of LAW (Set 7) until FFG announces changes:
 * - No regular foils - foil slot is ALWAYS Hyperspace Foil
 * - Guaranteed Hyperspace card in every pack (last common slot)
 * - Prestige cards in standard boosters (~2 tier-1 prestige per box on average)
 * - Showcase leaders are significantly rarer
 * - LAW-style multicolor symmetry with fewer multicolor cards than LAW
 *
 * NOTE: Card counts are placeholder bucket assumptions until full data exists.
 * Run `npm run fetch-cards` to update when full data is available.
 */

import { SET_7_PLUS_CONSTANTS } from '../packConstants'
import type { SetConfig } from './index'

const constants = SET_7_PLUS_CONSTANTS
const ASH_T1_PRESTIGE_RATE = 1 / 12

export const ASH_CONFIG: SetConfig = {
  setCode: 'ASH',
  setName: 'Ashes of the Empire',
  setNumber: 8,
  color: '#8B0000', // Dark red/empire theme
  prereleaseDate: '2026-07-10',
  releaseDate: '2026-07-17',

  // Card counts - placeholder bucket assumptions from the ASH v0 model.
  cardCounts: {
    leaders: {
      common: 8,
      rare: 8,
      total: 18   // includes 2 Special leaders and 2 primary-primary leaders
    },
    bases: {
      common: 8,
      rare: 0,
      total: 8
    },
    commons: 100,
    uncommons: 60,
    rares: 50,
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
    specialInHyperspaceSlots: constants.specialInHyperspaceSlot ?? false,
    specialShowcaseLeaders: true,
    baseLineAspectConflict: constants.baseLineAspectConflict,
    lineStackingCollation: constants.lineStackingCollation,
    carboniteTiered: constants.carboniteTiered,
  },

  rarityWeights: {
    // ASH override (real box 001, 24 foils: C20/U1/R1/S1/L1 — commons heavier,
    // uncommons lighter than the LAW-derived C65/U20; R/S/L on target).
    // Moderate shift, not chasing one box; revisit with box #2.
    hyperspaceFoilSlot: {
      Common: 72,
      Uncommon: 13,
      Rare: 8,
      Special: 4,
      Legendary: 3,
    },
    foilBeltTarget: constants.foilBeltTargetWeights,
    ucSlot3Upgraded: constants.ucSlot3UpgradedWeights,
    hyperspaceNonFoil: constants.hyperspaceNonFoilWeights,
  },

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
    // Box openings point to ~2 tier-1 prestige cards per 24-pack box.
    // If the API has not published ASH prestige variants yet, standard packs
    // no-op this outcome rather than synthesizing an unknown checklist.
    uc3ToPrestige: ASH_T1_PRESTIGE_RATE,
  },

  // NOTE: Triple-aspect cards need no special config — belt assignment uses
  // aspects[0] (primary-aspect priority) in assignCardToBelt for all cards.
}
