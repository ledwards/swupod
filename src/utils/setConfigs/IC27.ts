/**
 * Set Configuration for IC27 - Icons 2027 Edition
 *
 * CHAOS ONLY. Icons is a NON-CORE product: no set number, rotates nothing,
 * never drafted or sealed on its own. It therefore lives in
 * CHAOS_ONLY_SET_CONFIGS, never SET_CONFIGS — every draft/sealed/rotisserie
 * picker, rotation batch, Play card pool and "latest set" lookup iterates
 * SET_CONFIGS, so keeping it out of that registry is what keeps it out of
 * all of them. getSetConfig() still resolves it so Chaos packs can print, and
 * getUnavailableSetReason() rejects it for every non-Chaos entry point.
 *
 * PACK: 9 cards (FFG's pouch reads "9-CARD BOOSTER PACK"), printed by
 * generateIconsBoosterPack (packRules.packLayout 'icons9'): 3 commons, a slot
 * that is a leader 1 in 4 and a common otherwise, a guaranteed Hyperspace
 * common, 2 uncommons (the second can print a Hyperspace UC/R/S/L), a rare or
 * legendary, and a Hyperspace Foil of any rarity. No base slot. Slot list from
 * Card Gamer's pre-release breakdown; FFG published no rates.
 *
 * `setNumber: 9` is the PRESS ERA, not a set number: it selects the Block B
 * belts (common lanes, HS upgrade sheet, UC3 outcome sheet) the 9-card pack
 * reuses. Nothing that sorts or rotates by setNumber can see this config.
 *
 * Card counts are DERIVED from the synced swuapi catalog (IC27, Normal
 * variants): 50 C / 50 U / 50 R / 20 L, 8 leaders, 4 bases, 12 Specials.
 * - Leaders: 6 Common + 2 Special (Darth Vader, Princess Leia). The Specials
 *   are spotlight leaders — excluded from the leader slot exactly as HMW's
 *   Spotlight leaders are, but eligible for Showcase (specialShowcaseLeaders).
 *   There are no Rare leaders, so every leader slot is a Common.
 * - Bases: all four (Echo Base, KCM Mining Facility, City in the Clouds,
 *   Mos Eisley) are Special rarity. There is no base slot, so a base only
 *   turns up where a Special can (the Hyperspace Foil, the upgraded uncommon).
 * - No regular Foil and no Prestige variants — Hyperspace / Hyperspace Foil /
 *   Showcase only, which is the Block B shape.
 *
 * Rates are BEST GUESSES: the 1-in-4 leader slot is Card Gamer's figure, and
 * the upgrade and foil weights are copied from HMW. Re-measure from real boxes.
 */

import { SET_7_PLUS_CONSTANTS } from '../packConstants'
import type { SetConfig } from './index'

const constants = SET_7_PLUS_CONSTANTS

export const IC27_CONFIG: SetConfig = {
  setCode: 'IC27',
  setName: 'Icons 2027 Edition',
  setNumber: 9, // press era (Block B), NOT a set number — see header
  chaosOnly: true,
  color: '#B8860B', // Gold — the Icons trade dress

  cardCounts: {
    leaders: {
      common: 6,
      rare: 0,
      total: 8
    },
    bases: {
      common: 0,
      rare: 0,
      total: 4
    },
    commons: 50,
    uncommons: 50,
    rares: 50,
    legendaries: 20,
    specials: 12
  },

  packRules: {
    packLayout: 'icons9',
    rareBasesInRareSlot: true,
    foilSlotIsHyperspaceFoil: true,
    guaranteedHyperspaceCommon: true,
    hyperspaceCommonSlot: 5,
    prestigeInStandardPacks: false,
    specialInFoilSlot: constants.specialInFoilSlot,
    specialInHyperspaceSlots: constants.specialInHyperspaceSlot ?? false,
    specialShowcaseLeaders: true,
    baseLineAspectConflict: false, // no base slot
    uncommonAspectInterleave: constants.uncommonAspectInterleave,
    lineStackingCollation: constants.lineStackingCollation,
    carboniteTiered: constants.carboniteTiered,
  },

  rarityWeights: {
    hyperspaceFoilSlot: {
      Common: 83,
      Uncommon: 10,
      Rare: 3,
      Special: 2,
      Legendary: 2,
    },
    hyperspaceFoilSheetCopies: {
      Common: 15,
      Uncommon: 3,
      Rare: 1,
      Special: 5,
      Legendary: 2,
    },
    foilBeltTarget: constants.foilBeltTargetWeights,
    ucSlot3Upgraded: constants.ucSlot3UpgradedWeights,
    hyperspaceNonFoil: constants.hyperspaceNonFoilWeights,
  },

  beltRatios: {
    rareToLegendary: constants.rareSlotLegendaryRatio,
    hyperspaceRareToLegendary: constants.hsRareSlotLegendaryRatio,
    leaderPrints: { common: 4, rare: 1 },
  },

  dedupWindows: {
    rareLegendary: constants.rareLegendaryDedupWindow,
    leaderCap: constants.leaderDedupWindowCap,
    hyperspaceLeaderCap: constants.hyperspaceLeaderDedupWindowCap,
    uncommon: constants.uncommonDedupWindow,
  },

  upgradeProbabilities: {
    leaderToHyperspace: constants.leaderHyperspaceRate,
    leaderToShowcase: constants.showcaseLeaderRate,
    baseToHyperspace: 0,
    foilToHyperfoil: 0,
    thirdUCToHyperspaceRL: constants.ucSlot3UpgradeRate,
    firstUCToHyperspaceUC: constants.uncommonHyperspaceRate,
    secondUCToHyperspaceUC: constants.uncommonHyperspaceRate,
    commonToHyperspace: 0,
    rareToPrestige: 0,
    uc3ToPrestige: 0,
  },
}
