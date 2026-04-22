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
export type BeltId = 'A' | 'B'
type BeltVariant = 'Normal' | 'Hyperspace'

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
  } else if (block === 'A') {
    // Block A
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
  } else {
    // Block B (LAW+)
    if (beltId === 'A') {
      return {
        drawSize: 4,
        requiredAspects: [BLUE, RED]
      }
    } else {
      return {
        drawSize: 4,
        requiredAspects: [GREEN, YELLOW]
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

function cardHasAspect(card: RawCard, aspect: string): boolean {
  return (card.aspects || []).includes(aspect)
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

function segmentHasRequiredAspects(cards: RawCard[], requiredAspects: string[]): boolean {
  return requiredAspects.every(aspect => cards.some(card => cardHasAspect(card, aspect)))
}

function shuffleCopy<T>(arr: T[]): T[] {
  return shuffle([...arr])
}

function buildAspectTargetPositions(cards: RawCard[]): Map<string | null, number[]> {
  const groups = new Map<string | null, number>()
  for (const card of cards) {
    const aspect = getPrimaryAspect(card)
    groups.set(aspect, (groups.get(aspect) || 0) + 1)
  }

  const targets = new Map<string | null, number[]>()
  const total = cards.length
  for (const [aspect, count] of groups) {
    const positions: number[] = []
    for (let i = 0; i < count; i++) {
      positions.push(Math.round(((i + 0.5) * total) / count - 0.5))
    }
    targets.set(aspect, positions)
  }

  return targets
}

function getPatternTarget(
  requiredAspects: string[],
  drawSize: number,
  absolutePos: number
): string | null {
  const phase = absolutePos % drawSize
  return phase < requiredAspects.length ? requiredAspects[phase]! : null
}

function sortChunkCandidates(
  candidates: RawCard[],
  localSegment: RawCard[],
  requiredAspects: string[],
  prevAspect: string | null,
  targetAspect: string | null
): RawCard[] {
  const seenAspects = new Set(localSegment.flatMap(card => card.aspects || []))

  return [...candidates].sort((a, b) => {
    const aPrimary = getPrimaryAspect(a)
    const bPrimary = getPrimaryAspect(b)
    const aMatchesTarget = targetAspect && cardHasAspect(a, targetAspect) ? 1 : 0
    const bMatchesTarget = targetAspect && cardHasAspect(b, targetAspect) ? 1 : 0
    if (aMatchesTarget !== bMatchesTarget) return bMatchesTarget - aMatchesTarget

    const aHelps = requiredAspects.some(aspect => !seenAspects.has(aspect) && cardHasAspect(a, aspect)) ? 1 : 0
    const bHelps = requiredAspects.some(aspect => !seenAspects.has(aspect) && cardHasAspect(b, aspect)) ? 1 : 0
    if (aHelps !== bHelps) return bHelps - aHelps

    const aAdjPenalty = aPrimary && aPrimary === prevAspect ? 1 : 0
    const bAdjPenalty = bPrimary && bPrimary === prevAspect ? 1 : 0
    if (aAdjPenalty !== bAdjPenalty) return aAdjPenalty - bAdjPenalty

    const aPrimaryNeeded = aPrimary && requiredAspects.includes(aPrimary) ? 1 : 0
    const bPrimaryNeeded = bPrimary && requiredAspects.includes(bPrimary) ? 1 : 0
    if (aPrimaryNeeded !== bPrimaryNeeded) return bPrimaryNeeded - aPrimaryNeeded

    return Math.random() - 0.5
  })
}

function canStillCompleteSegment(
  segmentCards: RawCard[],
  remaining: RawCard[],
  requiredAspects: string[],
  slotsLeft: number,
  segmentEndPos: number,
  cardMinPositions: Map<string, number>
): boolean {
  const missing = requiredAspects.filter(aspect =>
    !segmentCards.some(card => cardHasAspect(card, aspect))
  )

  if (missing.length > slotsLeft) return false
  if (missing.length === 0) return true

  const futureEligible = remaining.filter(card =>
    (cardMinPositions.get(card.id) || 0) < segmentEndPos
  )

  return missing.every(aspect =>
    futureEligible.some(card => cardHasAspect(card, aspect))
  )
}

function hasEnoughCoverageForFutureSegments(
  remainingCards: RawCard[],
  requiredAspects: string[],
  futureFullSegments: number
): boolean {
  if (futureFullSegments <= 0) return true

  return requiredAspects.every(aspect => {
    const count = remainingCards.filter(card => cardHasAspect(card, aspect)).length
    return count >= futureFullSegments
  })
}

function countFuturePatternNeeds(
  totalLength: number,
  nextPos: number,
  startPhase: number,
  drawSize: number,
  requiredAspects: string[]
): Map<string, number> {
  const needs = new Map<string, number>()
  requiredAspects.forEach(aspect => needs.set(aspect, 0))

  for (let pos = nextPos; pos < totalLength; pos++) {
    const target = getPatternTarget(requiredAspects, drawSize, startPhase + pos)
    if (target) {
      needs.set(target, (needs.get(target) || 0) + 1)
    }
  }

  return needs
}

function hasEnoughCardsForFuturePatternNeeds(
  remainingCards: RawCard[],
  needs: Map<string, number>
): boolean {
  for (const [aspect, needed] of needs) {
    const available = remainingCards.filter(card => cardHasAspect(card, aspect)).length
    if (available < needed) {
      return false
    }
  }

  return true
}

function buildSegmentChunk(
  prefixCards: RawCard[],
  availableCards: RawCard[],
  chunkSize: number,
  requiredAspects: string[],
  startPos: number,
  cardMinPositions: Map<string, number>,
  prevAspect: string | null,
  futureFullSegments: number,
  startPhase: number,
  drawSize: number,
  totalLength: number
): RawCard[] | null {
  const segmentEndPos = startPos + chunkSize

  function backtrack(
    localSegment: RawCard[],
    remainingCards: RawCard[],
    currentPrevAspect: string | null
  ): RawCard[] | null {
    if (localSegment.length === chunkSize) {
      const fullSegment = [...prefixCards, ...localSegment]
      return segmentHasRequiredAspects(fullSegment, requiredAspects) ? localSegment : null
    }

    const currentPos = startPos + localSegment.length
    const eligible = remainingCards.filter(card => (cardMinPositions.get(card.id) || 0) <= currentPos)
    let pool = eligible.length > 0 ? eligible : remainingCards
    const targetAspect = getPatternTarget(requiredAspects, drawSize, startPhase + currentPos)
    if (
      targetAspect &&
      !pool.some(card => cardHasAspect(card, targetAspect)) &&
      remainingCards.some(card => cardHasAspect(card, targetAspect))
    ) {
      pool = remainingCards
    }
    const ordered = sortChunkCandidates(
      pool,
      [...prefixCards, ...localSegment],
      requiredAspects,
      currentPrevAspect,
      targetAspect
    )

    for (const candidate of ordered) {
      const candidatePrimary = getPrimaryAspect(candidate)
      const hasNonAdjacentAlternative = ordered.some(other => getPrimaryAspect(other) !== currentPrevAspect)
      if (candidatePrimary && currentPrevAspect === candidatePrimary && hasNonAdjacentAlternative) {
        continue
      }

      if (targetAspect && !cardHasAspect(candidate, targetAspect)) {
        continue
      }

      const nextRemaining = remainingCards.filter(card => card.id !== candidate.id)
      const nextSegment = [...prefixCards, ...localSegment, candidate]
      const slotsLeft = chunkSize - (localSegment.length + 1)

      if (!canStillCompleteSegment(nextSegment, nextRemaining, requiredAspects, slotsLeft, segmentEndPos, cardMinPositions)) {
        continue
      }

      if (!hasEnoughCoverageForFutureSegments(nextRemaining, requiredAspects, futureFullSegments)) {
        continue
      }

      const futureNeeds = countFuturePatternNeeds(
        totalLength,
        currentPos + 1,
        startPhase,
        drawSize,
        requiredAspects
      )
      if (!hasEnoughCardsForFuturePatternNeeds(nextRemaining, futureNeeds)) {
        continue
      }

      const built = backtrack([...localSegment, candidate], nextRemaining, candidatePrimary)
      if (built) return built
    }

    return null
  }

  return backtrack([], availableCards, prevAspect)
}
function buildLooseTail(
  cards: RawCard[],
  startPos: number,
  cardMinPositions: Map<string, number>,
  prevAspect: string | null,
  startPhase: number,
  requiredAspects: string[],
  drawSize: number,
  totalLength: number
): RawCard[] {
  const remaining = [...cards]
  const result: RawCard[] = []
  let currentPrevAspect = prevAspect

  while (remaining.length > 0) {
    const currentPos = startPos + result.length
    const eligible = remaining.filter(card => (cardMinPositions.get(card.id) || 0) <= currentPos)
    let pool = eligible.length > 0 ? eligible : remaining
    const targetAspect = getPatternTarget(requiredAspects, drawSize, startPhase + currentPos)
    if (
      targetAspect &&
      !pool.some(card => cardHasAspect(card, targetAspect)) &&
      remaining.some(card => cardHasAspect(card, targetAspect))
    ) {
      pool = remaining
    }
    const ordered = shuffleCopy(pool).sort((a, b) => {
      const aMatchesTarget = targetAspect && cardHasAspect(a, targetAspect) ? 1 : 0
      const bMatchesTarget = targetAspect && cardHasAspect(b, targetAspect) ? 1 : 0
      if (aMatchesTarget !== bMatchesTarget) return bMatchesTarget - aMatchesTarget

      const aSame = getPrimaryAspect(a) && getPrimaryAspect(a) === currentPrevAspect ? 1 : 0
      const bSame = getPrimaryAspect(b) && getPrimaryAspect(b) === currentPrevAspect ? 1 : 0
      return aSame - bSame
    })
    let chosen: RawCard | null = null
    for (const card of ordered) {
      const nextRemaining = remaining.filter(c => c.id !== card.id)
      const futureNeeds = countFuturePatternNeeds(
        totalLength,
        currentPos + 1,
        startPhase,
        drawSize,
        requiredAspects
      )
      if (!hasEnoughCardsForFuturePatternNeeds(nextRemaining, futureNeeds)) {
        continue
      }
      chosen = card
      break
    }
    const card = chosen || ordered[0]!
    result.push(card)
    currentPrevAspect = getPrimaryAspect(card)
    const index = remaining.findIndex(c => c.id === card.id)
    remaining.splice(index, 1)
  }

  return result
}

function slidingWindowsHaveRequiredAspects(
  boot: RawCard[],
  seamCards: RawCard[],
  drawSize: number,
  requiredAspects: string[]
): boolean {
  const seamPrefix = seamCards.slice(-(drawSize - 1))
  const combined = [...seamPrefix, ...boot]
  const firstNewIndex = seamPrefix.length

  for (let start = 0; start + drawSize <= combined.length; start++) {
    if (start + drawSize <= firstNewIndex) continue
    const window = combined.slice(start, start + drawSize)
    if (!segmentHasRequiredAspects(window, requiredAspects)) {
      return false
    }
  }

  return true
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
  lastAspect: string | null,
  seamCards: RawCard[],
  startPhase: number
): RawCard[] {
  if (cards.length === 0) return []

  const seamPrefix = seamCards.slice(-(drawSize - 1))
  const aspectTargets = buildAspectTargetPositions(cards)

  function getUrgentAspects(result: RawCard[]): Set<string> {
    const combined = [...seamPrefix, ...result]
    const currentIndex = combined.length
    const urgent = new Set<string>()

    for (let start = Math.max(0, currentIndex - drawSize + 1); start <= currentIndex; start++) {
      const end = start + drawSize - 1
      if (end < seamPrefix.length || end >= seamPrefix.length + cards.length) continue

      const windowCards = combined.slice(start, Math.min(currentIndex, end + 1))
      const missing = requiredAspects.filter(aspect =>
        !windowCards.some(card => cardHasAspect(card, aspect))
      )
      const slotsLeft = end - currentIndex + 1
      if (slotsLeft > 0 && missing.length >= slotsLeft) {
        missing.forEach(aspect => urgent.add(aspect))
      }
    }

    return urgent
  }

  function canCoverMissingAspects(
    missing: string[],
    eligibleCards: RawCard[],
    slotsLeft: number
  ): boolean {
    if (missing.length === 0) return true
    if (slotsLeft <= 0) return false

    const uniqueMissing = [...new Set(missing)]
    const candidates = eligibleCards.filter(card =>
      uniqueMissing.some(aspect => cardHasAspect(card, aspect))
    )

    function backtrack(index: number, covered: Set<string>, picksLeft: number): boolean {
      if (uniqueMissing.every(aspect => covered.has(aspect))) return true
      if (picksLeft === 0 || index >= candidates.length) return false

      for (let i = index; i < candidates.length; i++) {
        const nextCovered = new Set(covered)
        for (const aspect of uniqueMissing) {
          if (cardHasAspect(candidates[i]!, aspect)) {
            nextCovered.add(aspect)
          }
        }
        if (backtrack(i + 1, nextCovered, picksLeft - 1)) {
          return true
        }
      }

      return false
    }

    return backtrack(0, new Set<string>(), slotsLeft)
  }

  function windowsRemainFeasible(result: RawCard[], remainingCards: RawCard[]): boolean {
    const combined = [...seamPrefix, ...result]

    for (let start = 0; start < combined.length; start++) {
      const end = start + drawSize - 1
      if (end < seamPrefix.length || end >= seamPrefix.length + cards.length) continue

      const windowCards = combined.slice(start, Math.min(combined.length, end + 1))
      const missing = requiredAspects.filter(aspect =>
        !windowCards.some(card => cardHasAspect(card, aspect))
      )
      const slotsLeft = Math.max(0, end - combined.length + 1)

      if (missing.length === 0) continue
      if (slotsLeft === 0) return false

      const lastBootPos = end - seamPrefix.length
      const eligibleFutureCards = remainingCards.filter(card =>
        (cardMinPositions.get(card.id) || 0) <= lastBootPos
      )

      if (!canCoverMissingAspects(missing, eligibleFutureCards, slotsLeft)) {
        return false
      }
    }

    return true
  }

  function buildByWindows(remainingCards: RawCard[], prevAspect: string | null): RawCard[] | null {
    const remaining = [...remainingCards]
    const result: RawCard[] = []
    let currentPrevAspect = prevAspect
    const aspectUsage = new Map<string | null, number>()

    for (let pos = 0; pos < cards.length; pos++) {
      const eligible = remaining.filter(card => (cardMinPositions.get(card.id) || 0) <= pos)
      if (eligible.length === 0) {
        return null
      }

      const pool = eligible
      const urgentAspects = getUrgentAspects(result)

      const ordered = [...pool].sort((a, b) => {
        const aPrimary = getPrimaryAspect(a)
        const bPrimary = getPrimaryAspect(b)
        const aUrgent = [...urgentAspects].filter(aspect => cardHasAspect(a, aspect)).length
        const bUrgent = [...urgentAspects].filter(aspect => cardHasAspect(b, aspect)).length
        if (aUrgent !== bUrgent) return bUrgent - aUrgent

        const aSame = aPrimary && aPrimary === currentPrevAspect ? 1 : 0
        const bSame = bPrimary && bPrimary === currentPrevAspect ? 1 : 0
        if (aSame !== bSame) return aSame - bSame

        const aTargetList = aspectTargets.get(aPrimary) || []
        const bTargetList = aspectTargets.get(bPrimary) || []
        const aTargetIndex = aspectUsage.get(aPrimary) || 0
        const bTargetIndex = aspectUsage.get(bPrimary) || 0
        const aOverdue = (pos - (aTargetList[aTargetIndex] ?? pos)) * ((aTargetList.length + 1) / cards.length)
        const bOverdue = (pos - (bTargetList[bTargetIndex] ?? pos)) * ((bTargetList.length + 1) / cards.length)
        if (aOverdue !== bOverdue) return bOverdue - aOverdue

        const aRequiredCount = requiredAspects.filter(aspect => cardHasAspect(a, aspect)).length
        const bRequiredCount = requiredAspects.filter(aspect => cardHasAspect(b, aspect)).length
        if (aRequiredCount !== bRequiredCount) return bRequiredCount - aRequiredCount

        return Math.random() - 0.5
      })

      let chosen: RawCard | null = null
      const hasAspectAlternative = ordered.some(candidate => getPrimaryAspect(candidate) !== currentPrevAspect)
      for (const candidate of ordered) {
        const candidatePrimary = getPrimaryAspect(candidate)
        if (
          candidatePrimary &&
          candidatePrimary === currentPrevAspect &&
          hasAspectAlternative
        ) {
          continue
        }

        const nextRemaining = remaining.filter(card => card.id !== candidate.id)
        if (!windowsRemainFeasible([...result, candidate], nextRemaining)) {
          continue
        }

        chosen = candidate
        break
      }

      if (!chosen) {
        return null
      }

      result.push(chosen)
      currentPrevAspect = getPrimaryAspect(chosen)
      aspectUsage.set(currentPrevAspect, (aspectUsage.get(currentPrevAspect) || 0) + 1)
      const index = remaining.findIndex(card => card.id === chosen.id)
      remaining.splice(index, 1)
    }

    return result
  }

  for (let attempt = 0; attempt < 2000; attempt++) {
    const result = buildByWindows(shuffleCopy(cards), lastAspect)
    if (!result) continue
    if (slidingWindowsHaveRequiredAspects(result, seamCards, drawSize, requiredAspects)) {
      return result
    }
  }

  return buildInterleavedSequence(cards, lastAspect)
}

/**
 * Get common cards for a specific belt from static assignments or auto-assignment
 */
export function getBeltCards(
  setCode: SetCode | string,
  beltId: BeltId,
  variantType: BeltVariant = 'Normal'
): RawCard[] {
  const cards = getCachedCards(setCode)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignments = (COMMON_BELT_ASSIGNMENTS as Record<string, any>)[setCode]

  if (!assignments) {
    console.warn(`No belt assignments found for set ${setCode}`)
    return []
  }

  // Filter to commons of the requested variant (non-leader, non-base)
  const allCommons = cards.filter(c =>
    c.variantType === variantType &&
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
  variantType: BeltVariant
  hopper: RawCard[]
  beltCards: RawCard[]
  segmentConfig: SegmentConfig
  recentServed: string[]  // Last N card IDs served via next()
  lastServedAspect: string | null  // Primary aspect of last card served
  DEDUP_WINDOW: number
  totalDraws: number

  constructor(
    setCode: SetCode | string,
    beltId: BeltId,
    variantType: BeltVariant = 'Normal'
  ) {
    this.setCode = setCode as SetCode
    this.beltId = beltId
    this.variantType = variantType
    this.hopper = []

    // Get cards assigned to this belt
    this.beltCards = getBeltCards(setCode, beltId, variantType)

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
      lastAspect,
      seamCards,
      (this.totalDraws + seamCards.length) % drawSize
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
      if (this.variantType === 'Hyperspace') {
        return { ...card, isHyperspace: true }
      }
      return { ...card }
    }

    return null
  }

  /**
   * Peek at upcoming cards without removing them
   */
  peek(count = 1): RawCard[] {
    this._fillIfNeeded()
    return this.hopper.slice(0, count).map(c =>
      this.variantType === 'Hyperspace'
        ? { ...c, isHyperspace: true }
        : { ...c }
    )
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
