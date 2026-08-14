// @ts-nocheck
/**
 * UncommonBelt
 *
 * A belt that provides uncommon cards for booster packs.
 * One belt serves all 3 uncommon slots in a pack.
 *
 * CONSTRAINTS:
 * - Every card appears exactly once per boot (equal occurrence rate)
 * - No duplicate card within 24 positions (min(24, floor(beltSize/2)))
 * - No adjacent cards share primary aspect (aspects[0])
 * - Seam deduplication ensures constraints hold across boot boundaries
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

  // Sort groups by size descending
  const sortedKeys = [...groups.keys()].sort((a, b) =>
    (groups.get(b)?.length || 0) - (groups.get(a)?.length || 0)
  )

  // Rotate so first group's aspect differs from lastAspect
  if (lastAspect !== null) {
    const startIdx = sortedKeys.findIndex(k => k !== lastAspect)
    if (startIdx > 0) {
      const rotated = [...sortedKeys.slice(startIdx), ...sortedKeys.slice(0, startIdx)]
      sortedKeys.splice(0, sortedKeys.length, ...rotated)
    }
  }

  // Round-robin: pick from each aspect group in turn
  const result: RawCard[] = []
  let prevAspect: string | null = lastAspect
  let totalRemaining = cards.length

  while (totalRemaining > 0) {
    const available = sortedKeys.filter(k => (groups.get(k)?.length || 0) > 0)

    // Feasibility guard: an alternating arrangement of `total` cards exists iff
    // the largest aspect holds at most ceil(total / 2). So if placing anything
    // ELSE (leaving total-1) would break that bound for some aspect, that aspect
    // must go now. This is the only thing the old "always take the largest group"
    // rule was really enforcing.
    const forcedIdx = available.findIndex(k => groups.get(k)!.length > Math.ceil((totalRemaining - 1) / 2))
    const forced = forcedIdx >= 0 ? available[forcedIdx]! : undefined

    let choice: string | null
    if (forcedIdx >= 0 && forced !== prevAspect) {
      choice = forced as string | null
    } else {
      // Otherwise choose at random, weighted by how many cards each aspect has
      // left. The weighting keeps aspects evenly spread; the randomness removes
      // the fixed sheet POSITION that strict largest-first handed to small aspect
      // groups. A singleton aspect was placed at the tail of every boot, and
      // because the uncommon boot is 60 cards with 3 uncommons per pack (60 ≡ 0
      // mod 3) that tail position mapped to the UC3 slot in every single pack —
      // where the UC3 upgrade then replaced the card on ~1/3 of its appearances.
      // ASH has exactly one Heroism-primary and one Villainy-primary uncommon,
      // and both were short-printed ~2x (Yellow Aces Bomber 8.3σ below its pool
      // mean). See src/qa/printerDistribution.test.ts.
      const eligible = available.filter(k => k !== prevAspect)
      const pool = eligible.length > 0 ? eligible : available
      const total = pool.reduce((sum, k) => sum + groups.get(k)!.length, 0)
      let roll = Math.random() * total
      choice = pool[pool.length - 1]!
      for (const k of pool) {
        roll -= groups.get(k)!.length
        if (roll <= 0) { choice = k; break }
      }
    }

    const card = groups.get(choice)!.shift()!
    result.push(card)
    prevAspect = choice
    totalRemaining--
  }

  return result
}

export class UncommonBelt {
  setCode: SetCode
  hopper: RawCard[]
  fillingPool: RawCard[]
  recentServed: string[]
  lastServedAspect: string | null
  DEDUP_WINDOW: number
  aspectInterleave: boolean
  seamParity: boolean
  totalServed: number
  lastServedDraw: Map<string, number>
  _lastDrawUndo: { id: string; prev: number | undefined } | null

  constructor(setCode: SetCode | string) {
    this.setCode = setCode as SetCode
    this.hopper = []
    this.fillingPool = []
    this.recentServed = []
    this.lastServedAspect = null
    this.totalServed = 0
    this.lastServedDraw = new Map()
    this._lastDrawUndo = null

    this._initialize()
  }

  /**
   * Initialize the belt by loading cards and setting up the filling pool
   */
  _initialize(): void {
    const cards = getCachedCards(this.setCode)

    // Filter to normal variant uncommons (non-leader, non-base)
    this.fillingPool = cards.filter(c =>
      c.variantType === 'Normal' &&
      c.rarity === 'Uncommon' &&
      !c.isLeader &&
      !c.isBase
    )

    // Config-driven (dedupWindows.uncommon): 24 for sets 1-6; 2 for line-stacking
    // sets — the 6-box verified UC sheet shows seam repeats at pack-gaps 1-23
    // (the 24-window forbade every real short-gap repeat). Never setNumber branches.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = getSetConfig(this.setCode) as any
    this.DEDUP_WINDOW = Math.min(cfg?.dedupWindows?.uncommon ?? 24, Math.floor(this.fillingPool.length / 2))
    this.aspectInterleave = cfg?.packRules?.uncommonAspectInterleave ?? true
    // Line-stacking sets: seam repeats prefer ODD pack-gaps (6-box verified UC
    // sheet: 34 odd / 6 even of 40 repeats = 85% odd) — same parity structure
    // as the common sheet. Sheet-layout rule, applied at boot construction.
    this.seamParity = cfg?.packRules?.lineStackingCollation === true

    // Initial fill
    this._fillIfNeeded()
  }

  /**
   * Fill the hopper if it needs more cards
   */
  _fillIfNeeded(): void {
    if (this.fillingPool.length === 0) return
    while (this.hopper.length < this.fillingPool.length) {
      this._fill()
    }
  }

  /**
   * Fill the hopper with a new boot of ALL uncommon cards.
   * Every card appears exactly once per boot (no exclusion).
   */
  _fill(): void {
    const seamCards = [...this.hopper]
    const numSeam = seamCards.length

    // Compute per-card minimum positions
    const cardMinPositions = new Map<string, number>()

    // Seam cards
    for (let i = 0; i < seamCards.length; i++) {
      const distance = numSeam - i
      const minPos = Math.max(0, this.DEDUP_WINDOW - distance)
      const existing = cardMinPositions.get(seamCards[i]!.id) || 0
      cardMinPositions.set(seamCards[i]!.id, Math.max(existing, minPos))
    }

    // Recently served cards
    for (let i = 0; i < this.recentServed.length; i++) {
      const distance = numSeam + (this.recentServed.length - i)
      const minPos = Math.max(0, this.DEDUP_WINDOW - distance)
      if (minPos > 0) {
        const id = this.recentServed[i]!
        const existing = cardMinPositions.get(id) || 0
        cardMinPositions.set(id, Math.max(existing, minPos))
      }
    }

    // Last aspect from seam or last served
    let lastAspect = this.lastServedAspect
    if (seamCards.length > 0) {
      lastAspect = getPrimaryAspect(seamCards[seamCards.length - 1]!)
    }

    // Find max minPosition
    let maxMinPos = 0
    for (const [, minPos] of cardMinPositions) {
      if (minPos > maxMinPos) maxMinPos = minPos
    }

    // Split cards into early-eligible and late-only
    const earlyCards: RawCard[] = []
    const lateCards: RawCard[] = []
    for (const card of this.fillingPool) {
      const minPos = cardMinPositions.get(card.id) || 0
      if (minPos === 0) {
        earlyCards.push(card)
      } else {
        lateCards.push(card)
      }
    }

    // Build early zone (line-stacking sets: plain shuffle — real UC sheet shows
    // no aspect rotation; sets 1-6 keep the interleave)
    const earlySequence = this.aspectInterleave
      ? buildInterleavedSequence(earlyCards, lastAspect)
      : shuffle([...earlyCards])
    const earlyZoneSize = Math.min(maxMinPos, earlySequence.length)
    const boot: RawCard[] = earlySequence.slice(0, earlyZoneSize)

    // Build late zone with remaining cards
    const usedEarlyIds = new Set(boot.map(c => c.id))
    const remainingCards = [
      ...earlyCards.filter(c => !usedEarlyIds.has(c.id)),
      ...lateCards
    ]
    const prevAspect = boot.length > 0
      ? getPrimaryAspect(boot[boot.length - 1]!)
      : lastAspect
    const lateSequence = this.aspectInterleave
      ? buildInterleavedSequence(remainingCards, prevAspect)
      : shuffle([...remainingCards])
    boot.push(...lateSequence)

    const finalBoot = this.seamParity ? this._weaveEchoes(boot) : boot

    this.hopper.push(...finalBoot)
  }

  /**
   * Echo weaving (line-stacking sets): the real UC sheet repeats a small
   * subset of cards at short pack-gaps with strong ODD parity — measured from
   * six number-verified boxes (40 repeats): 34 odd / 6 even (85% odd), 62% at
   * <=9 packs, ~6.7 repeats per box. Odd gaps split the pair across the two
   * box columns; even gaps land it in one sealed pool.
   *
   * Single-pass rebuild with a pending-echo queue scheduled in FINAL pack
   * arithmetic (same construction as the CommonBelt paired boot), so parity is
   * exact by construction — splicing after the fact shifts downstream
   * positions and corrupts parity. Sheet layout only: no post-hoc pack edits,
   * no cross-belt awareness. Interleave-guarded; echoes defer a slot or drop
   * rather than violate aspect adjacency.
   */
  _weaveEchoes(boot: RawCard[]): RawCard[] {
    const UC_PER_PACK = 3
    // Gap sampler (packs), 6-box verified short-gap histogram:
    // odd {1:4, 5:6, 7:5, 9:4} | even {4:1, 6:2, 8:3} -> 76% odd
    const GAPS: number[] = []
    // full 6-box histogram incl. the odd long-gap tail (long gaps are all odd
    // in the real data — cross-column, they add repeat COUNT but no pool pairs)
    for (const [gap, w] of [[1, 4], [5, 6], [7, 5], [9, 4], [4, 1], [6, 2], [8, 3],
                            [11, 4], [13, 1], [15, 3], [17, 4], [19, 1], [21, 1], [23, 1]] as Array<[number, number]>) {
      for (let k = 0; k < w; k++) GAPS.push(gap)
    }
    const ECHO_COUNT = 6 + Math.floor(Math.random() * 2) // 6-7 per cycle -> ~6.7 visible repeats/box like the 6 verified boxes (boot-end echoes fall past the ~64 consumed draws)
    const echoIds = new Set(shuffle([...boot]).slice(0, ECHO_COUNT).map(c => c.id))
    const basePack = Math.floor((this.totalServed + this.hopper.length) / UC_PER_PACK)
    const out: RawCard[] = []
    const pending: Array<{ card: RawCard; duePack: number; firstIdx: number }> = []
    const stream = [...boot]
    const packOfOut = () => basePack + Math.floor(out.length / UC_PER_PACK)
    const okAfter = (c: RawCard) => {
      const prev = out[out.length - 1]
      if (prev && prev.id === c.id) return false // never adjacent same card
      const a = getPrimaryAspect(c)
      return !prev || a === null || getPrimaryAspect(prev) !== a
    }
    while (stream.length > 0 || pending.length > 0) {
      let emitted = false
      // due echoes first (exact final-pack parity)
      for (let e = 0; e < pending.length; e++) {
        const pd = pending[e]!
        if (packOfOut() >= pd.duePack && out.length - pd.firstIdx >= 3) {
          if (okAfter(pd.card)) {
            out.push(pd.card); pending.splice(e, 1); emitted = true
          } else if (packOfOut() > pd.duePack + 1) {
            pending.splice(e, 1) // can't place without breaking interleave: drop
          }
          break
        }
      }
      if (emitted) continue
      // next primary card (bounded look-ahead for interleave)
      let idx = -1
      for (let j = 0; j < Math.min(8, stream.length); j++) {
        if (okAfter(stream[j]!)) { idx = j; break }
      }
      if (idx === -1 && stream.length > 0) idx = 0
      if (idx >= 0) {
        const c = stream.splice(idx, 1)[0]!
        out.push(c)
        if (echoIds.has(c.id)) {
          echoIds.delete(c.id)
          const gap = GAPS[Math.floor(Math.random() * GAPS.length)]!
          pending.push({ card: c, duePack: basePack + Math.floor((out.length - 1) / UC_PER_PACK) + gap, firstIdx: out.length - 1 })
        }
      } else if (pending.length > 0) {
        // only pendings remain; emit respecting the min-distance rule
        const e = pending.findIndex(pd => out.length - pd.firstIdx >= 3)
        if (e >= 0) { out.push(pending[e]!.card); pending.splice(e, 1) }
        else pending.length = 0 // cannot place without violating min distance: drop
      }
    }
    return out
  }


  /**
   * Get the next uncommon from the hopper
   */
  next(): RawCard | null {
    this._fillIfNeeded()

    const card = this.hopper.shift()
    if (card) {
      this._lastDrawUndo = { id: card.id, prev: this.lastServedDraw.get(card.id) }
      this.lastServedDraw.set(card.id, this.totalServed)
      this.totalServed++
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
  /**
   * Return the most recently drawn card to the FRONT of the belt — physical
   * semantics: an upgraded slot's card comes from another sheet, so the
   * normal-UC sheet never advanced. Undoes the draw bookkeeping exactly.
   * Only valid for the immediately preceding next() result.
   */
  putBack(card: RawCard): void {
    if (!this._lastDrawUndo || this._lastDrawUndo.id !== card.id) return
    this.hopper.unshift(card)
    this.totalServed--
    if (this._lastDrawUndo.prev === undefined) this.lastServedDraw.delete(card.id)
    else this.lastServedDraw.set(card.id, this._lastDrawUndo.prev)
    const r = this.recentServed.lastIndexOf(card.id)
    if (r >= 0) this.recentServed.splice(r, 1)
    this._lastDrawUndo = null
  }

}
