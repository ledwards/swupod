// @ts-nocheck
/**
 * HyperspaceCommonBelt
 *
 * A single belt for Hyperspace variant commons (not split like normal CommonBelt).
 * Seam deduplication ensures no duplicates within 5 slots.
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
 * Check if two cards are the same (by id or name)
 */
function isSameCard(a: RawCard | undefined, b: RawCard | undefined): boolean {
  if (!a || !b) return false
  return a.id === b.id || a.name === b.name
}

export class HyperspaceCommonBelt {
  setCode: SetCode
  hopper: RawCard[]
  fillingPool: RawCard[]

  constructor(setCode: SetCode | string) {
    this.setCode = setCode as SetCode
    this.hopper = []
    this.fillingPool = []

    this._initialize()
  }

  _initialize(): void {
    const cards = getCachedCards(this.setCode)

    // Filter to Hyperspace variant commons (non-leader, non-base)
    this.fillingPool = cards.filter(c =>
      c.variantType === 'Hyperspace' &&
      c.rarity === 'Common' &&
      !c.isLeader &&
      !c.isBase
    )

    // Pre-release fallback: if no Hyperspace variants exist for this set yet
    // (Strapi hasn't published them), use Normal commons as stand-ins. next()
    // still stamps isHyperspace=true so the slot semantics are preserved.
    // Auto-heals: when HS variants land in cards.json the filter above wins.
    if (this.fillingPool.length === 0) {
      this.fillingPool = cards.filter(c =>
        c.variantType === 'Normal' &&
        c.rarity === 'Common' &&
        !c.isLeader &&
        !c.isBase
      )
    }

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

  _fill(): void {
    const wasEmpty = this.hopper.length === 0
    const bootStart = this.hopper.length

    const boot = shuffle([...this.fillingPool])
    this.hopper.push(...boot)

    if (!wasEmpty) {
      this._seamDedup(bootStart, boot.length)
    }
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
      for (let offset = -5; offset <= 5; offset++) {
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
