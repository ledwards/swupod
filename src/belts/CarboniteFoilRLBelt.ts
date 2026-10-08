// @ts-nocheck
/**
 * CarboniteFoilRLBelt
 *
 * A belt that provides foil cards filtered to only Rare, Legendary, and Special
 * rarity cards. Used for the guaranteed R/L foil slot in pre-LAW Carbonite packs.
 *
 * Weight distribution: ~70% Rare, ~20% Special, ~10% Legendary
 * All output is marked as isFoil: true
 *
 * Uses the same hopper/filling pool pattern as FoilBelt.
 */

import { getCachedCards } from '../utils/cardCache'
import type { RawCard } from '../utils/cardData'
import type { SetCode } from '../types'
import { getSetConfig } from '../utils/setConfigs/index'
import { CARBONITE_CONSTANTS } from '../utils/carboniteConstants'

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

export class CarboniteFoilRLBelt {
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

  _initialize(): void {
    const cards = getCachedCards(this.setCode)
    const config = getSetConfig(this.setCode) as any
    const includeSpecial = config?.packRules?.specialInFoilSlot ?? false

    // Filter to Normal variant R/L/Special rarity, non-leader, non-base cards
    this.fillingPool = cards.filter(c =>
      c.variantType === 'Normal' &&
      !c.isLeader &&
      !c.isBase &&
      (c.rarity === 'Rare' || c.rarity === 'Legendary' || (includeSpecial && c.rarity === 'Special'))
    )

    const targetWeights = CARBONITE_CONSTANTS.foilRLWeights

    // Count unique cards per rarity
    const rarityCounts: Record<string, number> = {}
    for (const card of this.fillingPool) {
      rarityCounts[card.rarity] = (rarityCounts[card.rarity] || 0) + 1
    }

    // Calculate multipliers to achieve target distribution
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

    this._fillIfNeeded()
  }

  _fillIfNeeded(): void {
    if (this.fillingPool.length === 0) return
    const bootSize = this._calculateBootSize()
    while (this.hopper.length < bootSize) {
      this._fill()
    }
  }

  _calculateBootSize(): number {
    let size = 0
    for (const card of this.fillingPool) {
      const quantity = this.rarityQuantities[card.rarity] || 1
      size += quantity
    }
    return size
  }

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
    return card ? { ...card, isFoil: true } : null
  }

  peek(count = 1): RawCard[] {
    this._fillIfNeeded()
    return this.hopper.slice(0, count).map(c => ({ ...c, isFoil: true }))
  }

  get size(): number {
    return this.hopper.length
  }
}
