// @ts-nocheck
/**
 * HyperspaceSingleRarityBelt
 *
 * Provides hyperspace cards of exactly one rarity from a cyclic belt.
 * Used when collation chooses a specific rarity outcome first and then
 * needs a printer-like source for the actual card.
 */

import { getCachedCards } from '../utils/cardCache'
import type { RawCard } from '../utils/cardData'
import type { SetCode } from '../types'

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = arr[i]
    arr[i] = arr[j]!
    arr[j] = temp!
  }
  return arr
}

function isSameCard(a: RawCard | undefined, b: RawCard | undefined): boolean {
  if (!a || !b) return false
  return a.id === b.id || a.name === b.name
}

export class HyperspaceSingleRarityBelt {
  setCode: SetCode
  rarity: string
  hopper: RawCard[]
  fillingPool: RawCard[]
  recentServed: string[]
  DEDUP_WINDOW: number

  constructor(setCode: SetCode | string, rarity: string) {
    this.setCode = setCode as SetCode
    this.rarity = rarity
    this.hopper = []
    this.fillingPool = []
    this.recentServed = []
    this.DEDUP_WINDOW = 0

    this._initialize()
  }

  _initialize(): void {
    const cards = getCachedCards(this.setCode)

    this.fillingPool = cards.filter(c =>
      c.variantType === 'Hyperspace' &&
      c.rarity === this.rarity &&
      !c.isLeader &&
      !c.isBase
    )

    if (this.fillingPool.length === 0) {
      this.fillingPool = cards.filter(c =>
        c.variantType === 'Normal' &&
        c.rarity === this.rarity &&
        !c.isLeader &&
        !c.isBase
      )
    }

    this.DEDUP_WINDOW = Math.min(12, Math.max(1, Math.floor(this.fillingPool.length / 2)))
    this._fillIfNeeded()
  }

  _fillIfNeeded(): void {
    if (this.fillingPool.length === 0) return
    while (this.hopper.length < this.fillingPool.length) {
      this._fill()
    }
  }

  _fill(): void {
    const seamCards = [...this.hopper]
    const numSeam = seamCards.length
    const minPositions = new Map<string, number>()

    for (let i = 0; i < seamCards.length; i++) {
      const distance = numSeam - i
      const minPos = Math.max(0, this.DEDUP_WINDOW - distance)
      const existing = minPositions.get(seamCards[i]!.id) || 0
      minPositions.set(seamCards[i]!.id, Math.max(existing, minPos))
    }

    for (let i = 0; i < this.recentServed.length; i++) {
      const distance = numSeam + (this.recentServed.length - i)
      const minPos = Math.max(0, this.DEDUP_WINDOW - distance)
      if (minPos > 0) {
        const id = this.recentServed[i]!
        const existing = minPositions.get(id) || 0
        minPositions.set(id, Math.max(existing, minPos))
      }
    }

    const remaining = shuffle([...this.fillingPool])
    const boot: RawCard[] = []

    while (remaining.length > 0) {
      const position = boot.length
      const eligible = remaining.filter(card => (minPositions.get(card.id) || 0) <= position)
      const pool = eligible.length > 0 ? eligible : remaining
      const card = pool[Math.floor(Math.random() * pool.length)]!
      const index = remaining.findIndex(c => c.id === card.id)
      boot.push(card)
      remaining.splice(index, 1)
    }

    if (this.hopper.length > 0) {
      this._seamDedup(this.hopper, boot)
    }

    this.hopper.push(...boot)
  }

  _seamDedup(existing: RawCard[], boot: RawCard[]): void {
    const window = Math.min(this.DEDUP_WINDOW, boot.length)
    for (let i = 0; i < window; i++) {
      const candidate = boot[i]
      if (!candidate) continue

      const existingConflict = existing.some((card, idx) =>
        idx >= Math.max(0, existing.length - this.DEDUP_WINDOW) && isSameCard(card, candidate)
      )

      if (!existingConflict) continue

      const swapStart = Math.max(i + 1, Math.floor(boot.length / 2))
      for (let j = swapStart; j < boot.length; j++) {
        const swapCandidate = boot[j]
        if (!swapCandidate) continue
        const stillConflicts = existing.some((card, idx) =>
          idx >= Math.max(0, existing.length - this.DEDUP_WINDOW) && isSameCard(card, swapCandidate)
        )
        if (!stillConflicts) {
          const temp = boot[i]
          boot[i] = boot[j]!
          boot[j] = temp!
          break
        }
      }
    }
  }

  next(): RawCard | null {
    this._fillIfNeeded()
    const card = this.hopper.shift()
    if (!card) return null

    this.recentServed.push(card.id)
    if (this.recentServed.length > this.DEDUP_WINDOW) {
      this.recentServed.shift()
    }

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
