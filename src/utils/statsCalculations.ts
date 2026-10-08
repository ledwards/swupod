// @ts-nocheck
// Statistical analysis utilities for card generation statistics

import { getSetConfig } from './setConfigs/index'
import type { RawCard } from './cardData'
import type { SetCode } from '../types'

type Treatment = 'base' | 'hyperspace' | 'foil' | 'hyperspace_foil' | 'showcase'

interface SignificanceResult {
  status: 'expected' | 'outlier' | 'extreme'
  color: string
  description: string
}

interface TreatmentStats {
  observed: number
  expected: number
  probability: number
  zScore?: number
  percentDiff?: number
  significance?: SignificanceResult
  isApplicable: boolean
}

interface CardStats {
  base?: number
  hyperspace?: number
  foil?: number
  hyperspace_foil?: number
  showcase?: number
  [key: string]: number | undefined
}

interface PackConstruction {
  totalCards: number
  leaders: number
  bases: number
  commons: number
  uncommons: string
  raresLegendaries: string
  foils: number
}

interface CardCounts {
  leaders: number
  bases: number
  commons: number
  uncommons: number
  rares: number
  legendaries: number
  specials: number
}

interface DropRates {
  legendaryInRareLegendarySlot: string
  rareLegendaryUpgrade: string
  foilCommon: string
  foilUncommon: string
  foilRare: string
  foilLegendary: string
  foilSpecial: string
}

interface SetReferenceData {
  setCode: SetCode | string
  setName: string
  setColor: string
  packConstruction: PackConstruction
  cardCounts: CardCounts
  dropRates: DropRates
}

/**
 * Calculate expected number of generations for a card given probability and total opportunities
 */
export function calculateExpectedCount(probability: number, totalOpportunities: number): number {
  return probability * totalOpportunities
}

/**
 * Calculate Z-score for a proportion test
 */
export function calculateZScore(observed: number, expected: number, n: number, p: number): number {
  if (n === 0 || p === 0 || p === 1) return 0
  const standardError = Math.sqrt(n * p * (1 - p))
  if (standardError === 0) return 0
  return (observed - expected) / standardError
}

/**
 * Categorize statistical significance based on Z-score
 */
export function categorizeSignificance(zScore: number): SignificanceResult {
  const absZ = Math.abs(zScore)

  if (absZ < 1.96) {
    return {
      status: 'expected',
      color: '#27AE60',
      description: 'Within expected range (95% CI)'
    }
  } else if (absZ < 2.58) {
    return {
      status: 'outlier',
      color: '#F39C12',
      description: 'Statistical outlier (95-99% CI)'
    }
  } else {
    return {
      status: 'extreme',
      color: '#E74C3C',
      description: 'Extreme outlier (>99% CI) - possible issue'
    }
  }
}

/**
 * Calculate percentage difference
 */
export function calculatePercentDifference(observed: number, expected: number): number {
  if (expected === 0) return 0
  return ((observed - expected) / expected) * 100
}

/**
 * Get probability for a specific card treatment
 * Treatment = variant type (base=Normal, hyperspace=Hyperspace, etc.)
 *
 * @param card - Card object (Normal variant for reference)
 * @param treatment - Treatment type
 * @param setCode - Set code
 * @returns Probability per pack (0-1)
 */
export function getCardTreatmentProbability(card: RawCard, treatment: Treatment, setCode: SetCode | string): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setConfig = getSetConfig(setCode as SetCode) as any
  if (!setConfig) return 0

  const cardCounts = setConfig.cardCounts || {}
  const upgrades = setConfig.upgradeProbabilities || {}
  const rarity = card.rarity

  // Special rarity cards don't appear in regular slots (base treatment)
  // They only appear in foil/hyperfoil slots in sets 4-6
  if (rarity === 'Special') {
    return getSpecialCardProbability(card, treatment, setCode)
  }

  // === LEADERS ===
  if (card.isLeader) {
    const totalLeaders = cardCounts.leaders?.total || 18
    const baseProb = 1 / totalLeaders
    const showcaseRate = upgrades.leaderToShowcase || 0
    const hsRate = upgrades.leaderToHyperspace || 0

    if (treatment === 'base') {
      // Leader appears as base when NOT upgraded to showcase or hyperspace
      return baseProb * (1 - showcaseRate) * (1 - hsRate)
    } else if (treatment === 'hyperspace') {
      // Leader appears as hyperspace when upgraded (but not showcase first)
      return baseProb * (1 - showcaseRate) * hsRate
    } else if (treatment === 'showcase') {
      // Leader appears as showcase when upgraded
      return baseProb * showcaseRate
    } else if (treatment === 'foil' || treatment === 'hyperspace_foil') {
      // Leaders don't appear in foil slot
      return 0
    }
    return 0
  }

  // === BASES ===
  if (card.isBase) {
    const totalBases = cardCounts.bases?.total || 12
    const baseProb = 1 / totalBases
    const hsRate = upgrades.baseToHyperspace || 0

    if (treatment === 'base') {
      return baseProb * (1 - hsRate)
    } else if (treatment === 'hyperspace') {
      return baseProb * hsRate
    } else if (treatment === 'showcase') {
      // Bases can't be showcase
      return 0
    } else if (treatment === 'foil' || treatment === 'hyperspace_foil') {
      // Bases don't appear in foil slot
      return 0
    }
    return 0
  }

  // === REGULAR CARDS (Commons, Uncommons, Rares, Legendaries) ===

  // Showcase is only for leaders
  if (treatment === 'showcase') {
    return 0
  }

  // Get base slot probability for this card
  const slotProb = getSlotProbability(card, setCode)

  if (treatment === 'base') {
    // Base treatment - card appears and is NOT upgraded to hyperspace
    const hsUpgradeRate = getHyperspaceUpgradeRate(card, setCode)
    return slotProb * (1 - hsUpgradeRate)
  } else if (treatment === 'hyperspace') {
    // Hyperspace treatment - card appears AND is upgraded
    const hsUpgradeRate = getHyperspaceUpgradeRate(card, setCode)
    return slotProb * hsUpgradeRate
  } else if (treatment === 'foil') {
    // Foil slot probability (base/normal variant)
    const hyperfoilRate = upgrades.foilToHyperfoil || 0
    return getFoilSlotProbability(card, setCode) * (1 - hyperfoilRate)
  } else if (treatment === 'hyperspace_foil') {
    // Hyperfoil - foil that got upgraded to hyperspace
    const hyperfoilRate = upgrades.foilToHyperfoil || 0
    return getFoilSlotProbability(card, setCode) * hyperfoilRate
  }

  return 0
}

/**
 * Get base slot probability for a regular card (before upgrades)
 */
function getSlotProbability(card: RawCard, setCode: SetCode | string): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setConfig = getSetConfig(setCode as SetCode) as any
  if (!setConfig || !setConfig.cardCounts) return 0

  const cardCounts = setConfig.cardCounts
  const rarity = card.rarity

  // Get counts for this rarity
  let totalInRarity = 0
  if (rarity === 'Common') {
    totalInRarity = cardCounts.commons || 90
  } else if (rarity === 'Uncommon') {
    totalInRarity = cardCounts.uncommons || 60
  } else if (rarity === 'Rare') {
    totalInRarity = cardCounts.rares || 48
  } else if (rarity === 'Legendary') {
    totalInRarity = cardCounts.legendaries || 16
  }

  if (totalInRarity === 0) return 0

  // Calculate expected slots per pack for this rarity
  const beltRatios = setConfig.beltRatios || {}
  const rareToLegendary = beltRatios.rareToLegendary || 6
  const legendaryRate = 1 / (rareToLegendary + 1)
  const ucSlot3UpgradeRate = setConfig.upgradeProbabilities?.thirdUCToHyperspaceRL || 0.18

  if (rarity === 'Common') {
    // 9 common slots per pack
    return 9 / totalInRarity
  } else if (rarity === 'Uncommon') {
    // 2-3 uncommon slots (3rd can upgrade)
    const avgUCSlots = 2 + (1 - ucSlot3UpgradeRate)
    return avgUCSlots / totalInRarity
  } else if (rarity === 'Rare') {
    // 1 rare/legendary slot + possible upgrade from UC3
    const baseSlotProb = (1 - legendaryRate) / totalInRarity
    const upgradeSlotProb = ucSlot3UpgradeRate * (1 - legendaryRate) / totalInRarity
    return baseSlotProb + upgradeSlotProb
  } else if (rarity === 'Legendary') {
    const baseSlotProb = legendaryRate / totalInRarity
    const upgradeSlotProb = ucSlot3UpgradeRate * legendaryRate / totalInRarity
    return baseSlotProb + upgradeSlotProb
  }

  return 0
}

/**
 * Get hyperspace upgrade rate for a card based on its rarity/type
 */
function getHyperspaceUpgradeRate(card: RawCard, setCode: SetCode | string): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setConfig = getSetConfig(setCode as SetCode) as any
  if (!setConfig) return 0

  const upgrades = setConfig.upgradeProbabilities || {}
  const rarity = card.rarity

  // Different upgrade rates for different rarities
  if (rarity === 'Common') {
    // ~1/3 of packs have ONE common upgraded, selected from 9 commons
    // So per-card rate is: upgradeRate * (1/9)
    const commonHSRate = upgrades.commonToHyperspace || 0
    return commonHSRate / 9
  } else if (rarity === 'Uncommon') {
    // UC slots 1 and 2 can each upgrade independently
    const uc1Rate = upgrades.firstUCToHyperspaceUC || 0
    const uc2Rate = upgrades.secondUCToHyperspaceUC || 0
    // For a specific uncommon in either slot, upgrade rate is the slot's rate
    // Simplified: average of the two rates (since card could be in either slot)
    return (uc1Rate + uc2Rate) / 2
  } else if (rarity === 'Rare' || rarity === 'Legendary') {
    // Rare slot never upgrades to HS (it's always Normal)
    // The HS R/L comes from UC slot 3 upgrade, which is a RANDOM card
    // So the regular rare/legendary in pack doesn't get upgraded
    return 0
  }

  return 0
}

/**
 * Get probability for a card in the foil slot
 */
function getFoilSlotProbability(card: RawCard, setCode: SetCode | string): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setConfig = getSetConfig(setCode as SetCode) as any
  if (!setConfig || !setConfig.cardCounts) return 0

  const cardCounts = setConfig.cardCounts
  const rarity = card.rarity
  const foilWeights = setConfig.rarityWeights?.foilSlot || {
    Common: 70,
    Uncommon: 20,
    Rare: 8,
    Legendary: 2
  }

  const totalWeight = Object.values(foilWeights).reduce((a: number, b: unknown) => a + (b as number), 0)
  const rarityWeight = foilWeights[rarity] || 0
  const rarityRate = rarityWeight / totalWeight

  // Count cards in this rarity
  let totalInRarity = 0
  if (rarity === 'Common') {
    totalInRarity = cardCounts.commons || 90
  } else if (rarity === 'Uncommon') {
    totalInRarity = cardCounts.uncommons || 60
  } else if (rarity === 'Rare') {
    totalInRarity = cardCounts.rares || 48
  } else if (rarity === 'Legendary') {
    totalInRarity = cardCounts.legendaries || 16
  }

  if (totalInRarity === 0) return 0

  return rarityRate / totalInRarity
}

/**
 * Get probability for Special rarity cards
 * Special cards only appear in foil/hyperfoil slots in sets 4-6
 */
function getSpecialCardProbability(_card: RawCard, treatment: Treatment, setCode: SetCode | string): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setConfig = getSetConfig(setCode as SetCode) as any
  if (!setConfig) return 0

  // Check if this set allows specials in foil slot
  const specialInFoilSlot = setConfig.packRules?.specialInFoilSlot || false
  if (!specialInFoilSlot) return 0

  const cardCounts = setConfig.cardCounts || {}
  const totalSpecials = cardCounts.specials || 0
  if (totalSpecials === 0) return 0

  const foilWeights = setConfig.rarityWeights?.foilSlot || {}
  const specialWeight = foilWeights.Special || 0
  const totalWeight = Object.values(foilWeights).reduce((a: number, b: unknown) => a + (b as number), 0)
  if (totalWeight === 0) return 0

  const specialRate = specialWeight / totalWeight
  const upgrades = setConfig.upgradeProbabilities || {}
  const hyperfoilRate = upgrades.foilToHyperfoil || 0

  if (treatment === 'base') {
    // Special cards don't appear in regular slots
    return 0
  } else if (treatment === 'hyperspace') {
    // Special cards don't appear in regular HS slots either
    return 0
  } else if (treatment === 'foil') {
    // Special can appear in foil slot
    return (specialRate / totalSpecials) * (1 - hyperfoilRate)
  } else if (treatment === 'hyperspace_foil') {
    // Special can be hyperfoil
    return (specialRate / totalSpecials) * hyperfoilRate
  } else if (treatment === 'showcase') {
    // Specials can't be showcase (only leaders)
    return 0
  }

  return 0
}

/**
 * Analyze a single card's generation statistics
 */
export function analyzeCardStats(card: RawCard, stats: CardStats, totalPacks: number, setCode: SetCode | string): Record<Treatment, TreatmentStats> {
  const treatments: Treatment[] = ['base', 'hyperspace', 'foil', 'hyperspace_foil', 'showcase']
  const results: Partial<Record<Treatment, TreatmentStats>> = {}

  treatments.forEach(treatment => {
    const observed = stats[treatment] || 0
    const probability = getCardTreatmentProbability(card, treatment, setCode)
    const expected = calculateExpectedCount(probability, totalPacks)

    // Mark as N/A if this treatment doesn't apply to this card
    const isApplicable = probability > 0 || observed > 0

    if (!isApplicable) {
      results[treatment] = {
        observed: 0,
        expected: 0,
        probability: 0,
        isApplicable: false
      }
      return
    }

    const zScore = calculateZScore(observed, expected, totalPacks, probability)
    const percentDiff = calculatePercentDifference(observed, expected)
    const significance = categorizeSignificance(zScore)

    results[treatment] = {
      observed,
      expected: Math.round(expected * 10) / 10,
      probability,
      zScore: Math.round(zScore * 100) / 100,
      percentDiff: Math.round(percentDiff * 10) / 10,
      significance,
      isApplicable: true
    }
  })

  return results as Record<Treatment, TreatmentStats>
}

/**
 * Get reference data for a set
 */
export function getSetReferenceData(setCode: SetCode | string): SetReferenceData | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setConfig = getSetConfig(setCode as SetCode) as any
  if (!setConfig) return null

  const cardCounts = setConfig.cardCounts || {}
  const rarityWeights = setConfig.rarityWeights || {}
  const foilWeights = rarityWeights.foilSlot || {}
  const beltRatios = setConfig.beltRatios || {}
  const rareSlotLegendaryRatio = beltRatios.rareToLegendary || 6
  const legendaryRate = 1 / (rareSlotLegendaryRatio + 1)
  const ucSlot3UpgradeRate = setConfig.upgradeProbabilities?.thirdUCToHyperspaceRL || 0.18

  return {
    setCode,
    setName: setConfig.setName,
    setColor: setConfig.color,
    packConstruction: {
      totalCards: 16,
      leaders: 1,
      bases: 1,
      commons: 9,
      uncommons: '2-3',
      raresLegendaries: '1-2',
      foils: 1
    },
    cardCounts: {
      leaders: cardCounts.leaders?.total || 16,
      bases: cardCounts.bases?.total || 16,
      commons: cardCounts.commons || 90,
      uncommons: cardCounts.uncommons || 60,
      rares: cardCounts.rares || 48,
      legendaries: cardCounts.legendaries || 16,
      specials: cardCounts.specials || 0
    },
    dropRates: {
      legendaryInRareLegendarySlot: `${(legendaryRate * 100).toFixed(1)}%`,
      rareLegendaryUpgrade: `${(ucSlot3UpgradeRate * 100).toFixed(1)}%`,
      foilCommon: `${(foilWeights.Common || 70).toFixed(1)}%`,
      foilUncommon: `${(foilWeights.Uncommon || 20).toFixed(1)}%`,
      foilRare: `${(foilWeights.Rare || 8).toFixed(1)}%`,
      foilLegendary: `${(foilWeights.Legendary || 2).toFixed(1)}%`,
      foilSpecial: `${(foilWeights.Special || 0).toFixed(1)}%`
    }
  }
}
