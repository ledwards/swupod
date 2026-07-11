// @ts-nocheck
/**
 * HyperfoilBelt
 *
 * Provides Hyperspace Foil cards for the foil slot upgrade.
 * Uses cards with variantType === 'Hyperspace Foil'.
 * In Sets 4+, Special multiplier is dynamically scaled so total output = Rare total output.
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

// Target hyperfoil slot weights by rarity (percentage)
// Same as foilSlotWeights from packConstants
const TARGET_WEIGHTS_SETS_1_3: Record<string, number> = {
  Common: 78,
  Uncommon: 17,
  Rare: 5,
  Legendary: 0.3,
  Special: 0,
}


export class HyperfoilBelt {
  setCode: SetCode
  hopper: RawCard[]
  fillingPool: RawCard[]
  rarityQuantities: Record<string, number>
  /** True when the set has no Hyperspace/HSF art yet and we fall back to
   *  Normal card images. The slot is still a Hyperspace Foil; only the art
   *  source is provisional. */
  usingNormalFallback: boolean

  constructor(setCode: SetCode | string) {
    this.setCode = setCode as SetCode
    this.hopper = []
    this.fillingPool = []
    this.rarityQuantities = {}
    this.usingNormalFallback = false

    this._initialize()
  }

  /**
   * Initialize the belt by loading cards and setting up the filling pool
   */
  _initialize(): void {
    const cards = getCachedCards(this.setCode)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = getSetConfig(this.setCode) as any
    const includeSpecial = config?.packRules?.specialInHyperspaceSlots ?? false

    // Filter to Hyperspace Foil variant non-leader, non-base cards
    this.fillingPool = cards.filter(c =>
      c.variantType === 'Hyperspace Foil' &&
      !c.isLeader &&
      !c.isBase &&
      (includeSpecial || c.rarity !== 'Special')
    )

    // Fallback: if no HSF variants, use Hyperspace variants (LAW has these)
    if (this.fillingPool.length === 0) {
      this.fillingPool = cards.filter(c =>
        c.variantType === 'Hyperspace' &&
        !c.isLeader &&
        !c.isBase &&
        (includeSpecial || c.rarity !== 'Special')
      )
    }

    // Final fallback: use Normal variants as placeholders
    if (this.fillingPool.length === 0) {
      this.fillingPool = cards.filter(c =>
        c.variantType === 'Normal' &&
        !c.isLeader &&
        !c.isBase &&
        (includeSpecial || c.rarity !== 'Special')
      )
      this.usingNormalFallback = true
    }

    // Target weights come from the set config (rarityWeights.hyperspaceFoilSlot)
    const targetWeights = config?.rarityWeights?.hyperspaceFoilSlot ?? TARGET_WEIGHTS_SETS_1_3

    // Count unique cards per rarity
    const rarityCounts: Record<string, number> = {}
    for (const card of this.fillingPool) {
      rarityCounts[card.rarity] = (rarityCounts[card.rarity] || 0) + 1
    }

    // Calculate multipliers to achieve target distribution
    const baseScale = 1000
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
   * Fill the hopper with a new batch
   */
  _fill(): void {
    const boot: RawCard[] = []

    for (const card of this.fillingPool) {
      const quantity = this.rarityQuantities[card.rarity] || 1
      for (let i = 0; i < quantity; i++) {
        boot.push(card)
      }
    }

    shuffle(boot)
    this.hopper.push(...boot)
  }

  next(): RawCard | null {
    this._fillIfNeeded()
    const card = this.hopper.shift()
    if (!card) return null
    return { ...card, isFoil: true, isHyperspace: true }
  }

  peek(count = 1): RawCard[] {
    this._fillIfNeeded()
    return this.hopper.slice(0, count).map(c =>
      ({ ...c, isFoil: true, isHyperspace: true })
    )
  }

  get size(): number {
    return this.hopper.length
  }
}
