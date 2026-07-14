// @ts-nocheck
/**
 * Set Configuration for ASH - Ashes of the Empire
 * Set 8
 *
 * Pack rules are a copy of LAW (Set 7) until FFG announces changes:
 * - No regular foils - foil slot is ALWAYS Hyperspace Foil
 * - Guaranteed Hyperspace card in every pack (last common slot)
 * - Prestige cards in standard boosters (~1.1 tier-1 prestige per box, 11-box measured)
 * - Showcase leaders are significantly rarer
 * - LAW-style multicolor symmetry with fewer multicolor cards than LAW
 *
 * NOTE: Card counts are placeholder bucket assumptions until full data exists.
 * Run `npm run fetch-cards` to update when full data is available.
 */

import { SET_7_PLUS_CONSTANTS } from '../packConstants'
import type { SetConfig } from './index'

const constants = SET_7_PLUS_CONSTANTS
// 11 verified real boxes (261 packs, 2026-07-12): 12 tier-1 prestige = 4.6% of
// packs ≈ 1/22 → ~1.1/box. (Earlier 1/12 "~2/box" came from box-001 alone.)
const ASH_T1_PRESTIGE_RATE = 1 / 22

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
    uncommonAspectInterleave: constants.uncommonAspectInterleave,
    lineStackingCollation: constants.lineStackingCollation,
    carboniteTiered: constants.carboniteTiered,
  },

  rarityWeights: {
    // 11 verified real boxes (261 foils, 2026-07-12): C82.4/U11.1/R3.1/S1.5/L1.9,
    // every box ≥77% common. Replaces the box-001-only C72 fit.
    hyperspaceFoilSlot: {
      Common: 82,
      Uncommon: 11,
      Rare: 3,
      Special: 2,
      Legendary: 2,
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
    uncommon: constants.uncommonDedupWindow,
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
    // ~1.1 tier-1 prestige per 24-pack box (11 verified boxes: mode 1, max 2).
    // If the API has not published ASH prestige variants yet, standard packs
    // no-op this outcome rather than synthesizing an unknown checklist.
    uc3ToPrestige: ASH_T1_PRESTIGE_RATE,
  },

  // NOTE: Triple-aspect cards need no special config — belt assignment uses
  // aspects[0] (primary-aspect priority) in assignCardToBelt for all cards.
}
