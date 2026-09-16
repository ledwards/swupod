/**
 * Set Configuration for HMW - Homeworlds
 * Set 9
 *
 * Pack rules are a copy of ASH (Set 8) — i.e. the Block B rules calibrated
 * against 11 verified real ASH boxes — until FFG announces changes:
 * - No regular foils - foil slot is ALWAYS Hyperspace Foil
 * - Guaranteed Hyperspace card in every pack (slot 5)
 * - Prestige cards in standard boosters (~1.1 tier-1 prestige per box)
 * - Showcase leaders are significantly rarer
 *
 * Announced in the official first look (2026-07-26). What FFG has confirmed:
 * - Over 260 new cards; the set focuses on the planets of the galaxy
 * - New keyword **Fortify** — the upgrade attaches to your BASE, a first for
 *   the game. Nothing in pack generation cares (Fortify cards are ordinary
 *   Upgrades by type/rarity), but base-referencing cards are everywhere.
 * - Two new token types: Beast (3 power / 3 HP token units, the largest yet)
 *   and Weakness (the inverse of Experience). Tokens are not booster cards.
 * - Spotlight Decks are Chewbacca and Grand Moff Tarkin (whose leader unit
 *   side is the Death Star), each with 4 Special-rarity cards.
 * - Each primary aspect has FOUR Common bases, one per new base trait:
 *   Tatooine, Naboo, Endor, Kashyyyk. That is the one card count below that
 *   is sourced rather than copied — see cardCounts.bases.
 *
 * Source: https://starwarsunlimited.com/articles/homeworlds
 *
 * Dates: the 2026-10-09 street date is FFG-announced. 2026-10-02 was
 * originally derived from LAW and ASH (both exactly release − 7 days) and is
 * now corroborated by retail — pre-release kits fulfil Oct 2 and stores are
 * running events Oct 2-8.
 *
 * SET betaAccessDate WHEN YOU TURN HMW ON FOR BETA. Public access is then
 * betaAccessDate + BETA_EXCLUSIVITY_DAYS (10), capped at prereleaseDate. Leave
 * it unset and the set stays beta-only until 2026-10-02, which is the safe
 * fallback but gives beta a much longer window than intended if spoilers land
 * early. Neither date needs a deploy to take effect — the gate is computed.
 *
 * NOTE: Card counts other than bases are placeholder bucket assumptions copied
 * from ASH. swuapi has no HMW set record at all yet (checked 2026-09-15), so
 * `npm run fetch-cards` is a no-op for this set until they create one.
 */

import { SET_7_PLUS_CONSTANTS } from '../packConstants'
import type { SetConfig } from './index'

const constants = SET_7_PLUS_CONSTANTS
// Carried over from ASH's 11 verified boxes (261 packs): 12 tier-1 prestige =
// 4.6% of packs ≈ 1/22 → ~1.1/box. Re-measure against real HMW boxes once the
// set is out rather than assuming FFG held the rate constant.
const HMW_T1_PRESTIGE_RATE = 1 / 22

export const HMW_CONFIG: SetConfig = {
  setCode: 'HMW',
  setName: 'Homeworlds',
  setNumber: 9,
  color: '#2E7D32', // Verdant green/planets theme
  prereleaseDate: '2026-10-02', // FFG pre-release; confirmed by retail kits
  releaseDate: '2026-10-09',
  // betaAccessDate: set this the day HMW opens to beta testers — see header.

  // Card counts - placeholder bucket assumptions copied from ASH, EXCEPT
  // bases. The first look states each primary aspect gets four Common bases
  // (Tatooine / Naboo / Endor / Kashyyyk), so 4 aspects x 4 traits = 16. It
  // does not say whether Neutral bases exist on top of that, so 16 is a floor.
  cardCounts: {
    leaders: {
      common: 8,
      rare: 8,
      total: 18
    },
    bases: {
      common: 16,
      rare: 0,
      total: 16
    },
    commons: 100,
    uncommons: 60,
    rares: 50,
    legendaries: 20,
    specials: 10
  },

  // Pack construction rules - same as ASH
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
    // Copied from ASH's box-verified foil mix. Re-verify against real HMW
    // boxes; do not assume it transfers.
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
    // Sheet-cut and spaced by Set7PlusUc3OutcomeBelt so a box never clusters
    // 3+. With no HMW prestige variants published, standard packs no-op this
    // outcome rather than synthesizing an unknown checklist.
    uc3ToPrestige: HMW_T1_PRESTIGE_RATE,
  },
}
