// @ts-nocheck
/**
 * HyperspaceRareLegendaryBelt
 *
 * Same as RareLegendaryBelt but uses Hyperspace variant cards.
 * Includes non-leader Rares, Specials (sets 4+), and all Legendaries
 * from Hyperspace variant. Specials appear at the same frequency as Rares.
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

/**
 * Check if two cards are the same (by id or name)
 */
function isSameCard(a: RawCard | undefined, b: RawCard | undefined): boolean {
  if (!a || !b) return false
  return a.id === b.id || a.name === b.name
}

export class HyperspaceRareLegendaryBelt {
  setCode: SetCode
  hopper: RawCard[]
  fillingPool: RawCard[]
  rares: RawCard[]
  legendaries: RawCard[]
  specials: RawCard[]
  ratio: number

  constructor(setCode: SetCode | string) {
    this.setCode = setCode as SetCode
    this.hopper = []
    this.fillingPool = []
    this.rares = []
    this.legendaries = []
    this.specials = []
    this.ratio = 6

    this._initialize()
  }

  _initialize(): void {
    const cards = getCachedCards(this.setCode)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = getSetConfig(this.setCode) as any

    // Ratio and Special inclusion come from the set config.
    this.ratio = config?.beltRatios?.hyperspaceRareToLegendary ?? 6
    const includeSpecials = config?.packRules?.specialInHyperspaceSlots ?? false

    // Filter to Hyperspace variant non-leader rares and legendaries
    this.rares = cards.filter(c =>
      c.variantType === 'Hyperspace' &&
      c.rarity === 'Rare' &&
      !c.isLeader &&
      !c.isBase
    )

    this.legendaries = cards.filter(c =>
      c.variantType === 'Hyperspace' &&
      c.rarity === 'Legendary' &&
      !c.isLeader &&
      !c.isBase
    )

    // Specials for sets 4+ (at same frequency as rares)
    if (includeSpecials) {
      this.specials = cards.filter(c =>
        c.variantType === 'Hyperspace' &&
        c.rarity === 'Special' &&
        !c.isLeader &&
        !c.isBase
      )
    }

    // Fallback: if no Hyperspace variants in data (e.g., LAW), use Normal variants
    if (this.rares.length === 0 && this.legendaries.length === 0) {
      this.rares = cards.filter(c =>
        c.variantType === 'Normal' &&
        c.rarity === 'Rare' &&
        !c.isLeader &&
        !c.isBase
      )
      this.legendaries = cards.filter(c =>
        c.variantType === 'Normal' &&
        c.rarity === 'Legendary' &&
        !c.isLeader &&
        !c.isBase
      )
      if (includeSpecials && this.specials.length === 0) {
        this.specials = cards.filter(c =>
          c.variantType === 'Normal' &&
          c.rarity === 'Special' &&
          !c.isLeader &&
          !c.isBase
        )
      }
    }

    this.fillingPool = [...this.rares, ...this.specials, ...this.legendaries]

    this._fillIfNeeded()
  }

  _fillIfNeeded(): void {
    // Safety check: if no cards in filling pool, can't fill
    if (this.fillingPool.length === 0) {
      return
    }
    while (this.hopper.length < this.fillingPool.length) {
      this._fill()
    }
  }

  /**
   * Fill the hopper with rares, specials, and legendaries at the correct ratio
   *
   * SPEC: Target ratios for Hyperspace R/L slot:
   * - Sets 1-3: 6:1 (6 rares per 1 legendary = ~14.3% legendary)
   * - Sets 4+: 5:1 (5 rares+specials per 1 legendary = ~16.7% legendary)
   * Specials appear at the same frequency as rares (same multiplier).
   */
  _fill(): void {
    const wasEmpty = this.hopper.length === 0

    // Calculate multipliers to achieve target ratio
    const rareCount = this.rares.length
    const legCount = this.legendaries.length

    if (rareCount === 0 || legCount === 0) {
      // Fallback if no cards of either type
      const segment = shuffle([...this.rares, ...this.specials, ...this.legendaries])
      this.hopper.push(...segment)
      return
    }

    // Use legMult = rareCount, rareMult = ratio * legCount
    const legMult = rareCount
    const rareMult = this.ratio * legCount

    // Find GCD to reduce multipliers
    const gcd = this._gcd(rareMult, legMult)
    const finalRareMult = Math.max(1, Math.floor(rareMult / gcd))
    const finalLegMult = Math.max(1, Math.floor(legMult / gcd))

    // Build segment with correct ratio
    // Specials ride alongside rares at equal frequency
    const segment: RawCard[] = []
    for (let copy = 0; copy < finalRareMult; copy++) {
      segment.push(...this.rares)
      if (this.specials.length > 0) {
        segment.push(...this.specials)
      }
    }
    for (let copy = 0; copy < finalLegMult; copy++) {
      segment.push(...this.legendaries)
    }

    shuffle(segment)
    this._fullDedup(segment)

    const hopperStart = this.hopper.length
    this.hopper.push(...segment)

    if (!wasEmpty) {
      this._seamDedup(hopperStart, segment.length)
    }
  }

  _gcd(a: number, b: number): number {
    return b === 0 ? a : this._gcd(b, a % b)
  }

  _fullDedup(segment: RawCard[], maxPasses = 3): void {
    for (let pass = 0; pass < maxPasses; pass++) {
      let foundDuplicate = false

      for (let i = 0; i < segment.length; i++) {
        const card = segment[i]
        for (let j = i + 1; j <= Math.min(i + 6, segment.length - 1); j++) {
          if (isSameCard(card, segment[j])) {
            foundDuplicate = true
            const swapCandidates: number[] = []
            for (let k = 0; k < segment.length; k++) {
              if (Math.abs(k - j) > 6 && Math.abs(k - i) > 6) {
                if (!this._wouldCreateDuplicate(segment, k, segment[j]!)) {
                  swapCandidates.push(k)
                }
              }
            }
            if (swapCandidates.length > 0) {
              const swapIdx = swapCandidates[Math.floor(Math.random() * swapCandidates.length)]!
              const temp = segment[j]
              segment[j] = segment[swapIdx]!
              segment[swapIdx] = temp!
            }
            break
          }
        }
      }
      if (!foundDuplicate) break
    }
  }

  _wouldCreateDuplicate(segment: RawCard[], index: number, card: RawCard): boolean {
    for (let offset = -6; offset <= 6; offset++) {
      if (offset === 0) continue
      const checkIdx = index + offset
      if (checkIdx < 0 || checkIdx >= segment.length) continue
      if (isSameCard(card, segment[checkIdx])) return true
    }
    return false
  }

  _seamDedup(segmentStart: number, segmentLength: number, depth = 0): void {
    if (depth > 10) return

    const seamSize = Math.min(5, segmentLength)
    const backHalfStart = segmentStart + Math.floor(segmentLength / 2)
    const backHalfEnd = segmentStart + segmentLength

    for (let i = 0; i < seamSize; i++) {
      const cardIndex = segmentStart + i
      const card = this.hopper[cardIndex]

      let hasDuplicate = false
      for (let offset = -6; offset <= 6; offset++) {
        if (offset === 0) continue
        const checkIndex = cardIndex + offset
        if (checkIndex < 0 || checkIndex >= this.hopper.length) continue
        if (checkIndex >= segmentStart + segmentLength) continue

        if (isSameCard(card, this.hopper[checkIndex])) {
          hasDuplicate = true
          break
        }
      }

      if (hasDuplicate) {
        const backHalfLength = backHalfEnd - backHalfStart
        if (backHalfLength > 0) {
          const swapIndex = backHalfStart + Math.floor(Math.random() * backHalfLength)
          const temp = this.hopper[cardIndex]
          this.hopper[cardIndex] = this.hopper[swapIndex]!
          this.hopper[swapIndex] = temp!
          this._seamDedup(segmentStart, segmentLength, depth + 1)
          return
        }
      }
    }
  }

  next(): RawCard | null {
    this._fillIfNeeded()
    const card = this.hopper.shift()
    if (!card) return null
    return { ...card, isHyperspace: true }
  }

  peek(count = 1): RawCard[] {
    this._fillIfNeeded()
    return this.hopper.slice(0, count).map(c => ({ ...c, isHyperspace: true }))
  }

  get size(): number {
    return this.hopper.length
  }
}
