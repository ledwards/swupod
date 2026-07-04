// @ts-nocheck
/**
 * RareLegendaryBelt
 *
 * A belt that provides rare and legendary cards for booster packs.
 * Includes non-leader Rares and all Legendaries.
 *
 * Ratio varies by set:
 * - Sets 1-3: 7:1 (Rare:Legendary) = 1 in 8 rare slots are legendary
 * - Sets 4+: 5:1 (Rare:Legendary) = 1 in 6 rare slots are legendary
 *
 * Fill algorithm:
 * - Get 1 of each Rare and 1/X of the Legendaries (where X is the ratio)
 * - Shuffle and add to hopper
 * - Repeat X times total with seam dedup between segments
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

export class RareLegendaryBelt {
  setCode: SetCode
  hopper: RawCard[]
  fillingPool: RawCard[]
  rares: RawCard[]
  legendaries: RawCard[]
  ratio: number

  constructor(setCode: SetCode | string) {
    this.setCode = setCode as SetCode
    this.hopper = []
    this.fillingPool = []
    this.rares = []
    this.legendaries = []
    this.ratio = 7 // Default, will be set based on config

    this._initialize()
  }

  /**
   * Initialize the belt by loading cards and setting up the filling pool
   */
  _initialize(): void {
    const cards = getCachedCards(this.setCode)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = getSetConfig(this.setCode) as any

    // Determine ratio based on set number
    // Sets 1-3: 7:1 (1 in 8), Sets 4+: 5:1 (1 in 6)
    const setNumber = config?.setNumber || 1
    this.ratio = setNumber <= 3 ? 7 : 5

    // Check if this set puts rare bases in the base slot (no current sets do)
    // If so, exclude them from the rare slot. Otherwise, include them.
    const rareBasesInBaseSlot = config?.packRules?.rareBasesInRareSlot === false

    // Filter to normal variant non-leader rares and legendaries
    this.rares = cards.filter(c =>
      c.variantType === 'Normal' &&
      c.rarity === 'Rare' &&
      !c.isLeader &&
      (!c.isBase || !rareBasesInBaseSlot)
    )

    this.legendaries = cards.filter(c =>
      c.variantType === 'Normal' &&
      c.rarity === 'Legendary' &&
      !c.isLeader &&
      (!c.isBase || !rareBasesInBaseSlot)
    )

    // Filling pool is all rares + legendaries
    this.fillingPool = [...this.rares, ...this.legendaries]

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
    while (this.hopper.length < this.fillingPool.length) {
      this._fill()
    }
  }

  /**
   * Fill the hopper with rares and legendaries at the correct ratio
   *
   * Target ratios:
   * - Sets 1-3: 7:1 (7 rares per 1 legendary = 12.5% legendary)
   * - Sets 4+: 5:1 (5 rares per 1 legendary = 16.7% legendary)
   *
   * Algorithm:
   * 1. Calculate how many times to repeat rares vs legendaries to achieve ratio
   * 2. Add that many copies of each to the segment
   * 3. Shuffle and add to hopper
   *
   * Example for SOR (48 rares, 16 legendaries, ratio=7):
   * - Target: 7 rares per legendary = rare_copies / leg_copies = 7 * 16 / 48 = 2.33
   * - Use rare_copies=7, leg_copies=3 (7/3 ≈ 2.33)
   * - Hopper: 48*7=336 rares, 16*3=48 legendaries = 384 cards
   * - Rate: 48/384 = 12.5% ✓
   */
  _fill(): void {
    const wasEmpty = this.hopper.length === 0

    // Calculate multipliers to achieve target ratio
    // We want: (rareCount * rareMult) / (legCount * legMult) = ratio
    // Solving: rareMult / legMult = ratio * legCount / rareCount
    const rareCount = this.rares.length
    const legCount = this.legendaries.length

    // Use legMult = rareCount, rareMult = ratio * legCount
    // This gives exact ratio: (rareCount * ratio * legCount) / (legCount * rareCount) = ratio ✓
    const legMult = rareCount
    const rareMult = this.ratio * legCount

    // Find GCD to reduce multipliers for smaller hopper
    const gcd = this._gcd(rareMult, legMult)
    const finalRareMult = Math.max(1, Math.floor(rareMult / gcd))
    const finalLegMult = Math.max(1, Math.floor(legMult / gcd))

    // Build segment with correct ratio
    const segment: RawCard[] = []

    // Add rares (multiple copies)
    for (let copy = 0; copy < finalRareMult; copy++) {
      segment.push(...this.rares)
    }

    // Add legendaries (multiple copies)
    for (let copy = 0; copy < finalLegMult; copy++) {
      segment.push(...this.legendaries)
    }

    // Shuffle the segment
    shuffle(segment)

    // Run full dedup on segment to remove duplicates within 6 slots
    this._fullDedup(segment)

    // Add segment to hopper
    const hopperStart = this.hopper.length
    this.hopper.push(...segment)

    // Run seam dedup at the boundary if hopper wasn't empty
    if (!wasEmpty) {
      this._seamDedup(hopperStart, segment.length)
    }
  }

  /**
   * Full segment deduplication
   * Scan entire segment for duplicates within 6 slots and fix them
   */
  _fullDedup(segment: RawCard[], maxPasses = 3): void {
    for (let pass = 0; pass < maxPasses; pass++) {
      let foundDuplicate = false

      for (let i = 0; i < segment.length; i++) {
        const card = segment[i]

        // Check for duplicates within 6 slots ahead
        for (let j = i + 1; j <= Math.min(i + 6, segment.length - 1); j++) {
          if (isSameCard(card, segment[j])) {
            foundDuplicate = true
            // Find a swap candidate from further away (outside the 6-slot window)
            const swapCandidates: number[] = []
            for (let k = 0; k < segment.length; k++) {
              // Must be outside the duplicate's 6-slot window
              if (Math.abs(k - j) > 6 && Math.abs(k - i) > 6) {
                // And not create a new duplicate
                const wouldCreateDup = this._wouldCreateDuplicate(segment, k, segment[j]!)
                if (!wouldCreateDup) {
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
            break // Restart from this position
          }
        }
      }

      if (!foundDuplicate) break
    }
  }

  /**
   * Check if placing a card at index would create a duplicate within 6 slots
   */
  _wouldCreateDuplicate(segment: RawCard[], index: number, card: RawCard): boolean {
    for (let offset = -6; offset <= 6; offset++) {
      if (offset === 0) continue
      const checkIdx = index + offset
      if (checkIdx < 0 || checkIdx >= segment.length) continue
      if (isSameCard(card, segment[checkIdx])) {
        return true
      }
    }
    return false
  }

  /**
   * Calculate greatest common divisor (for reducing multipliers)
   */
  _gcd(a: number, b: number): number {
    return b === 0 ? a : this._gcd(b, a % b)
  }

  /**
   * Seam deduplication
   * Look at the first 5 cards in the segment (the seam).
   * For each, check if it has a duplicate within 6 slots.
   * If so, swap with a random card from the back half of the segment.
   */
  _seamDedup(segmentStart: number, segmentLength: number, depth = 0): void {
    // Prevent infinite recursion
    if (depth > 10) return

    const seamSize = Math.min(5, segmentLength)
    const backHalfStart = segmentStart + Math.floor(segmentLength / 2)
    const backHalfEnd = segmentStart + segmentLength

    for (let i = 0; i < seamSize; i++) {
      const cardIndex = segmentStart + i
      const card = this.hopper[cardIndex]

      // Check for duplicates within 6 slots (before and after)
      let hasDuplicate = false
      for (let offset = -6; offset <= 6; offset++) {
        if (offset === 0) continue
        const checkIndex = cardIndex + offset
        if (checkIndex < 0 || checkIndex >= this.hopper.length) continue
        if (checkIndex >= segmentStart + segmentLength) continue // Don't check beyond segment

        if (isSameCard(card, this.hopper[checkIndex])) {
          hasDuplicate = true
          break
        }
      }

      if (hasDuplicate) {
        // Swap with a random card from the back half of the segment
        const backHalfLength = backHalfEnd - backHalfStart
        if (backHalfLength > 0) {
          const swapIndex = backHalfStart + Math.floor(Math.random() * backHalfLength)
          const temp = this.hopper[cardIndex]
          this.hopper[cardIndex] = this.hopper[swapIndex]!
          this.hopper[swapIndex] = temp!

          // Run dedup again
          this._seamDedup(segmentStart, segmentLength, depth + 1)
          return
        }
      }
    }
  }

  /**
   * Get the next rare/legendary from the hopper
   */
  next(): RawCard | null {
    this._fillIfNeeded()

    const card = this.hopper.shift()
    return card ? { ...card } : null // Return a copy
  }

  /**
   * Peek at upcoming cards without removing them
   */
  peek(count = 1): RawCard[] {
    this._fillIfNeeded()
    return this.hopper.slice(0, count).map(c => ({ ...c }))
  }

  /**
   * Get current hopper size
   */
  get size(): number {
    return this.hopper.length
  }
}
