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
  /** True for LAW+ sets where this belt IS the every-pack foil slot. Those
   *  sets get sheet-cut ordering (non-common "hit" foils spaced evenly) so a
   *  24-pack box lands on ~20 common + ~4 hits every time — real boxes run
   *  stdev ~0.6 on common count, not the ~1.9 a shuffled boot produces. */
  sheetCut: boolean

  constructor(setCode: SetCode | string) {
    this.setCode = setCode as SetCode
    this.hopper = []
    this.fillingPool = []
    this.rarityQuantities = {}
    this.usingNormalFallback = false
    this.sheetCut = false

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
    // LAW+ sets use this belt as the every-pack foil slot → sheet-cut ordering.
    // Earlier sets use it only for the rare hyperfoil upgrade → keep pure shuffle.
    this.sheetCut = config?.packRules?.foilSlotIsHyperspaceFoil === true

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

    // Per-card copy counts.
    // Preferred: explicit foil-sheet copies from the set config (a real print
    // stack — N sheets of 11×11). Every card of a rarity gets EXACTLY this many
    // copies: equal frequency, exact ratio, no weight/rounding, normal sheet size.
    // ASH: C15/U3/R1/S5/L2 over 100/60/50/8/20 cards → 1810 = 15×121−5.
    const sheetCopies = config?.rarityWeights?.hyperspaceFoilSheetCopies
    if (sheetCopies) {
      for (const rarity in rarityCounts) {
        this.rarityQuantities[rarity] = Math.max(1, Math.round(sheetCopies[rarity] ?? 1))
      }
    } else {
      // Weight-driven fallback (sets 1-6, and LAW until it gets a sheet). The LAW+
      // foil slot (sheetCut) uses a higher baseScale so small rarities don't round
      // up and inflate the hit share.
      let baseScale = 1000
      if (this.sheetCut) {
        const MIN_COPIES_PER_CARD = 8
        let minWeightPerCard = Infinity
        for (const rarity in rarityCounts) {
          const pct = targetWeights[rarity] || 0
          if (pct > 0) minWeightPerCard = Math.min(minWeightPerCard, pct / (rarityCounts[rarity] || 1))
        }
        if (minWeightPerCard < Infinity && minWeightPerCard > 0) {
          baseScale = Math.ceil((MIN_COPIES_PER_CARD * 100) / minWeightPerCard)
        }
      }
      for (const rarity in rarityCounts) {
        const targetPct = targetWeights[rarity] || 0
        const uniqueCount = rarityCounts[rarity] || 1
        this.rarityQuantities[rarity] = Math.max(1, Math.round((targetPct / 100) * baseScale / uniqueCount))
      }
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
    if (!this.sheetCut) {
      // Sets 1-6 (rare hyperfoil upgrade): pure shuffle, unchanged.
      const boot: RawCard[] = []
      for (const card of this.fillingPool) {
        const quantity = this.rarityQuantities[card.rarity] || 1
        for (let i = 0; i < quantity; i++) boot.push(card)
      }
      shuffle(boot)
      this.hopper.push(...boot)
      return
    }

    // LAW+ foil slot: SHEET-CUT. Split the weighted boot into commons vs the
    // rarer "hit" foils (U/R/S/L), then space the hits evenly so any 24-pack
    // box lands on ~4 hits (real boxes: 3-5, stdev ~0.6) instead of the ~0-8 a
    // shuffled boot coughs up. Exact per-cycle counts (and the rarity mix) are
    // unchanged — only the ordering is rationed, like a real print sheet.
    const commons: RawCard[] = []
    const hits: RawCard[] = []
    for (const card of this.fillingPool) {
      const quantity = this.rarityQuantities[card.rarity] || 1
      const bucket = card.rarity === 'Common' ? commons : hits
      for (let i = 0; i < quantity; i++) bucket.push(card)
    }
    shuffle(commons)
    shuffle(hits)

    const total = commons.length + hits.length
    const boot: (RawCard | null)[] = new Array(total).fill(null)

    if (hits.length > 0) {
      const interval = total / hits.length
      // Never fully rigid: real boxes wobble (common-foil stdev ~0.6, not 0).
      const jitter = Math.max(1, Math.floor(interval / 6))
      // Random phase: generateSealedBox clears belts per box, so a fresh box
      // consumes the first 24 of a new boot. Without a phase every box would
      // sample the identical window (a robotic 19 commons, stdev 0). A random
      // phase makes fresh cuts land on different windows → real ~0.6 stdev.
      const phase = Math.random() * interval
      for (let k = 0; k < hits.length; k++) {
        const wobble = jitter > 0 ? Math.floor(Math.random() * (2 * jitter + 1)) - jitter : 0
        let pos = Math.round(phase + k * interval + wobble) % total
        if (pos < 0) pos += total
        let guard = 0
        while (boot[pos] !== null && guard < total) {
          pos = (pos + 1) % total
          guard++
        }
        boot[pos] = hits[k]!
      }
    }

    let c = 0
    for (let i = 0; i < total; i++) {
      if (boot[i] === null) boot[i] = commons[c++]!
    }

    this.hopper.push(...(boot as RawCard[]))
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
