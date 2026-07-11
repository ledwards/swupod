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
import { CARBONITE_CONSTANTS, getCarboniteConstants, ASH_CARBONITE_LAYOUT, getBaseSetCode, isCarboniteSupported } from './carboniteConstants'

interface Pack {
  cards: RawCard[]
}

interface Belt {
  next(): RawCard | null
}

/**
 * Treatment identity of a printing. Two cards are the SAME physical card iff same
 * underlying card AND same treatment (foil/hyperspace flags + variantType). The HS
 * and HSF blocks are synthesized from the same Hyperspace source (shared id/number),
 * so isFoil/isHyperspace are what distinguish them. Cross-treatment pairs (a card's
 * HS + its HSF, or a Normal-foil + its HS) are DIFFERENT keys and remain allowed —
 * matching the real-box rule (only same-treatment within-pack dups are a bug).
 */
function dedupKey(c: RawCard): string {
  const anyC = c as any
  const base = anyC.id ?? `${c.name}|${anyC.number}`
  return `${base}|${c.variantType}|${c.isFoil ? 1 : 0}|${c.isHyperspace ? 1 : 0}`
}

/**
 * Draw one card from a belt whose treatment is not already present in `seen`
 * (placement dedup — belt-system.md: "Dedup by PLACEMENT, not exclusion").
 *
 * A collided card is rotated back onto its OWN belt's hopper tail (no exclusion —
 * once-per-boot preserved) and the same belt is redrawn, so the slot's rarity/variant
 * contract is preserved exactly. Bounded by `maxTries` as a safety valve so a pack is
 * never short-changed; carbonite pools (45–264 cards) make the cap unreachable in
 * practice. Carbonite-only: the standard pack path uses separate belt instances.
 */
function drawUnique(belt: Belt, seen: Set<string>, maxTries = 48): RawCard | null {
  const held: RawCard[] = []
  let card = belt.next()
  let tries = 0
  while (card && seen.has(dedupKey(card)) && tries < maxTries) {
    held.push(card)
    card = belt.next()
    tries++
  }
  const hopper = (belt as any).hopper
  if (held.length && Array.isArray(hopper)) hopper.push(...held)
  if (card) seen.add(dedupKey(card))
  return card
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

// === ASH-specific configs (calibrated 48-pack case; see ASH_CARBONITE_LAYOUT) ===
// Rarities are derived from weight keys so any dropped rarity is truly excluded (the
// weighted belt floors every in-pool rarity to ≥1 copy/boot, so weight 0 alone leaks it).
const ASH_HS_ELEVATED_CONFIG: CarboniteSlotBeltConfig = {
  rarities: Object.keys(ASH_CARBONITE_LAYOUT.hsElevatedWeights),
  sourceVariant: 'Hyperspace',
  outputFlags: { isHyperspace: true },
  weights: ASH_CARBONITE_LAYOUT.hsElevatedWeights,
}
const ASH_HSF_TOP_CONFIG: CarboniteSlotBeltConfig = {
  rarities: Object.keys(ASH_CARBONITE_LAYOUT.hsfTopWeights),
  sourceVariant: 'Hyperspace',
  outputFlags: { isFoil: true, isHyperspace: true },
  weights: ASH_CARBONITE_LAYOUT.hsfTopWeights,
}
const ASH_HSF_FLEX_CONFIG: CarboniteSlotBeltConfig = {
  rarities: Object.keys(ASH_CARBONITE_LAYOUT.hsfFlexWeights),
  sourceVariant: 'Hyperspace',
  outputFlags: { isFoil: true, isHyperspace: true },
  weights: ASH_CARBONITE_LAYOUT.hsfFlexWeights,
}

// Collation rank observed in real ASH packs: C < U < Special < R < L
const CARBONITE_RARITY_RANK: Record<string, number> = { Common: 0, Uncommon: 1, Special: 2, Rare: 3, Legendary: 4 }

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

  const setNumber = config.setNumber
  const isLawPlus = setNumber >= 7

  const packCards: RawCard[] = []
  // Treatments already placed in THIS pack (deck cards only — leaders/prestige can't
  // collide with deck belts). Guarantees no identical printing appears twice while
  // still allowing cross-treatment pairs (HS + HSF of the same card). See drawUnique.
  const seen = new Set<string>()

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

  if (isLawPlus && baseCode === 'ASH') {
    // === ASH carbonite — calibrated from a real 48-pack case ===
    // leader, 8 HS (ascending, R/L top at pos 9), prestige (pos 10), 6 HSF (descending, ≥U top at pos 11)
    const A = ASH_CARBONITE_LAYOUT
    const rankOf = (c: RawCard) => CARBONITE_RARITY_RANK[(c as { rarity: string }).rarity] ?? 0

    const prestigeBelt = getCBPrestigeBelt(baseCode)
    const hsCommonBelt = getCBSlotBelt(baseCode, 'hs-common', COMMON_HS_CONFIG)
    const hsElevatedBelt = getCBSlotBelt(baseCode, 'ash-hs-elev', ASH_HS_ELEVATED_CONFIG)
    const hsTopWeights = getCarboniteConstants(baseCode).hsTopWeights
    const hsTopConfig: CarboniteSlotBeltConfig = { ...LAW_HS_TOP_CONFIG, rarities: Object.keys(hsTopWeights), weights: hsTopWeights }
    const hsTopBelt = getCBSlotBelt(baseCode, 'hs-top', hsTopConfig)
    const hsfCommonBelt = getCBSlotBelt(baseCode, 'hsf-common', LAW_HSF_COMMON_CONFIG)
    const hsfFlexBelt = getCBSlotBelt(baseCode, 'ash-hsf-flex', ASH_HSF_FLEX_CONFIG)
    const hsfTopBelt = getCBSlotBelt(baseCode, 'ash-hsf-top', ASH_HSF_TOP_CONFIG)

    // [2-9] HS run: (4 Common + 1 swing(79% C / 21% elevated) + 2 elevated) sorted ascending,
    // then the dedicated R/L top at pos 9.
    const hsRest: RawCard[] = []
    for (let i = 0; i < A.hsCommon; i++) { const c = drawUnique(hsCommonBelt, seen); if (c) hsRest.push(c) }
    { const swingBelt = Math.random() < A.hsSwingCommonRate ? hsCommonBelt : hsElevatedBelt
      const c = drawUnique(swingBelt, seen); if (c) hsRest.push(c) }
    for (let i = 0; i < A.hsElevated; i++) { const c = drawUnique(hsElevatedBelt, seen); if (c) hsRest.push(c) }
    hsRest.sort((a, b) => rankOf(a) - rankOf(b)) // ascending collation (commons → uncommons)
    packCards.push(...hsRest)
    const hsTop = drawUnique(hsTopBelt, seen)
    if (hsTop) packCards.push(hsTop) // pos 9: guaranteed R/L top

    // [10] Prestige — real ASH packs place it after the HS run
    const prestige = prestigeBelt.next()
    if (prestige) packCards.push(prestige)

    // [11-16] HSF run: the dedicated ≥Uncommon top at pos 11, then (3 Common + 2 flex) sorted descending.
    const hsfTop = drawUnique(hsfTopBelt, seen)
    if (hsfTop) packCards.push(hsfTop) // pos 11: guaranteed ≥U top
    const hsfRest: RawCard[] = []
    for (let i = 0; i < A.hsfCommon; i++) { const c = drawUnique(hsfCommonBelt, seen); if (c) hsfRest.push(c) }
    for (let i = 0; i < A.hsfFlex; i++) { const c = drawUnique(hsfFlexBelt, seen); if (c) hsfRest.push(c) }
    hsfRest.sort((a, b) => rankOf(b) - rankOf(a)) // descending collation (elevated → commons)
    packCards.push(...hsfRest)
  } else if (isLawPlus) {
    // LAW+ Carbonite: Prestige, tiered HS (4C + 3flex + 1top), tiered HSF (4flex + 2C)
    const prestigeBelt = getCBPrestigeBelt(baseCode)
    const hsCommonBelt = getCBSlotBelt(baseCode, 'hs-common', COMMON_HS_CONFIG)
    const hsFlexBelt = getCBSlotBelt(baseCode, 'hs-flex', LAW_HS_FLEX_CONFIG)
    // HS top weights are per-set (ASH is R/L only, no Special — see carboniteConstants).
    // Rarities are derived from the weight keys so a dropped rarity is truly excluded
    // (the belt floors each in-pool rarity to >=1 copy/boot, so weight 0 alone leaks it).
    const hsTopWeights = getCarboniteConstants(baseCode).hsTopWeights
    const hsTopConfig: CarboniteSlotBeltConfig = { ...LAW_HS_TOP_CONFIG, rarities: Object.keys(hsTopWeights), weights: hsTopWeights }
    const hsTopBelt = getCBSlotBelt(baseCode, 'hs-top', hsTopConfig)
    const hsfFlexBelt = getCBSlotBelt(baseCode, 'hsf-flex', LAW_HSF_FLEX_CONFIG)
    const hsfCommonBelt = getCBSlotBelt(baseCode, 'hsf-common', LAW_HSF_COMMON_CONFIG)

    // [1] Prestige
    const prestige = prestigeBelt.next()
    if (prestige) packCards.push(prestige)

    // [2-5] HS Common x 4 (fixed)
    for (let i = 0; i < CARBONITE_CONSTANTS.law.hsCommon; i++) {
      const card = drawUnique(hsCommonBelt, seen)
      if (card) packCards.push(card)
    }

    // [6-8] HS Flex x 3 (weighted rarity)
    for (let i = 0; i < CARBONITE_CONSTANTS.law.hsFlex; i++) {
      const card = drawUnique(hsFlexBelt, seen)
      if (card) packCards.push(card)
    }

    // [9] HS Top x 1 (always R/S/L)
    for (let i = 0; i < CARBONITE_CONSTANTS.law.hsTop; i++) {
      const card = drawUnique(hsTopBelt, seen)
      if (card) packCards.push(card)
    }

    // [10-13] HSF Flex x 4 (weighted rarity)
    for (let i = 0; i < CARBONITE_CONSTANTS.law.hsfFlex; i++) {
      const card = drawUnique(hsfFlexBelt, seen)
      if (card) packCards.push(card)
    }

    // [14-15] HSF Common x 2 (fixed)
    for (let i = 0; i < CARBONITE_CONSTANTS.law.hsfCommon; i++) {
      const card = drawUnique(hsfCommonBelt, seen)
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
      const foil = drawUnique(commonFoilBelt, seen)
      if (foil) packCards.push(foil)
    }

    // [5-6] Uncommon Foil x 2
    for (let i = 0; i < CARBONITE_CONSTANTS.preLaw.uncommonFoils; i++) {
      const foil = drawUnique(ucFoilBelt, seen)
      if (foil) packCards.push(foil)
    }

    // [7] R/L Foil x 1
    const rlFoil = drawUnique(foilRLBelt, seen)
    if (rlFoil) packCards.push(rlFoil)

    // [8] Prestige x 1
    const prestige = prestigeBelt.next()
    if (prestige) packCards.push(prestige)

    // [9-11] Common Hyperspace x 3
    for (let i = 0; i < CARBONITE_CONSTANTS.preLaw.commonHS; i++) {
      const hsCard = drawUnique(commonHSBelt, seen)
      if (hsCard) packCards.push(hsCard)
    }

    // [12] Uncommon Hyperspace x 1
    for (let i = 0; i < CARBONITE_CONSTANTS.preLaw.uncommonHS; i++) {
      const hsCard = drawUnique(ucHSBelt, seen)
      if (hsCard) packCards.push(hsCard)
    }

    // [13] R/L Hyperspace x 1
    for (let i = 0; i < CARBONITE_CONSTANTS.preLaw.rlHS; i++) {
      const hsCard = drawUnique(rlHSBelt, seen)
      if (hsCard) packCards.push(hsCard)
    }

    // [14-15] Hyperspace Foil x 2
    for (let i = 0; i < CARBONITE_CONSTANTS.preLaw.hsFoil; i++) {
      const hfCard = drawUnique(hyperfoilBelt, seen)
      if (hfCard) packCards.push(hfCard)
    }
  }

  return { cards: packCards }
}
