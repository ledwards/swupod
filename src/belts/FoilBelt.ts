// @ts-nocheck
/**
 * FoilBelt
 *
 * A belt that provides foil cards for booster packs.
 * Includes all non-leader, non-base cards in weighted quantities:
 * - 1 of every Legendary
 * - 6 of every Rare (and Special in sets 4-6)
 * - 18 of every Uncommon
 * - 54 of every Common
 */

import { getCachedCards } from '../utils/cardCache'
import type { RawCard } from '../utils/cardData'
import type { SetCode } from '../types'
import { getSetConfig } from '../utils/setConfigs/index'

/**
 * Shuffle an array in place (Fisher-Yates)
 */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = arr[i]
    arr[i] = arr[j]!
    arr[j] = temp!
  }
  return arr
}

// Target foil slot weights by rarity (percentage)
// These are the expected distribution from packConstants
const TARGET_WEIGHTS_SETS_1_3: Record<string, number> = {
  Common: 78,
  Uncommon: 17,
  Rare: 5,
  Legendary: 0.3,
  Special: 0,
}


export class FoilBelt {
  setCode: SetCode
  hopper: RawCard[]
  fillingPool: RawCard[]
  rarityQuantities: Record<string, number>

  constructor(setCode: SetCode | string) {
    this.setCode = setCode as SetCode
    this.hopper = []
    this.fillingPool = []
    this.rarityQuantities = {}

    this._initialize()
  }

  /**
   * Initialize the belt by loading cards and setting up the filling pool
   */
  _initialize(): void {
    const cards = getCachedCards(this.setCode)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = getSetConfig(this.setCode) as any
    const includeSpecial = config?.packRules?.specialInFoilSlot ?? false

    // Filter to normal variant non-leader, non-base cards
    // Exclude Special rarity if not allowed for this set
    this.fillingPool = cards.filter(c =>
      c.variantType === 'Normal' &&
      !c.isLeader &&
      !c.isBase &&
      (includeSpecial || c.rarity !== 'Special')
    )

    // Target weights come from the set config (rarityWeights.foilBeltTarget)
    const targetWeights = config?.rarityWeights?.foilBeltTarget ?? TARGET_WEIGHTS_SETS_1_3

    // Count unique cards per rarity
    const rarityCounts: Record<string, number> = {}
    for (const card of this.fillingPool) {
      rarityCounts[card.rarity] = (rarityCounts[card.rarity] || 0) + 1
    }

    // Calculate multipliers to achieve target distribution
    // Formula: multiplier[R] = (targetWeight[R] / 100) * baseScale / uniqueCards[R]
    //
    // We dynamically compute baseScale so the rarest category (Legendary at 0.3%)
    // gets at least 10 copies per unique card. This avoids the old Math.max(1,...)
    // clamp that over-represented legendaries by 6x when the computed multiplier
    // rounded to 0 and was clamped to 1.
    //
    // Formula: baseScale = ceil(minCopies * 100 / min(targetPct / uniqueCount))
    const MIN_COPIES_PER_CARD = 10
    let minWeightPerCard = Infinity
    for (const rarity in rarityCounts) {
      const targetPct = targetWeights[rarity] || 0
      if (targetPct > 0) {
        const weightPerCard = targetPct / rarityCounts[rarity]
        if (weightPerCard < minWeightPerCard) {
          minWeightPerCard = weightPerCard
        }
      }
    }
    const baseScale = Math.ceil(MIN_COPIES_PER_CARD * 100 / minWeightPerCard)

    for (const rarity in rarityCounts) {
      const targetPct = targetWeights[rarity] || 0
      const uniqueCount = rarityCounts[rarity] || 1
      this.rarityQuantities[rarity] = Math.max(1, Math.round((targetPct / 100) * baseScale / uniqueCount))
    }

    // Initial fill
    this._fillIfNeeded()
  }

  /**
   * Fill the hopper if it needs more cards
   */
  _fillIfNeeded(): void {
    // Safety check: if no cards in filling pool, can't fill
    if (this.fillingPool.length === 0) {
      return
    }
    // Calculate the size of one boot
    const bootSize = this._calculateBootSize()

    while (this.hopper.length < bootSize) {
      this._fill()
    }
  }

  /**
   * Calculate the size of one boot based on rarity quantities
   */
  _calculateBootSize(): number {
    let size = 0
    for (const card of this.fillingPool) {
      const quantity = this.rarityQuantities[card.rarity] || 1
      size += quantity
    }
    return size
  }

  /**
   * Fill the hopper with a new batch of foils
   */
  _fill(): void {
    const boot: RawCard[] = []

    // Add cards in weighted quantities
    for (const card of this.fillingPool) {
      const quantity = this.rarityQuantities[card.rarity] || 1
      for (let i = 0; i < quantity; i++) {
        boot.push(card)
      }
    }

    // Shuffle and add to hopper
    shuffle(boot)
    this.hopper.push(...boot)
  }

  /**
   * Get the next foil from the hopper
   */
  next(): RawCard | null {
    this._fillIfNeeded()

    const card = this.hopper.shift()
    return card ? { ...card, isFoil: true } : null // Return a copy marked as foil
  }

  /**
   * Peek at upcoming cards without removing them
   */
  peek(count = 1): RawCard[] {
    this._fillIfNeeded()
    return this.hopper.slice(0, count).map(c => ({ ...c, isFoil: true }))
  }

  /**
   * Get current hopper size
   */
  get size(): number {
    return this.hopper.length
  }
}
