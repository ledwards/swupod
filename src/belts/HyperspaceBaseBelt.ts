// @ts-nocheck
/**
 * HyperspaceBaseBelt
 *
 * Same as BaseBelt but uses Hyperspace variant bases.
 * Aspect-based seam deduplication to prevent adjacent bases with same aspect.
 */

import { getCachedCards } from '../utils/cardCache'
import type { RawCard } from '../utils/cardData'
import type { SetCode } from '../types'

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
  return a.aspects.some(aspect => b.aspects.includes(aspect))
}

export class HyperspaceBaseBelt {
  setCode: SetCode
  hopper: RawCard[]
  fillingPool: RawCard[]
  hasLoggedEmptyWarning: boolean

  constructor(setCode: SetCode | string) {
    this.setCode = setCode as SetCode
    this.hopper = []
    this.fillingPool = []
    this.hasLoggedEmptyWarning = false

    this._initialize()
  }

  _initialize(): void {
    const cards = getCachedCards(this.setCode)

    // Filter to Hyperspace variant common bases
    this.fillingPool = cards.filter(c =>
      c.isBase &&
      c.variantType === 'Hyperspace' &&
      c.rarity === 'Common'
    )

    // Pre-release fallback: see HyperspaceCommonBelt for the pattern.
    if (this.fillingPool.length === 0) {
      this.fillingPool = cards.filter(c =>
        c.isBase &&
        c.variantType === 'Normal' &&
        c.rarity === 'Common'
      )
    }

    this._fillIfNeeded()
  }

  _fillIfNeeded(): void {
    // Safety check: if no cards in filling pool, can't fill
    if (this.fillingPool.length === 0) {
      if (!this.hasLoggedEmptyWarning) {
        this.hasLoggedEmptyWarning = true
      }
      return
    }
    while (this.hopper.length < this.fillingPool.length) {
      this._fill()
    }
  }

  _fill(): void {
    const boot = shuffle([...this.fillingPool])

    for (let i = 0; i < boot.length; i++) {
      const card = boot[i]!
      const prevCard = this.hopper[this.hopper.length - 1]

      if (prevCard && hasSameAspect(card, prevCard)) {
        const remainingStart = i + 1
        const remainingEnd = boot.length
        const backHalfStart = Math.floor((remainingEnd - remainingStart) / 2) + remainingStart

        if (backHalfStart < remainingEnd) {
          const swapIdx = backHalfStart + Math.floor(Math.random() * (remainingEnd - backHalfStart))
          const temp = boot[i]
          boot[i] = boot[swapIdx]!
          boot[swapIdx] = temp!
        }
      }

      this.hopper.push(boot[i]!)
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
