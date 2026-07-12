// @ts-nocheck
/**
 * Set Configuration for LAW - A Lawless Time
 * Set 7
 *
 * Major pack changes for this set (per FFG announcement):
 * - No regular foils - foil slot is ALWAYS Hyperspace Foil
 * - Guaranteed Hyperspace card in every pack (last common slot - TBD)
 * - Prestige cards in standard boosters (~1 in 18 packs)
 * - Showcase leaders are significantly rarer
 * - First set with triple-aspect cards (double primary aspect)
 *
 * Source: https://starwarsunlimited.com/articles/a-shift-from-what-was
 *
 * NOTE: Card counts are preliminary based on partial swuapi.com data.
 * Run `npm run fetch-cards` to update when full data is available.
 */

import { SET_7_PLUS_CONSTANTS } from '../packConstants'
import type { SetConfig } from './index'

const constants = SET_7_PLUS_CONSTANTS

export const LAW_CONFIG: SetConfig = {
  setCode: 'LAW',
  setName: 'A Lawless Time',
  setNumber: 7,
  color: '#8B4513', // Brown/western theme
  prereleaseDate: '2026-03-06',
  releaseDate: '2026-03-13',

  // Card counts (Normal variants only) - from swuapi.com data
  // Auto-refreshed via prebuild fetch-cards
  cardCounts: {
    leaders: {
      common: 8,
      rare: 8,
      total: 18   // includes 2 Special leaders (Leia Organa, Jabba)
    },
    bases: {
      common: 8,
      rare: 3,    // Alliance Outpost, Shipbreaking Yard, Citadel Research Center
      total: 12   // includes 1 Special base (Great Pit of Carkoon)
    },
    commons: 100,
    uncommons: 60,
    rares: 47,
    legendaries: 20,
    specials: 10
  },

  // Pack construction rules - LAW-specific
  packRules: {
    // Rare bases go in the rare slot (same as all previous sets)
    rareBasesInRareSlot: true,

    // No regular foils - foil slot is always Hyperspace Foil
    // HyperfoilBelt falls back to Normal variants when no HSF data exists
    foilSlotIsHyperspaceFoil: true,

    // Dedicated HS common in every pack (slot 5 from HyperspaceCommonBelt)
    guaranteedHyperspaceCommon: true,
    hyperspaceCommonSlot: 5, // Slot 5 (1-indexed) - dedicated HS common belt

    // Prestige cards can appear in standard packs
    prestigeInStandardPacks: true,

    // Special rarity can appear in foil/hyperspace slots
    specialInFoilSlot: constants.specialInFoilSlot,
    specialInHyperspaceSlots: constants.specialInHyperspaceSlot ?? false,
    specialShowcaseLeaders: true,
    baseLineAspectConflict: constants.baseLineAspectConflict,
    uncommonAspectInterleave: constants.uncommonAspectInterleave,
    lineStackingCollation: constants.lineStackingCollation,
    carboniteTiered: constants.carboniteTiered,
  },

  // Rarity weights for different slots
  rarityWeights: {
    // Foil slot is now always Hyperspace Foil
    hyperspaceFoilSlot: constants.hyperspaceFoilSlotWeights || {
      Common: 65,
      Uncommon: 20,
      Rare: 8,
      Special: 4,
      Legendary: 3,
    },
    foilBeltTarget: constants.foilBeltTargetWeights,
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

  // Upgrade probabilities (belt-driven via HyperspaceUpgradeBelt with 'LAW' config)
  // Slot 5 is a dedicated HS common from HyperspaceCommonBelt (not an upgrade).
  // UC3 can upgrade to Prestige tier 1 (~1/18) OR HS R/L (belt-driven).
  // R/L slot CANNOT upgrade at all.
  upgradeProbabilities: {
    // Leader upgrades
    leaderToHyperspace: constants.leaderHyperspaceRate,       // 1/6 (belt: 10/60)
    leaderToShowcase: constants.showcaseLeaderRate,            // ~1/576 (independent)

    // Base upgrade
    baseToHyperspace: constants.baseHyperspaceRate,            // 1/6 (belt: 10/60)

    // Foil slot - NO upgrade needed, it's always Hyperspace Foil
    foilToHyperfoil: 0, // Handled by foilSlotIsHyperspaceFoil rule

    // UC slot upgrades
    thirdUCToHyperspaceRL: constants.ucSlot3UpgradeRate,      // 1/3 (belt: 20/60, fallback if prestige misses; rarity from ucSlot3UpgradedWeights)
    firstUCToHyperspaceUC: constants.uncommonHyperspaceRate,   // 0 — UC3 is the only UC upgrade slot (real ASH box: 0/48)
    secondUCToHyperspaceUC: constants.uncommonHyperspaceRate,  // 0 — UC3 is the only UC upgrade slot

    // Common upgrades - NONE for LAW (slot 5 is dedicated belt, other commons don't upgrade)
    commonToHyperspace: 0,

    // NOTE: Rare slot NEVER upgrades to HS. HS rares only appear via UC3 upgrade.
    // R/L slot CANNOT upgrade to Prestige in LAW (prestige moved to UC3)
    rareToPrestige: 0,

    // UC3 → Prestige tier 1 (~1/18) — checked BEFORE HS R/L, takes priority
    uc3ToPrestige: constants.uc3PrestigeRate || 1/18,
  },

  // NOTE: Triple-aspect cards need no special config — belt assignment uses
  // aspects[0] (primary-aspect priority) in assignCardToBelt for all cards.
}
