// @ts-nocheck
/**
 * HyperspaceLeaderBelt
 *
 * Same as LeaderBelt but uses Hyperspace variant leaders.
 * Only Common and Rare rarity leaders (no Special/Legendary).
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

export class HyperspaceLeaderBelt {
  setCode: SetCode
  hopper: RawCard[]
  fillingPool: RawCard[]
  commonLeaders: RawCard[]
  rareLeaders: RawCard[]

  constructor(setCode: SetCode | string) {
    this.setCode = setCode as SetCode
    this.hopper = []
    this.fillingPool = []
    this.commonLeaders = []
    this.rareLeaders = []

    this._initialize()
  }

  _initialize(): void {
    const cards = getCachedCards(this.setCode)

    // Filter to Hyperspace variant leaders with Common or Rare rarity
    this.fillingPool = cards.filter(c =>
      c.isLeader &&
      c.variantType === 'Hyperspace' &&
      (c.rarity === 'Common' || c.rarity === 'Rare')
    )

    // Pre-release fallback: see HyperspaceCommonBelt for the pattern.
    if (this.fillingPool.length === 0) {
      this.fillingPool = cards.filter(c =>
        c.isLeader &&
        c.variantType === 'Normal' &&
        (c.rarity === 'Common' || c.rarity === 'Rare')
      )
    }

    this.commonLeaders = this.fillingPool.filter(c => c.rarity === 'Common')
    this.rareLeaders = this.fillingPool.filter(c => c.rarity === 'Rare')

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

    const shuffledRares = shuffle([...this.rareLeaders])
    const raresPerSegment = Math.floor(shuffledRares.length / 3)

    // Segment 1
    const segment1Rares = shuffledRares.slice(0, raresPerSegment)
    const segment1 = shuffle([...this.commonLeaders, ...segment1Rares])
    this.hopper.push(...segment1)

    if (!wasEmpty) {
      this._seamDedup(this.hopper.length - segment1.length, segment1.length)
    }

    // Segment 2
    const segment2Rares = shuffledRares.slice(raresPerSegment, raresPerSegment * 2)
    const segment2 = shuffle([...this.commonLeaders, ...segment2Rares])
    const segment2Start = this.hopper.length
    this.hopper.push(...segment2)
    this._seamDedup(segment2Start, segment2.length)

    // Segment 3
    const segment3Rares = shuffledRares.slice(raresPerSegment * 2)
    const segment3 = shuffle([...this.commonLeaders, ...segment3Rares])
    const segment3Start = this.hopper.length
    this.hopper.push(...segment3)
    this._seamDedup(segment3Start, segment3.length)
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
