// @ts-nocheck
/**
 * CommonBelt
 *
 * A belt that provides common cards for booster packs using static belt assignments.
 *
 * MANUFACTURING PRINCIPLE:
 * We mimic a physical card manufacturing process. The belt is a cyclic conveyor
 * that dispenses cards in order. We do NOT use post-hoc fixes or manual corrections.
 * Instead, we ensure the belt is constructed properly from the start.
 *
 * The correct way to guarantee aspect coverage is to ensure that every segment
 * of N cards (where N = number of slots filled from this belt) contains the
 * required aspects. This is handled during belt construction, not after pack generation.
 *
 * STATIC ASSIGNMENTS:
 * Each set has a predefined list of cards assigned to Belt A or Belt B.
 * See src/belts/data/commonBeltAssignments.js for the mappings.
 *
 * BLOCK-SPECIFIC BEHAVIOR:
 *
 * Block 0 (Sets 1-3: SOR, SHD, TWI):
 * - Belt A: 60 cards (Vigilance, Command, Aggression) → fills slots 1-6
 *   CONSTRAINT: Every segment of 6 cards has at least 1 Blue, 1 Green, 1 Red
 * - Belt B: 30 cards (Cunning, Villainy, Heroism, Neutral) → fills slots 7-9
 *   CONSTRAINT: Every segment of 3 cards has at least 1 Yellow
 *
 * Block A (Sets 4-6: JTL, LOF, SEC):
 * - Belt A: 50 cards (Vigilance, Command, Villainy) → fills slots 1-4
 *   CONSTRAINT: Every segment of 4 cards has at least 1 Blue, 1 Green
 * - Belt B: 50 cards (Aggression, Cunning, Heroism, Neutral) → fills slots 6-9
 *   CONSTRAINT: Every segment of 4 cards has at least 1 Red, 1 Yellow
 *
 * DUPLICATE PREVENTION:
 * - 12-card deduplication window prevents same card appearing close together
 * - Seam deduplication ensures no duplicates at boot boundaries
 */

import { getCachedCards } from '../utils/cardCache'
import type { RawCard } from '../utils/cardData'
import type { SetCode } from '../types'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { COMMON_BELT_ASSIGNMENTS, getBlockForSet, assignCardToBelt } from './data/commonBeltAssignments'

// Type for belt ID
type BeltId = 'A' | 'B'

// Type for segment configuration
interface SegmentConfig {
  drawSize: number
  requiredAspects: string[]
}

// Aspect name constants
const BLUE = 'Vigilance'
const GREEN = 'Command'
const RED = 'Aggression'
const YELLOW = 'Cunning'

/**
 * Get segment configuration for a belt based on block and belt ID
 *
 * DRAW SIZE:
 * The drawSize is how many cards are drawn from this belt per pack.
 * This is the constraint window - every drawSize consecutive cards must have required aspects.
 *
 * SEAM-AWARE REFILL:
 * When the hopper has exactly drawSize cards left, we refill. The new boot's first segment
 * is constructed to complement the remaining cards, ensuring the seam satisfies constraints.
 */
function getSegmentConfig(setCode: SetCode | string, beltId: BeltId): SegmentConfig {
  const block = getBlockForSet(setCode)

  if (block === 0) {
    if (beltId === 'A') {
      return {
        drawSize: 6,  // Draw 6 cards per pack from Belt A
        requiredAspects: [BLUE, GREEN, RED]
      }
    } else {
      return {
        drawSize: 3,  // Draw 3 cards per pack from Belt B
        requiredAspects: [YELLOW]
      }
    }
  } else {
    // Block A (and future blocks)
    if (beltId === 'A') {
      return {
        drawSize: 4,  // Draw 4 cards per pack from Belt A
        requiredAspects: [BLUE, GREEN]
      }
    } else {
      return {
        drawSize: 4,  // Draw 4 cards per pack from Belt B
        requiredAspects: [RED, YELLOW]
      }
    }
  }
}

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
 * Get the primary aspect (first listed) of a card, or null if no aspects.
 */
function getPrimaryAspect(card: RawCard): string | null {
  const aspects = card.aspects || []
  return aspects.length > 0 ? aspects[0]! : null
}

/**
 * Build an aspect-interleaved sequence of cards.
 * Groups cards by primary aspect and round-robins through groups (largest first),
 * ensuring no two adjacent cards share primary aspect.
 * The first card's aspect will differ from lastAspect if possible.
 */
function buildInterleavedSequence(cards: RawCard[], lastAspect: string | null): RawCard[] {
  if (cards.length === 0) return []

  // Group by primary aspect
  const groups = new Map<string | null, RawCard[]>()
  for (const card of cards) {
    const a = getPrimaryAspect(card)
    if (!groups.has(a)) groups.set(a, [])
    groups.get(a)!.push(card)
  }

  // Shuffle within each group
  groups.forEach(pool => shuffle(pool))

  // Sort groups by size descending for round-robin (largest first prevents end clustering)
  const sortedKeys = [...groups.keys()].sort((a, b) =>
    (groups.get(b)?.length || 0) - (groups.get(a)?.length || 0)
  )

  // Rotate sortedKeys so the first group's aspect differs from lastAspect
  if (lastAspect !== null) {
    const startIdx = sortedKeys.findIndex(k => k !== lastAspect)
    if (startIdx > 0) {
      const rotated = [...sortedKeys.slice(startIdx), ...sortedKeys.slice(0, startIdx)]
      sortedKeys.splice(0, sortedKeys.length, ...rotated)
    }
  }

  // Pre-compute target positions for small groups using stride placement.
  // Small groups (< 15% of total) get evenly-spaced target positions across
  // the belt so they don't cluster at the start of the round-robin.
  // Only apply to groups that are NOT a required segment aspect — spreading
  // required aspects would break the segment constraint ("every N cards has
  // at least 1 of each required aspect").
  const total = cards.length

  // Detect required aspects from the cards themselves. Required aspects are
  // the dominant groups — they naturally satisfy segment constraints via round-robin.
  // Small non-required groups (neutrals, minority alignment) get spread out.
  const smallGroupTargets = new Map<string | null, number[]>()
  const largeGroupThreshold = total * 0.15
  for (const key of sortedKeys) {
    const pool = groups.get(key)!
    if (pool.length < largeGroupThreshold && pool.length >= 1) {
      const stride = total / pool.length
      const offset = Math.random() * stride
      const targets: number[] = []
      for (let i = 0; i < pool.length; i++) {
        targets.push(Math.round(offset + i * stride))
      }
      smallGroupTargets.set(key, targets)
    }
  }

  // Build sequence: round-robin for large groups (guarantees segment constraints),
  // with small group cards inserted at their target positions.
  const result: RawCard[] = []
  let prevAspect: string | null = lastAspect
  let totalRemaining = cards.length

  // Track next target index for each small group
  const smallGroupNextIdx = new Map<string | null, number>()
  for (const [key] of smallGroupTargets) smallGroupNextIdx.set(key, 0)

  while (totalRemaining > 0) {
    const currentPos = result.length

    // Check if any small group has a card targeted for this position
    let placedSmall = false
    for (const [key, targets] of smallGroupTargets) {
      const nextIdx = smallGroupNextIdx.get(key) || 0
      if (nextIdx >= targets.length) continue
      const pool = groups.get(key)!
      if (pool.length === 0) continue
      if (targets[nextIdx]! <= currentPos && key !== prevAspect) {
        const card = pool.shift()!
        result.push(card)
        prevAspect = key
        totalRemaining--
        smallGroupNextIdx.set(key, nextIdx + 1)
        placedSmall = true
        break
      }
    }
    if (placedSmall) continue

    // Regular round-robin for large groups
    let placed = false
    sortedKeys.sort((a, b) =>
      (groups.get(b)?.length || 0) - (groups.get(a)?.length || 0)
    )

    for (const key of sortedKeys) {
      if (smallGroupTargets.has(key)) continue  // Small groups placed by target
      const pool = groups.get(key)!
      if (pool.length === 0) continue
      if (key === prevAspect) continue

      const card = pool.shift()!
      result.push(card)
      prevAspect = key
      totalRemaining--
      placed = true
      break
    }

    if (!placed) {
      // Try any card that doesn't conflict
      for (const key of sortedKeys) {
        const pool = groups.get(key)!
        if (pool.length === 0) continue
        if (key === prevAspect) continue

        const card = pool.shift()!
        result.push(card)
        prevAspect = key
        totalRemaining--
        placed = true
        break
      }
    }

    if (!placed) {
      // All remaining cards have same aspect — forced adjacency
      for (const key of sortedKeys) {
        const pool = groups.get(key)!
        if (pool.length > 0) {
          result.push(pool.shift()!)
          prevAspect = key
          totalRemaining--
          break
        }
      }
    }
  }

  return result
}

/**
 * Build a constrained boot with all cards from the belt.
 *
 * CONSTRAINTS:
 * 1. Every card appears exactly once (no exclusion — equal occurrence rate)
 * 2. No adjacent cards share primary aspect (aspects[0])
 * 3. Per-card minimum position based on how recently they appeared (seam dedup)
 * 4. First card's primary aspect differs from lastAspect (seam aspect continuity)
 *
 * APPROACH:
 * - Split cards into early-eligible (minPos=0) and late-only (minPos>0) groups
 * - Build an interleaved sequence for early zone using early cards only
 * - Build an interleaved sequence for the remaining positions using all leftover cards
 * - This ensures both aspect and dedup constraints are satisfied simultaneously
 */
function buildConstrainedBoot(
  cards: RawCard[],
  drawSize: number,
  requiredAspects: string[],
  cardMinPositions: Map<string, number>,
  lastAspect: string | null
): RawCard[] {
  if (cards.length === 0) return []

  const beltSize = cards.length

  // Find the highest minPosition to determine where early zone ends
  let maxMinPos = 0
  for (const [, minPos] of cardMinPositions) {
    if (minPos > maxMinPos) maxMinPos = minPos
  }

  // Split cards into early-eligible and late-only
  const earlyCards: RawCard[] = []
  const lateCards: RawCard[] = []
  for (const card of cards) {
    const minPos = cardMinPositions.get(card.id) || 0
    if (minPos === 0) {
      earlyCards.push(card)
    } else {
      lateCards.push(card)
    }
  }

  // Build early zone: only early-eligible cards, interleaved by aspect
  const earlySequence = buildInterleavedSequence(earlyCards, lastAspect)

  // Take just enough early cards to fill before the first late card can appear
  // The early zone size = maxMinPos (all positions before any late card is allowed)
  const earlyZoneSize = Math.min(maxMinPos, earlySequence.length)
  const result = earlySequence.slice(0, earlyZoneSize)

  // Remaining cards = unused early cards + all late cards
  const usedEarlyIds = new Set(result.map(c => c.id))
  const remainingCards = [
    ...earlyCards.filter(c => !usedEarlyIds.has(c.id)),
    ...lateCards
  ]

  // Build the remaining zone: interleave all remaining cards
  const prevAspect = result.length > 0
    ? getPrimaryAspect(result[result.length - 1]!)
    : lastAspect
  const lateSequence = buildInterleavedSequence(remainingCards, prevAspect)
  result.push(...lateSequence)

  return result
}

/**
 * Get common cards for a specific belt from static assignments or auto-assignment
 */
export function getBeltCards(setCode: SetCode | string, beltId: BeltId): RawCard[] {
  const cards = getCachedCards(setCode)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignments = (COMMON_BELT_ASSIGNMENTS as Record<string, any>)[setCode]

  if (!assignments) {
    console.warn(`No belt assignments found for set ${setCode}`)
    return []
  }

  // Filter to normal variant commons (non-leader, non-base)
  const allCommons = cards.filter(c =>
    c.variantType === 'Normal' &&
    c.rarity === 'Common' &&
    c.type !== 'Leader' &&
    c.type !== 'Base'
  )

  // If autoAssign is enabled, use aspect-based assignment
  if (assignments.autoAssign) {
    const block = getBlockForSet(setCode)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return allCommons.filter(c => (assignCardToBelt as any)(c, block) === beltId)
  }

  // Otherwise use static belt assignments
  const cardNames: string[] = beltId === 'A' ? assignments.beltA : assignments.beltB

  // Create lookup by name
  const cardByName = new Map<string, RawCard>()
  allCommons.forEach(c => {
    if (!cardByName.has(c.name)) {
      cardByName.set(c.name, c)
    }
  })

  // Get cards in order specified by assignments
  const beltCards: RawCard[] = []
  for (const name of cardNames) {
    const card = cardByName.get(name)
    if (card) {
      beltCards.push(card)
    } else {
      console.warn(`Card not found for belt assignment: ${name} in ${setCode}`)
    }
  }

  return beltCards
}

export class CommonBelt {
  setCode: SetCode
  beltId: BeltId
  hopper: RawCard[]
  beltCards: RawCard[]
  segmentConfig: SegmentConfig
  recentServed: string[]  // Last N card IDs served via next()
  lastServedAspect: string | null  // Primary aspect of last card served
  DEDUP_WINDOW: number
  totalDraws: number

  constructor(setCode: SetCode | string, beltId: BeltId) {
    this.setCode = setCode as SetCode
    this.beltId = beltId
    this.hopper = []

    // Get cards assigned to this belt
    this.beltCards = getBeltCards(setCode, beltId)

    // Get segment configuration for constrained boot building
    this.segmentConfig = getSegmentConfig(setCode, beltId)

    // Track recently served card IDs (persists across boot fills)
    this.recentServed = []
    // Dedup window: min(24, floor(beltSize/2)) to ensure feasibility
    this.DEDUP_WINDOW = Math.min(24, Math.floor(this.beltCards.length / 2))

    // Track last served aspect for seam continuity
    this.lastServedAspect = null

    // Track total draws
    this.totalDraws = 0

    this._initialize()
  }

  /**
   * Initialize the belt
   */
  _initialize(): void {
    // Initial fill
    this._fillIfNeeded()
  }

  /**
   * Fill the hopper if it needs more cards
   */
  _fillIfNeeded(): void {
    if (this.beltCards.length === 0) return

    const { drawSize } = this.segmentConfig
    if (this.hopper.length <= drawSize) {
      this._fill()
    }
  }

  /**
   * Fill the hopper with a new boot of ALL belt cards.
   * Every card appears exactly once per boot (no exclusion).
   * Cards recently served are placed at the back of the boot (seam dedup).
   * No adjacent cards share primary aspect.
   */
  _fill(): void {
    const { drawSize, requiredAspects } = this.segmentConfig
    const seamCards = [...this.hopper]
    const numSeam = seamCards.length

    // Compute per-card minimum position in the new boot.
    // Each card's min position = max(0, dedupWindow - distance_from_boot_start)
    // Seam cards: distances numSeam (first seam) down to 1 (last seam)
    // RecentServed: distances numSeam+1 (most recent) through numSeam+recentServed.length (oldest)
    const cardMinPositions = new Map<string, number>()

    // Seam cards
    for (let i = 0; i < seamCards.length; i++) {
      const distance = numSeam - i  // first seam card = distance numSeam, last = distance 1
      const minPos = Math.max(0, this.DEDUP_WINDOW - distance)
      const existing = cardMinPositions.get(seamCards[i]!.id) || 0
      cardMinPositions.set(seamCards[i]!.id, Math.max(existing, minPos))
    }

    // Recently served cards (most recent = index length-1, oldest = index 0)
    for (let i = 0; i < this.recentServed.length; i++) {
      const distance = numSeam + (this.recentServed.length - i)
      const minPos = Math.max(0, this.DEDUP_WINDOW - distance)
      if (minPos > 0) {
        const id = this.recentServed[i]!
        const existing = cardMinPositions.get(id) || 0
        cardMinPositions.set(id, Math.max(existing, minPos))
      }
    }

    // Last aspect: from hopper tail (last seam card), or from last served
    let lastAspect = this.lastServedAspect
    if (seamCards.length > 0) {
      lastAspect = getPrimaryAspect(seamCards[seamCards.length - 1]!)
    }

    const boot = buildConstrainedBoot(
      this.beltCards,
      drawSize,
      requiredAspects,
      cardMinPositions,
      lastAspect
    )

    this.hopper.push(...boot)
  }

  /**
   * Get the next common from the hopper
   */
  next(): RawCard | null {
    this._fillIfNeeded()

    if (this.hopper.length === 0) {
      console.warn(`CommonBelt ${this.beltId} for ${this.setCode} is empty`)
      return null
    }

    const card = this.hopper.shift()
    this.totalDraws++

    if (card) {
      // Track for seam dedup across refills
      this.recentServed.push(card.id)
      if (this.recentServed.length > this.DEDUP_WINDOW) {
        this.recentServed.shift()
      }
      this.lastServedAspect = getPrimaryAspect(card)
      return { ...card }
    }

    return null
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

// Type for legacy pool structure
interface LegacyPool {
  primary1: RawCard[]
  primary2: RawCard[]
  assigned: RawCard[]
  neutral: RawCard[]
}

interface LegacyPools {
  poolA: LegacyPool
  poolB: LegacyPool
}

/**
 * Legacy function for backward compatibility
 * Returns pool objects structured like the old getCommonPools
 * @deprecated Use getBeltCards directly
 */
export function getCommonPools(setCode: SetCode | string): LegacyPools {
  const beltACards = getBeltCards(setCode, 'A')
  const beltBCards = getBeltCards(setCode, 'B')

  return {
    poolA: {
      primary1: beltACards,
      primary2: [],
      assigned: [],
      neutral: [],
    },
    poolB: {
      primary1: beltBCards,
      primary2: [],
      assigned: [],
      neutral: [],
    }
  }
}
