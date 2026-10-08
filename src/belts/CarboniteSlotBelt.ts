// @ts-nocheck
/**
 * CarboniteSlotBelt
 *
 * A configurable belt for Carbonite pack slots. Each instance serves a
 * specific rarity + variant combination:
 *
 *   - Common Foil (slots 2-5)
 *   - Uncommon Foil (slots 6-7)
 *   - R/L Foil (slot 8) — weighted: 70% R / 20% S / 10% L
 *   - Common HS (slots 10-12)
 *   - Uncommon HS (slot 13)
 *   - R/L HS (slot 14) — weighted: 70% R / 20% S / 10% L
 *
 * Config determines:
 *   - rarities: which rarities to include (e.g. ['Common'] or ['Rare','Special','Legendary'])
 *   - sourceVariant: which variantType to pull from ('Normal' for foils, 'Hyperspace' for HS)
 *   - outputFlags: what to stamp on output cards (e.g. { isFoil: true } or { isHyperspace: true })
 *   - weights: optional rarity weights for multi-rarity belts (R/L slots)
 *
 * Uses the standard hopper/filling pool pattern. For single-rarity belts,
 * every card appears once per boot (shuffled). For weighted multi-rarity belts,
 * cards are duplicated per the MIN_COPIES_PER_CARD scaling pattern.
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

export interface CarboniteSlotBeltConfig {
  rarities: string[]
  sourceVariant: string
  outputFlags: Record<string, boolean>
  weights?: Record<string, number>
}

export class CarboniteSlotBelt {
  setCode: SetCode
  hopper: RawCard[]
  fillingPool: RawCard[]
  rarityQuantities: Record<string, number>
  config: CarboniteSlotBeltConfig

  constructor(setCode: SetCode | string, config: CarboniteSlotBeltConfig) {
    this.setCode = setCode as SetCode
    this.config = config
    this.hopper = []
    this.fillingPool = []
    this.rarityQuantities = {}

    this._initialize()
  }

  _initialize(): void {
    const cards = getCachedCards(this.setCode)
    const setConfig = getSetConfig(this.setCode) as any
    const includeSpecial = setConfig?.packRules?.specialInHyperspaceSlots ?? true
    const raritySet = new Set(this.config.rarities)

    // Filter to source variant, matching rarities, non-leader, non-base
    this.fillingPool = cards.filter(c =>
      c.variantType === this.config.sourceVariant &&
      !c.isLeader &&
      !c.isBase &&
      raritySet.has(c.rarity) &&
      (includeSpecial || c.rarity !== 'Special')
    )

    // Fallback: if sourceVariant cards not found, use Normal variants
    if (this.fillingPool.length === 0 && this.config.sourceVariant !== 'Normal') {
      this.fillingPool = cards.filter(c =>
        c.variantType === 'Normal' &&
        !c.isLeader &&
        !c.isBase &&
        raritySet.has(c.rarity) &&
        (includeSpecial || c.rarity !== 'Special')
      )
    }

    if (this.config.weights) {
      // Weighted multi-rarity mode (R/L belts)
      const targetWeights = this.config.weights

      const rarityCounts: Record<string, number> = {}
      for (const card of this.fillingPool) {
        rarityCounts[card.rarity] = (rarityCounts[card.rarity] || 0) + 1
      }

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
    } else {
      // Single-rarity mode: every card appears once per boot
      for (const card of this.fillingPool) {
        this.rarityQuantities[card.rarity] = 1
      }
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
    if (!card) return null
    return { ...card, ...this.config.outputFlags }
  }

  peek(count = 1): RawCard[] {
    this._fillIfNeeded()
    return this.hopper.slice(0, count).map(c => ({ ...c, ...this.config.outputFlags }))
  }

  get size(): number {
    return this.hopper.length
  }
}
