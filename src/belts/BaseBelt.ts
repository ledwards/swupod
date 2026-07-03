// @ts-nocheck
/**
 * BaseBelt
 *
 * A belt that provides base cards for booster packs.
 * Cycles through common bases with aspect-based seam deduplication.
 * Current set configs put rare bases in the rare slot, so this belt only serves commons.
 */

import { getCachedCards } from '../utils/cardCache';
import { getSetConfig } from '../utils/setConfigs';
import type { RawCard } from '../utils/cardData';
import type { SetCode } from '../types';

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
 * Check if two bases have the same aspect
 */
function hasSameAspect(a: RawCard | undefined, b: RawCard | undefined): boolean {
  if (!a || !b) return false
  if (!a.aspects || !b.aspects) return false
  // Check if any aspect overlaps
  return a.aspects.some(aspect => b.aspects.includes(aspect))
}

/**
 * Check if two cards are the same base (name + subtitle)
 */
function isSameBase(a: RawCard | undefined, b: RawCard | undefined): boolean {
  if (!a || !b) return false
  return a.name === b.name && (a.subtitle || '') === (b.subtitle || '')
}

export class BaseBelt {
  setCode: SetCode
  hopper: RawCard[]
  fillingPool: RawCard[]
  rareBases: RawCard[]

  constructor(setCode: SetCode | string) {
    this.setCode = setCode as SetCode
    this.hopper = []
    this.fillingPool = []
    this.rareBases = []

    this._initialize()
  }

  /**
   * Initialize the belt by loading cards and setting up the filling pool
   */
  _initialize(): void {
    const cards = getCachedCards(this.setCode)

    // Filter to only normal variant common bases (the cycle pool)
    this.fillingPool = cards.filter(c =>
      c.isBase &&
      c.variantType === 'Normal' &&
      c.rarity === 'Common'
    )

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
   * Fill the hopper with a new batch of bases
   *
   * Sets 1-6: aspect-based adjacency dedup (no adjacent bases share an aspect).
   * Set 7+: the base sheet rotates aspects on the LINE — real ASH box 001, read
   * back in factory line order, shows only 1/21 adjacent same-aspect pairs. So
   * the belt models the line by avoiding aspect adjacency AND same-name adjacency
   * (aspect overlap nearly covers same-name for 2-per-aspect sheets, but both are
   * kept for clarity). Player-visible base aspect randomness comes from box
   * stacking (stackBoxOrder), not from the belt.
   */
  _fill(): void {
    const setNumber = getSetConfig(this.setCode)?.setNumber ?? 0
    const conflicts = setNumber >= 7
      ? (a: RawCard | undefined, b: RawCard | undefined) => hasSameAspect(a, b) || isSameBase(a, b)
      : hasSameAspect

    // Shuffle the bases for this boot
    const boot = shuffle([...this.fillingPool])

    // Add each card, checking for conflicts at the seam
    for (let i = 0; i < boot.length; i++) {
      const card = boot[i]!
      const prevCard = this.hopper[this.hopper.length - 1]

      if (prevCard && conflicts(card, prevCard)) {
        // Look ahead through the remaining unprocessed cards for a non-conflicting
        // card and swap it into this position. Best-effort: if none exists (e.g.
        // the boot is exhausted), keep the current card and accept the seam.
        let swapIdx = -1
        for (let j = i + 1; j < boot.length; j++) {
          if (!conflicts(boot[j], prevCard)) {
            swapIdx = j
            break
          }
        }
        if (swapIdx >= 0) {
          const temp = boot[i]
          boot[i] = boot[swapIdx]!
          boot[swapIdx] = temp!
        }
      }

      this.hopper.push(boot[i]!)
    }
  }

  /**
   * Get the next base from the belt
   */
  next(): RawCard | null {
    this._fillIfNeeded()
    const card = this.hopper.shift()
    return card ? { ...card } : null
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
