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
// 11 fully-transcribed real boxes (Lee case + display box) show ~1.3 tier-1
// prestige per 24-pack box (9 per 166 packs) with a tight spread (max 2 ever,
// never 3+) — i.e. the LAW default of 1/18, delivered as ~1 guaranteed per box
// plus a ~1/3 chance of a second. The earlier 1/12 ("~2/box") override was an
// early guess the box data never bore out; it is the reason boxes could show 4.
const ASH_T1_PRESTIGE_RATE = 1 / 18

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
    // ASH override calibrated on 11 real boxes: every box independently ran
    // ~20 common foils / 24 (= 5/6 ≈ 83%), with R/S/L much rarer than the
    // LAW-derived C65/U20/R8/S4/L3 modeled. Combined ~60C/7U/2R/1S/2L per 72
    // foils → clean C83/U10/R3/S2/L2 (common share = 5/6).
    hyperspaceFoilSlot: {
      Common: 83,
      Uncommon: 10,
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
    // ~1.3 tier-1 prestige per 24-pack box (1/18), sheet-cut spaced by
    // Set7PlusUc3OutcomeBelt so a box lands on 1-2 and never clusters 3+.
    // If the API has not published ASH prestige variants yet, standard packs
    // no-op this outcome rather than synthesizing an unknown checklist.
    uc3ToPrestige: ASH_T1_PRESTIGE_RATE,
  },

  // NOTE: Triple-aspect cards need no special config — belt assignment uses
  // aspects[0] (primary-aspect priority) in assignCardToBelt for all cards.
}
