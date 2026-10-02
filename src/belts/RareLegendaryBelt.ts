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
  dedupWindow: number
  // Line-stacking sets only. Slots already consumed on the open legendary gap,
  // odd stream then even stream, each in 0..5. A new belt is a new cut, so the
  // phase is random; refills carry it so a segment seam stays inside the same gap.
  paritySince: number[]
  // Next line slot is an even line index. A fresh belt starts at line 1 (odd).
  nextSlotEven: boolean

  constructor(setCode: SetCode | string) {
    this.setCode = setCode as SetCode
    this.hopper = []
    this.fillingPool = []
    this.rares = []
    this.legendaries = []
    this.ratio = 7 // Default, will be set based on config
    // Same-card dedup window: forbids repeats within this many subsequent draws.
    // Window 6 → min allowed repeat distance 7. Set 7+ (LAW/ASH) loosen to 3 so a
    // same-rare repeat can occur at distance 4 (real ASH box 001), never back-to-back.
    this.dedupWindow = 6
    this.paritySince = [Math.floor(Math.random() * 6), Math.floor(Math.random() * 6)]
    this.nextSlotEven = false

    this._initialize()
  }

  /**
   * Initialize the belt by loading cards and setting up the filling pool
   */
  _initialize(): void {
    const cards = getCachedCards(this.setCode)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = getSetConfig(this.setCode) as any

    // Ratio and dedup window come from the set config (beltRatios/dedupWindows);
    // fallbacks preserve legacy behavior for unknown set codes.
    this.ratio = config?.beltRatios?.rareToLegendary ?? 7
    this.dedupWindow = config?.dedupWindows?.rareLegendary ?? 6

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

    // Line-stacking sets: a non-integer copy ratio (e.g. 4:1 with 50R/20L needs
    // 8x/5x under GCD) would explode the segment to 8 copies per rare — 5x the
    // real box's repeat rate (10 verified boxes: ~0.5 same-rare repeats/box vs
    // 2.6 generated at 8x density). The real sheet keeps low multiplicity:
    // 2x every rare + 1x every legendary + a few uniformly-chosen legendaries
    // doubled to hit the exact ratio (125 cards, 100R/25L = 4:1 for ASH).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfgLS = (getSetConfig(this.setCode) as any)?.packRules?.lineStackingCollation === true
    if (cfgLS) {
      // EQUAL FREQUENCY IS UNBREAKABLE: every rare gets the SAME copy count and
      // every legendary the SAME copy count. finalRareMult / finalLegMult were
      // already reduced from the ratio by GCD above — they ARE the LCM
      // equal-frequency copies (ASH 50R/20L @ 4:1 → 8 per rare, 5 per legendary;
      // 400:100 = 4:1). We size the sheet by that LCM rather than doubling a
      // subset of legendaries to fake the ratio. Multiplicity does NOT drive the
      // duplicate rate — SPACING does: each card's copies are laid ~one-pool
      // apart (interleaved shuffled rounds). The mask below chooses which slots
      // are legendary. The streams choose which card sits in the slot.
      const rareStream = this._buildRounds(this.rares, finalRareMult)
      const legStream = this._buildRounds(this.legendaries, finalLegMult)
      const size = legStream.length + rareStream.length
      // The box stacks every other pack, so a six-pack half-column is six
      // consecutive slots on one parity of this line. Steps of 3, 4, 5, or 6
      // on each parity average exactly 5 (the advertised 1-in-5). A step of 7
      // or more is what leaves a half-column empty. The phase is the cut.
      const isLeg = this._parityLegendaryMask(size, legStream.length)
      let li = 0
      let ri = 0
      for (let i = 0; i < size; i++) {
        segment.push(isLeg[i] ? legStream[li++]! : rareStream[ri++]!)
      }

      // Adjacency guard: the merged path can't run the identity dedup passes
      // (they swap ACROSS rarities and would scramble the cadence), but the fill
      // seam (and, rarely, a short-pair) can put the same card back-to-back. Fix
      // every distance-1 collision by swapping with a same-rarity card elsewhere
      // — cadence preserved because only like-rarity positions trade places.
      const prevTail = this.hopper.length > 0 ? this.hopper[this.hopper.length - 1] : undefined
      for (let i = 0; i < segment.length; i++) {
        const left = i === 0 ? prevTail : segment[i - 1]
        if (!isSameCard(left, segment[i])) continue
        for (let j = 0; j < segment.length; j++) {
          if (j === i || isLeg[j] !== isLeg[i]) continue
          const a = segment[i]!
          const b = segment[j]!
          const iLeft = i === 0 ? prevTail : segment[i - 1]
          if (!isSameCard(b, iLeft) && !isSameCard(b, segment[i + 1]) &&
              !isSameCard(a, segment[j - 1]) && !isSameCard(a, segment[j + 1])) {
            segment[i] = b
            segment[j] = a
            break
          }
        }
      }

      // Rarity spacing is intentional: do NOT run the identity dedup passes here.
      // They swap by card identity ACROSS rarities and would scramble the merge.
      // Each stream already spaced its own duplicates.
      this.hopper.push(...segment)
    } else {
      // Sets 1-6 (and any set where the low-multiplicity form can't hit the
      // ratio): original exact-GCD construction, byte-identical.
      for (let copy = 0; copy < finalRareMult; copy++) {
        segment.push(...this.rares)
      }
      for (let copy = 0; copy < finalLegMult; copy++) {
        segment.push(...this.legendaries)
      }

      // Shuffle and dedup by placement (identity passes are safe here — one flat
      // pool, no rarity cadence to protect).
      shuffle(segment)
      this._fullDedup(segment)
      const hopperStart = this.hopper.length
      this.hopper.push(...segment)
      if (!wasEmpty) {
        this._seamDedup(hopperStart, segment.length)
      }
    }
  }

  /**
   * Legendary slots for one line-stacking segment.
   *
   * Odd line positions and even line positions are separate streams. Each
   * stream places exactly its share of `legCount` legendaries, with the step
   * between consecutive legendaries in {3, 4, 5, 6} and the steps averaging 5.
   * That is 1 legendary in 5 rare slots, and every window of 6 slots on a
   * stream holds 1 or 2. `stackBoxOrder` turns those windows into half-columns;
   * this belt does not look at box order.
   *
   * `paritySince` is how far each stream already is into its open gap (0..5).
   * It is random on a new belt and carried across `_fill` calls, so a segment
   * seam cannot open a step outside 3–6. Segment length is not a multiple of
   * a 24-pack box, and the pod path keeps pulling, so the seam has to be legal.
   */
  _parityLegendaryMask(size: number, legCount: number): boolean[] {
    const isLeg: boolean[] = new Array(size).fill(false)
    if (size === 0 || legCount === 0) return isLeg

    const startEven = this.nextSlotEven
    let nOdd = 0
    let nEven = 0
    for (let i = 0; i < size; i++) {
      if (((i % 2 === 0) === startEven)) nEven++
      else nOdd++
    }

    // 4:1 sheet: size is 5 × legendaries and even, so each parity gets
    // exactly one legendary per five of its slots.
    const kOdd = Math.round(legCount * nOdd / size)
    const kEven = legCount - kOdd

    const odd = this._parityRun(nOdd, kOdd, this.paritySince[0]!)
    const even = this._parityRun(nEven, kEven, this.paritySince[1]!)
    this.paritySince[0] = odd.since
    this.paritySince[1] = even.since

    let oi = 0
    let ei = 0
    for (let i = 0; i < size; i++) {
      const evenLine = (i % 2 === 0) === startEven
      isLeg[i] = evenLine ? even.mask[ei++]! : odd.mask[oi++]!
    }
    if (size % 2 === 1) this.nextSlotEven = !startEven
    return isLeg
  }

  /**
   * One parity stream. `since` is slots already emitted since the previous
   * legendary. Returns the mask and the same counter for the next segment.
   */
  _parityRun(n: number, k: number, since: number): { mask: boolean[], since: number } {
    const mask: boolean[] = new Array(n).fill(false)
    if (k === 0) {
      return { mask, since: since + n }
    }

    const minFirst = Math.max(3, since + 1)
    const sumLo = Math.max(minFirst + 3 * (k - 1), n + since - 5)
    const sumHi = Math.min(6 * k, n + since)
    let target = 5 * k
    if (target < sumLo) target = sumLo
    if (target > sumHi) target = sumHi

    const gaps = this._gapsAveragingFive(k, target, minFirst)
    let need = gaps[0]! - since
    let gi = 0
    let placed = 0
    let out = since
    for (let i = 0; i < n; i++) {
      if (gi < gaps.length && need === 1) {
        mask[i] = true
        placed++
        out = 0
        gi++
        need = gi < gaps.length ? gaps[gi]! : n + 6
      } else {
        need--
        out++
      }
    }
    if (placed !== k) {
      throw new Error(`RareLegendaryBelt parity mask placed ${placed} of ${k} legendaries`)
    }
    return { mask, since: out }
  }

  /**
   * `k` steps in {3, 4, 5, 6} that sum to `target` (5k when the sheet allows
   * it, so the mean step is 5). Starts at all 5s, repairs the sum, then trades
   * 1 between pairs so a reader cannot point at one legendary and know the
   * next is five slots away. A 3 appears only when a 6 balances it.
   */
  _gapsAveragingFive(k: number, target: number, minFirst: number): number[] {
    const gaps: number[] = new Array(k).fill(5)
    if (gaps[0]! < minFirst) gaps[0] = minFirst

    const sum = () => gaps.reduce((a, b) => a + b, 0)
    const can = (i: number, dir: number) => {
      const next = gaps[i]! + dir
      if (next < 3 || next > 6) return false
      if (i === 0 && next < minFirst) return false
      return true
    }
    const pick = (dir: number) => {
      const order: number[] = []
      for (let i = 1; i < k; i++) order.push(i)
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const tmp = order[i]!
        order[i] = order[j]!
        order[j] = tmp
      }
      order.push(0)
      for (const i of order) if (can(i, dir)) return i
      return -1
    }

    let guard = 0
    while (sum() < target && guard++ < k * 8) {
      const i = pick(1)
      if (i < 0) break
      gaps[i]++
    }
    guard = 0
    while (sum() > target && guard++ < k * 8) {
      const i = pick(-1)
      if (i < 0) break
      gaps[i]--
    }

    // One trade per legendary. Sum stays put, so the mean stays 5.
    for (let t = 0; t < k; t++) {
      const i = Math.floor(Math.random() * k)
      const j = Math.floor(Math.random() * k)
      if (i === j || !can(i, 1) || !can(j, -1)) continue
      gaps[i]++
      gaps[j]--
    }
    return gaps
  }

  /**
   * Build a single-rarity stream with EXACTLY `copies` of every card (equal
   * frequency) as `copies` interleaved shuffled rounds — each round is the whole
   * pool shuffled, so a card's copies sit ~one-pool-length apart (well beyond a
   * 24-pack box). A window dedup fixes the round seams. Multiplicity here does
   * not affect the box duplicate rate (spacing does): the merge in _fill spreads
   * these further, and copies only collide in a box via the rare seam pair.
   */
  _buildRounds(cards: RawCard[], copies: number): RawCard[] {
    const stream: RawCard[] = []
    for (let r = 0; r < copies; r++) {
      stream.push(...shuffle([...cards]))
    }
    this._fullDedup(stream)
    this._injectShortPairs(stream, copies)
    return stream
  }

  /**
   * Real print sheets aren't perfectly spaced — a card occasionally has two
   * copies a few slots apart (Lee's boxes: ~0.5 same-rare repeats/box, gaps
   * 2-18). Pure rounds space every copy ~one-pool apart, killing that texture.
   * Relocate ONE copy of a rotating subset of identities to sit a short gap from
   * another copy. This is a SWAP (a copy moves, none are added/removed) so equal
   * frequency is untouched, and which identities get the close pair rotates every
   * fill so no card is favored long-run.
   */
  _injectShortPairs(stream: RawCard[], copies: number): void {
    if (copies < 2 || stream.length < 40) return
    const byId = new Map<string, number[]>()
    stream.forEach((c, i) => {
      const a = byId.get(c.id)
      if (a) a.push(i); else byId.set(c.id, [i])
    })
    const ids = shuffle([...byId.keys()])
    // ~6% of identities get a close pair per fill — empirically tuned to ~0.5
    // same-card repeats per sealed box (real: 10 verified boxes ~0.5). Rotates
    // every fill so no identity is favored long-run.
    const nPairs = Math.round(ids.length * 0.06)
    const GAPS = [2, 4, 6, 8, 10, 12, 15, 18]
    for (let k = 0; k < nPairs && k < ids.length; k++) {
      const positions = byId.get(ids[k])!
      if (positions.length < 2) continue
      const anchor = positions[Math.floor(Math.random() * positions.length)]!
      const gap = GAPS[Math.floor(Math.random() * GAPS.length)]!
      const dst = (anchor + gap) % stream.length
      if (stream[dst]!.id === ids[k]) continue // already a close copy there
      const src = positions.find(p => p !== anchor && p !== dst)
      if (src === undefined) continue
      const tmp = stream[src]!
      stream[src] = stream[dst]!
      stream[dst] = tmp
    }
  }

  /**
   * Full segment deduplication
   * Scan entire segment for duplicates within 6 slots and fix them
   */
  _fullDedup(segment: RawCard[], maxPasses = 3): void {
    const window = this.dedupWindow
    for (let pass = 0; pass < maxPasses; pass++) {
      let foundDuplicate = false

      for (let i = 0; i < segment.length; i++) {
        const card = segment[i]

        // Check for duplicates within `window` slots ahead
        for (let j = i + 1; j <= Math.min(i + window, segment.length - 1); j++) {
          if (isSameCard(card, segment[j])) {
            foundDuplicate = true
            // Find a swap candidate from further away (outside the window)
            const swapCandidates: number[] = []
            for (let k = 0; k < segment.length; k++) {
              // Must be outside the duplicate's window
              if (Math.abs(k - j) > window && Math.abs(k - i) > window) {
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
    const window = this.dedupWindow
    for (let offset = -window; offset <= window; offset++) {
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

    const window = this.dedupWindow
    const seamSize = Math.min(5, segmentLength)
    const backHalfStart = segmentStart + Math.floor(segmentLength / 2)
    const backHalfEnd = segmentStart + segmentLength

    for (let i = 0; i < seamSize; i++) {
      const cardIndex = segmentStart + i
      const card = this.hopper[cardIndex]

      // Check for duplicates within `window` slots (before and after)
      let hasDuplicate = false
      for (let offset = -window; offset <= window; offset++) {
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
