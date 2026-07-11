// @ts-nocheck
/**
 * Carbonite Booster Pack Generation
 *
 * Generates premium Carbonite packs where every card is a variant
 * (foil, hyperspace, prestige, or showcase).
 *
 * Pre-LAW Carbonite (JTL, LOF, SEC) — 16 cards:
 * [0]     Leader — always Hyperspace (showcase upgrade ~1/20)
 * [1-4]   Common Foil x 4 (from CarboniteSlotBelt)
 * [5-6]   Uncommon Foil x 2 (from CarboniteSlotBelt)
 * [7]     R/L Foil x 1 (from CarboniteFoilRLBelt, weighted 70/20/10)
 * [8]     Prestige (synthesized from R/L pool)
 * [9-11]  Common Hyperspace x 3 (from CarboniteSlotBelt)
 * [12]    Uncommon Hyperspace x 1 (from CarboniteSlotBelt)
 * [13]    R/L Hyperspace x 1 (from CarboniteSlotBelt, weighted 70/20/10)
 * [14-15] Hyperspace Foil x 2 (from HyperfoilBelt)
 *
 * LAW+ Carbonite (LAW) — 16 cards:
 * [0]     Leader — always Hyperspace (showcase upgrade ~1/48)
 * [1]     Prestige (synthesized from R/L pool)
 * [2-5]   HS Common x 4 (fixed Common, from CarboniteSlotBelt)
 * [6-8]   HS Flex x 3 (weighted: C:32, UC:63, R:3, S:1, L:1)
 * [9]     HS Top x 1 (always R/S/L, weighted: R:60, S:20, L:20)
 * [10-13] HSF Flex x 4 (weighted: C:43, UC:44, R:10, S:1.5, L:1.5)
 * [14-15] HSF Common x 2 (fixed Common)
 */

import type { SetCode } from '../types'
import type { RawCard } from './cardData'

import { LeaderBelt } from '../belts/LeaderBelt'
import { HyperfoilBelt } from '../belts/HyperfoilBelt'
import { CarboniteFoilRLBelt } from '../belts/CarboniteFoilRLBelt'
import { CarbonitePrestigeBelt } from '../belts/CarbonitePrestigeBelt'
import { CarboniteSlotBelt, type CarboniteSlotBeltConfig } from '../belts/CarboniteSlotBelt'
import { getSetConfig } from './setConfigs/index'
import { getCachedCards } from './cardCache'
import { CARBONITE_CONSTANTS, getBaseSetCode, isCarboniteSupported } from './carboniteConstants'

interface Pack {
  cards: RawCard[]
}

interface Belt {
  next(): RawCard | null
}

// === Belt Configs ===

const COMMON_FOIL_CONFIG: CarboniteSlotBeltConfig = {
  rarities: ['Common'],
  sourceVariant: 'Normal',
  outputFlags: { isFoil: true },
}

const UC_FOIL_CONFIG: CarboniteSlotBeltConfig = {
  rarities: ['Uncommon'],
  sourceVariant: 'Normal',
  outputFlags: { isFoil: true },
}

const COMMON_HS_CONFIG: CarboniteSlotBeltConfig = {
  rarities: ['Common'],
  sourceVariant: 'Hyperspace',
  outputFlags: { isHyperspace: true },
}

const UC_HS_CONFIG: CarboniteSlotBeltConfig = {
  rarities: ['Uncommon'],
  sourceVariant: 'Hyperspace',
  outputFlags: { isHyperspace: true },
}

const RL_HS_CONFIG: CarboniteSlotBeltConfig = {
  rarities: ['Rare', 'Special', 'Legendary'],
  sourceVariant: 'Hyperspace',
  outputFlags: { isHyperspace: true },
  weights: CARBONITE_CONSTANTS.hsRLWeights,
}

// LAW+ HS flex slots (3 of 8): weighted mixed-rarity
const LAW_HS_FLEX_CONFIG: CarboniteSlotBeltConfig = {
  rarities: ['Common', 'Uncommon', 'Rare', 'Special', 'Legendary'],
  sourceVariant: 'Hyperspace',
  outputFlags: { isHyperspace: true },
  weights: CARBONITE_CONSTANTS.hsFlexWeights,
}

// LAW+ HS top slot (1 of 8): always R/S/L
const LAW_HS_TOP_CONFIG: CarboniteSlotBeltConfig = {
  rarities: ['Rare', 'Special', 'Legendary'],
  sourceVariant: 'Hyperspace',
  outputFlags: { isHyperspace: true },
  weights: CARBONITE_CONSTANTS.hsTopWeights,
}

// LAW+ HSF fixed Common slots (2 of 6)
const LAW_HSF_COMMON_CONFIG: CarboniteSlotBeltConfig = {
  rarities: ['Common'],
  sourceVariant: 'Hyperspace',
  outputFlags: { isFoil: true, isHyperspace: true },
}

// LAW+ HSF flex slots (4 of 6): weighted mixed-rarity
const LAW_HSF_FLEX_CONFIG: CarboniteSlotBeltConfig = {
  rarities: ['Common', 'Uncommon', 'Rare', 'Special', 'Legendary'],
  sourceVariant: 'Hyperspace',
  outputFlags: { isFoil: true, isHyperspace: true },
  weights: CARBONITE_CONSTANTS.hsfFlexWeights,
}

// === Belt Cache ===

const carboniteBeltCache = new Map<string, Belt>()

function getCBLeaderBelt(setCode: SetCode | string): Belt {
  const key = `cb-leader-${setCode}`
  if (!carboniteBeltCache.has(key)) {
    carboniteBeltCache.set(key, new LeaderBelt(setCode))
  }
  return carboniteBeltCache.get(key)!
}

function getCBFoilRLBelt(setCode: SetCode | string): Belt {
  const key = `cb-foilrl-${setCode}`
  if (!carboniteBeltCache.has(key)) {
    carboniteBeltCache.set(key, new CarboniteFoilRLBelt(setCode))
  }
  return carboniteBeltCache.get(key)!
}

function getCBPrestigeBelt(setCode: SetCode | string): Belt {
  const key = `cb-prestige-${setCode}`
  if (!carboniteBeltCache.has(key)) {
    carboniteBeltCache.set(key, new CarbonitePrestigeBelt(setCode))
  }
  return carboniteBeltCache.get(key)!
}

function getCBHyperfoilBelt(setCode: SetCode | string): Belt {
  const key = `cb-hyperfoil-${setCode}`
  if (!carboniteBeltCache.has(key)) {
    carboniteBeltCache.set(key, new HyperfoilBelt(setCode))
  }
  return carboniteBeltCache.get(key)!
}

function getCBSlotBelt(setCode: SetCode | string, slotKey: string, config: CarboniteSlotBeltConfig): Belt {
  const key = `cb-${slotKey}-${setCode}`
  if (!carboniteBeltCache.has(key)) {
    carboniteBeltCache.set(key, new CarboniteSlotBelt(setCode, config))
  }
  return carboniteBeltCache.get(key)!
}

/**
 * Clear the Carbonite belt cache
 */
export function clearCarboniteBeltCache(): void {
  carboniteBeltCache.clear()
}

/**
 * Find the Hyperspace variant of a specific card
 */
function findHyperspaceVariant(card: RawCard | null, setCode: SetCode | string): RawCard | null {
  if (!card || !card.name) return null

  const allCards = getCachedCards(setCode)

  const hsVariant = allCards.find(c =>
    c.name === card.name &&
    c.variantType === 'Hyperspace' &&
    c.rarity === card.rarity &&
    c.type === card.type
  )

  if (hsVariant) {
    return { ...hsVariant, isHyperspace: true }
  }

  // Fallback: mark original card as Hyperspace
  return { ...card, variantType: 'Hyperspace', isHyperspace: true }
}

/**
 * Find the Showcase variant of a specific card
 */
function findShowcaseVariant(card: RawCard | null, setCode: SetCode | string): RawCard | null {
  if (!card || !card.name) return null

  const allCards = getCachedCards(setCode)

  const showcaseVariant = allCards.find(c =>
    c.name === card.name &&
    c.variantType === 'Showcase' &&
    c.type === card.type
  )

  if (showcaseVariant) {
    return { ...showcaseVariant, isShowcase: true }
  }
  return null
}

/**
 * Generate a single Carbonite booster pack
 *
 * @param compositeCode - Carbonite set code (e.g., 'JTL-CB')
 * @returns Pack object with cards array
 */
export function generateCarboniteBoosterPack(compositeCode: string): Pack {
  const baseCode = getBaseSetCode(compositeCode)

  if (!isCarboniteSupported(baseCode)) {
    throw new Error(`Carbonite packs not available for ${baseCode}`)
  }

  const config = getSetConfig(baseCode)
  if (!config) {
    throw new Error(`No config found for set ${baseCode}`)
  }

  // Tiered (LAW+) carbonite structure is a config flag, not a setNumber branch
  const isLawPlus = (config.packRules as any)?.carboniteTiered === true

  const packCards: RawCard[] = []

  // 1. Leader — always Hyperspace, with possible Showcase upgrade
  const leaderBelt = getCBLeaderBelt(baseCode)
  const leader = leaderBelt.next()
  if (leader) {
    const showcaseRate = isLawPlus
      ? CARBONITE_CONSTANTS.showcaseRate.law
      : CARBONITE_CONSTANTS.showcaseRate.preLaw

    if (Math.random() < showcaseRate) {
      const showcaseLeader = findShowcaseVariant(leader, baseCode)
      if (showcaseLeader) {
        packCards.push(showcaseLeader)
      } else {
        // Fallback to HS if no showcase variant exists
        const hsLeader = findHyperspaceVariant(leader, baseCode)
        packCards.push(hsLeader || leader)
      }
    } else {
      const hsLeader = findHyperspaceVariant(leader, baseCode)
      packCards.push(hsLeader || leader)
    }
  }

  if (isLawPlus) {
    // LAW+ Carbonite: Prestige, tiered HS (4C + 3flex + 1top), tiered HSF (4flex + 2C)
    const prestigeBelt = getCBPrestigeBelt(baseCode)
    const hsCommonBelt = getCBSlotBelt(baseCode, 'hs-common', COMMON_HS_CONFIG)
    const hsFlexBelt = getCBSlotBelt(baseCode, 'hs-flex', LAW_HS_FLEX_CONFIG)
    const hsTopBelt = getCBSlotBelt(baseCode, 'hs-top', LAW_HS_TOP_CONFIG)
    const hsfFlexBelt = getCBSlotBelt(baseCode, 'hsf-flex', LAW_HSF_FLEX_CONFIG)
    const hsfCommonBelt = getCBSlotBelt(baseCode, 'hsf-common', LAW_HSF_COMMON_CONFIG)

    // [1] Prestige
    const prestige = prestigeBelt.next()
    if (prestige) packCards.push(prestige)

    // [2-5] HS Common x 4 (fixed)
    for (let i = 0; i < CARBONITE_CONSTANTS.law.hsCommon; i++) {
      const card = hsCommonBelt.next()
      if (card) packCards.push(card)
    }

    // [6-8] HS Flex x 3 (weighted rarity)
    for (let i = 0; i < CARBONITE_CONSTANTS.law.hsFlex; i++) {
      const card = hsFlexBelt.next()
      if (card) packCards.push(card)
    }

    // [9] HS Top x 1 (always R/S/L)
    for (let i = 0; i < CARBONITE_CONSTANTS.law.hsTop; i++) {
      const card = hsTopBelt.next()
      if (card) packCards.push(card)
    }

    // [10-13] HSF Flex x 4 (weighted rarity)
    for (let i = 0; i < CARBONITE_CONSTANTS.law.hsfFlex; i++) {
      const card = hsfFlexBelt.next()
      if (card) packCards.push(card)
    }

    // [14-15] HSF Common x 2 (fixed)
    for (let i = 0; i < CARBONITE_CONSTANTS.law.hsfCommon; i++) {
      const card = hsfCommonBelt.next()
      if (card) packCards.push(card)
    }
  } else {
    // Pre-LAW Carbonite: rarity-specific belts
    const commonFoilBelt = getCBSlotBelt(baseCode, 'common-foil', COMMON_FOIL_CONFIG)
    const ucFoilBelt = getCBSlotBelt(baseCode, 'uc-foil', UC_FOIL_CONFIG)
    const foilRLBelt = getCBFoilRLBelt(baseCode)
    const prestigeBelt = getCBPrestigeBelt(baseCode)
    const commonHSBelt = getCBSlotBelt(baseCode, 'common-hs', COMMON_HS_CONFIG)
    const ucHSBelt = getCBSlotBelt(baseCode, 'uc-hs', UC_HS_CONFIG)
    const rlHSBelt = getCBSlotBelt(baseCode, 'rl-hs', RL_HS_CONFIG)
    const hyperfoilBelt = getCBHyperfoilBelt(baseCode)

    // [1-4] Common Foil x 4
    for (let i = 0; i < CARBONITE_CONSTANTS.preLaw.commonFoils; i++) {
      const foil = commonFoilBelt.next()
      if (foil) packCards.push(foil)
    }

    // [5-6] Uncommon Foil x 2
    for (let i = 0; i < CARBONITE_CONSTANTS.preLaw.uncommonFoils; i++) {
      const foil = ucFoilBelt.next()
      if (foil) packCards.push(foil)
    }

    // [7] R/L Foil x 1
    const rlFoil = foilRLBelt.next()
    if (rlFoil) packCards.push(rlFoil)

    // [8] Prestige x 1
    const prestige = prestigeBelt.next()
    if (prestige) packCards.push(prestige)

    // [9-11] Common Hyperspace x 3
    for (let i = 0; i < CARBONITE_CONSTANTS.preLaw.commonHS; i++) {
      const hsCard = commonHSBelt.next()
      if (hsCard) packCards.push(hsCard)
    }

    // [12] Uncommon Hyperspace x 1
    for (let i = 0; i < CARBONITE_CONSTANTS.preLaw.uncommonHS; i++) {
      const hsCard = ucHSBelt.next()
      if (hsCard) packCards.push(hsCard)
    }

    // [13] R/L Hyperspace x 1
    for (let i = 0; i < CARBONITE_CONSTANTS.preLaw.rlHS; i++) {
      const hsCard = rlHSBelt.next()
      if (hsCard) packCards.push(hsCard)
    }

    // [14-15] Hyperspace Foil x 2
    for (let i = 0; i < CARBONITE_CONSTANTS.preLaw.hsFoil; i++) {
      const hfCard = hyperfoilBelt.next()
      if (hfCard) packCards.push(hfCard)
    }
  }

  return { cards: packCards }
}
