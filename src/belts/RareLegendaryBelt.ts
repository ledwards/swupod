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
    const RARE_COPIES = 2
    const extraLegs = Math.round((RARE_COPIES * rareCount) / this.ratio) - legCount
    if (cfgLS && extraLegs >= 0) {
      // Rarity is a SHEET-CUT, not a coin flip. Real rare sheets space
      // legendaries ~every (ratio+1) slots — Lee's ordered case, reconstructed in
      // LINE order, shows L-to-L gaps mean ~5, range 1-9, mode 5 (NOT the
      // geometric/binomial gaps a shuffled sheet gives, which let a 24-pack box
      // hold anywhere from 0 to 11 legendaries vs the real fixed ~5).
      //
      // Build a rare stream and a legendary stream, each internally spacing its
      // OWN same-card copies (50-75 slots apart + a few short pairs, so the
      // ~0.5 same-rare-repeats/box the 10 verified boxes show is preserved), then
      // MERGE by dropping a legendary every ~size/nLeg positions with jitter and
      // a random phase. Result: ~5 legendaries in every 24-pack box (real sd
      // ~0.3), local 4:1 ratio in every window, same-card copies still apart.
      const doubled = shuffle([...this.legendaries]).slice(0, extraLegs)
      const legStream = this._buildDupSpacedStream([...this.legendaries, ...doubled])
      const rareStream = this._buildDupSpacedStream([...this.rares, ...this.rares])
      const size = legStream.length + rareStream.length
      const isLeg: boolean[] = new Array(size).fill(false)
      const interval = size / legStream.length
      // jitter = floor(interval/2) → L-to-L gaps span ~[1, 2*interval-1], matching
      // the real 1-9 range at interval 5; independent wobble can't stack two gap-1s.
      const jitter = Math.max(1, Math.floor(interval / 2))
      const phase = Math.random() * interval // fresh-box cut samples a random window
      for (let k = 0; k < legStream.length; k++) {
        const wobble = Math.floor(Math.random() * (2 * jitter + 1)) - jitter
        let pos = Math.round(phase + k * interval + wobble) % size
        if (pos < 0) pos += size
        let guard = 0
        while (isLeg[pos] && guard < size) { pos = (pos + 1) % size; guard++ }
        isLeg[pos] = true
      }
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
   * Shuffle a single-rarity pool and space each card's copies apart by PLACEMENT
   * (50-75 slots cyclically, plus 2-3 explicit short pairs at gaps 4-15) — the
   * same low-multiplicity dup-spacing the shipped pair-sheet used, but per rarity
   * so the rarity merge in _fill can control legendary cadence independently.
   * Cards appearing once are dropped into the remaining free slots.
   */
  _buildDupSpacedStream(cards: RawCard[]): RawCard[] {
    const counts = new Map<string, number>()
    for (const c of cards) counts.set(c.id, (counts.get(c.id) || 0) + 1)
    const seen = new Set<string>()
    const pairs: RawCard[] = []
    const singles: RawCard[] = []
    for (const c of cards) {
      if ((counts.get(c.id) || 0) >= 2) {
        if (!seen.has(c.id)) { pairs.push(c); seen.add(c.id) }
      } else {
        singles.push(c)
      }
    }
    // Shuffle which identities get the short-pair vs far-pair treatment — without
    // this the same (pool-order) cards always get the close-copy layout and land
    // in a box's first-24 cut twice more often, breaking equal occurrence within
    // the rarity (rare CV ran 4.0% vs the uniform 2.9%).
    shuffle(pairs)
    const size = cards.length
    const slots: (RawCard | null)[] = new Array(size).fill(null)
    const free = () => slots.map((v, i) => (v === null ? i : -1)).filter(i => i >= 0)
    const SHORT_PAIRS = 2 + Math.floor(Math.random() * 2)
    const SHORT_GAPS = [4, 6, 8, 10, 12, 15]
    for (let k = 0; k < pairs.length; k++) {
      const card = pairs[k]!
      const fr = free()
      const a = fr[Math.floor(Math.random() * fr.length)]!
      slots[a] = card
      let b: number
      if (k < SHORT_PAIRS) {
        b = a + SHORT_GAPS[Math.floor(Math.random() * SHORT_GAPS.length)]!
      } else {
        b = (a + Math.floor(size * 0.4) + Math.floor(Math.random() * size * 0.2)) % size
      }
      for (let step = 0; step < size; step++) {
        const cand = (b + step) % size
        if (slots[cand] === null) { slots[cand] = card; break }
      }
    }
    for (const single of shuffle([...singles])) {
      const fr = free()
      if (fr.length === 0) break
      slots[fr[Math.floor(Math.random() * fr.length)]!] = single
    }
    return slots.filter(Boolean) as RawCard[]
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
