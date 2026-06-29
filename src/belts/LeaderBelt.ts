// @ts-nocheck
/**
 * LeaderBelt
 *
 * A belt that provides leader cards for booster packs.
 *
 * Design: Cycles through 24-pack sheets with exactly four rare leaders,
 * while common leaders still cycle through every unique card before repeating.
 *
 * Target ratio: 4/24 packs get a Rare leader (~16.67%)
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

export class LeaderBelt {
  setCode: SetCode
  commonLeaders: RawCard[]
  rareLeaders: RawCard[]
  hopper: RawCard[]
  commonCycle: RawCard[]  // Shuffled cycle of common leaders
  commonIndex: number     // Current position in common cycle
  lastLeaderName: string | null  // Track last served leader to avoid adjacent duplicates

  constructor(setCode: SetCode | string) {
    this.setCode = setCode as SetCode
    this.commonLeaders = []
    this.rareLeaders = []
    this.hopper = []
    this.commonCycle = []
    this.commonIndex = 0
    this.lastLeaderName = null

    this._initialize()
  }

  /**
   * Initialize the belt by loading cards
   */
  _initialize(): void {
    const cards = getCachedCards(this.setCode)

    // Filter to only normal variant leaders with Common or Rare rarity
    const allLeaders = cards.filter(c =>
      c.isLeader &&
      c.variantType === 'Normal' &&
      (c.rarity === 'Common' || c.rarity === 'Rare')
    )

    this.commonLeaders = allLeaders.filter(c => c.rarity === 'Common')
    this.rareLeaders = allLeaders.filter(c => c.rarity === 'Rare')

    // Initialize first common cycle
    this._reshuffleCommonCycle()
  }

  /**
   * Reshuffle the common leader cycle
   * Called when we've gone through all commons once
   */
  _reshuffleCommonCycle(): void {
    this.commonCycle = shuffle([...this.commonLeaders])
    this.commonIndex = 0
  }

  /**
   * Get the next common leader from the cycle
   * Reshuffles when cycle is exhausted
   */
  _nextCommon(): RawCard | undefined {
    if (this.commonIndex >= this.commonCycle.length) {
      this._reshuffleCommonCycle()
    }
    return this.commonCycle[this.commonIndex++]
  }

  _nextCommonAvoiding(previousName: string | null): RawCard | null {
    let attempts = 0
    const maxAttempts = this.commonLeaders.length

    while (attempts < maxAttempts) {
      const common = this._nextCommon()
      if (common && common.name !== previousName) {
        return common
      }
      attempts++
    }

    return this._nextCommon() ?? null
  }

  _rareSlotsForSheet(sheetSize: number, rareCount: number): Set<number> {
    const slots = new Set<number>()
    if (sheetSize <= 0 || rareCount <= 0) return slots

    const zoneSize = sheetSize / rareCount
    for (let i = 0; i < rareCount; i++) {
      const zoneStart = Math.floor(i * zoneSize)
      const zoneEnd = Math.floor((i + 1) * zoneSize)
      const span = Math.max(1, zoneEnd - zoneStart)
      slots.add(zoneStart + Math.floor(Math.random() * span))
    }

    return slots
  }

  _nextRareFromQueue(rareQueue: RawCard[], previousName: string | null): RawCard | null {
    if (rareQueue.length === 0) return null

    const preferredIndex = rareQueue.findIndex(card => card.name !== previousName)
    const index = preferredIndex >= 0 ? preferredIndex : 0
    const [rare] = rareQueue.splice(index, 1)
    return rare ?? null
  }

  _fillSheet(): void {
    const SHEET_SIZE = 24
    const RARES_PER_SHEET = 4
    const rareCount = Math.min(RARES_PER_SHEET, this.rareLeaders.length)
    const rareSlots = this._rareSlotsForSheet(SHEET_SIZE, rareCount)
    const rareQueue = shuffle([...this.rareLeaders]).slice(0, rareCount)
    const sheet: RawCard[] = []

    let previousName = this.lastLeaderName
    for (let i = 0; i < SHEET_SIZE; i++) {
      let leader: RawCard | null = null

      if (rareSlots.has(i)) {
        leader = this._nextRareFromQueue(rareQueue, previousName)
      }

      if (!leader) {
        leader = this._nextCommonAvoiding(previousName)
      }

      if (leader) {
        sheet.push(leader)
        previousName = leader.name
      }
    }

    this.hopper.push(...sheet)
  }

  _fillIfNeeded(): void {
    if (this.hopper.length === 0) {
      this._fillSheet()
    }
  }

  /**
   * Get the next leader from the belt
   *
   * Logic:
   * - Fill a 24-pack sheet with exactly 4 unique rare leaders
   * - Spread rare slots across the sheet so a box does not cluster them
   * - Fill the remaining slots from the common cycle
   * - Avoid immediate duplicate names at sheet seams and within common runs
   */
  next(): RawCard | null {
    this._fillIfNeeded()
    const leader = this.hopper.shift() ?? null

    if (leader) {
      this.lastLeaderName = leader.name
      return { ...leader }
    }

    return null
  }

  /**
   * Peek at upcoming cards in the current leader sheet
   */
  peek(count = 1): RawCard[] {
    this._fillIfNeeded()
    return this.hopper.slice(0, count).map(card => ({ ...card }))
  }

  /**
   * Get current leader hopper size
   */
  get size(): number {
    this._fillIfNeeded()
    return this.hopper.length
  }
}
