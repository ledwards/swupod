// @ts-nocheck
/**
 * Set7PlusUc3OutcomeBelt
 *
 * Printer-like collation for the UC3 slot in LAW/ASH-style packs.
 * The whole UC3 outcome is budgeted in advance:
 * - none
 * - prestige
 * - hyperspace uncommon
 * - hyperspace rare
 * - hyperspace special
 * - hyperspace legendary
 *
 * One 2160-pack cycle exactly encodes the configured prestige rate and the
 * LAW-shaped HS-only upgrade budget:
 * - Prestige: configurable per set (LAW: 1/18, ASH: 1/12 from box openings)
 * - HS-only upgrade: LAW-shaped budget until more ASH data says otherwise
 * - HS rarity mix: UC:R:S:L = 24:12:3:1
 */

export type Set7PlusUc3Outcome =
  | 'none'
  | 'prestige'
  | 'hsUncommon'
  | 'hsRare'
  | 'hsSpecial'
  | 'hsLegendary'

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = arr[i]
    arr[i] = arr[j]!
    arr[j] = temp!
  }
  return arr
}

const CYCLE_SIZE = 2160
const DEFAULT_PRESTIGE_RATE = 1 / 18
const HS_OUTCOME_COUNTS: Omit<Record<Set7PlusUc3Outcome, number>, 'none' | 'prestige'> = {
  hsUncommon: 408,
  hsRare: 204,
  hsSpecial: 51,
  hsLegendary: 17,
}

function buildOutcomeCounts(prestigeRate = DEFAULT_PRESTIGE_RATE): Record<Set7PlusUc3Outcome, number> {
  const prestige = Math.round(CYCLE_SIZE * prestigeRate)
  const hsTotal = Object.values(HS_OUTCOME_COUNTS).reduce((sum, count) => sum + count, 0)
  const none = CYCLE_SIZE - prestige - hsTotal

  if (none < 0) {
    throw new Error(`UC3 outcome counts exceed cycle size for prestige rate ${prestigeRate}`)
  }

  return {
    none,
    prestige,
    ...HS_OUTCOME_COUNTS,
  }
}

export class Set7PlusUc3OutcomeBelt {
  hopper: Set7PlusUc3Outcome[]
  outcomeCounts: Record<Set7PlusUc3Outcome, number>

  constructor(options: { prestigeRate?: number } = {}) {
    this.hopper = []
    this.outcomeCounts = buildOutcomeCounts(options.prestigeRate ?? DEFAULT_PRESTIGE_RATE)
    this._fill()
  }

  _fill(): void {
    // Prestige is a SHEET-CUT, not a coin flip. A real print sheet rations
    // prestige to roughly one per N packs, so any 24-pack box lands on 1-2 and
    // never a random cluster of 3-4. Shuffling prestige into the hopper (the old
    // behavior) gave Binomial(24, rate) variance — it coughed up 4+/box a few %
    // of the time, which is what a real box never does (11 boxes: max 2 ever).
    //
    // So: the HS-only outcomes still ride a shuffled hopper (they cluster fine
    // IRL), but prestige is placed at near-even intervals with small jitter.
    // With interval I and jitter <= I/6, consecutive prestige sit I ± I/3 apart,
    // i.e. within [I*5/6, I*7/6]; for the default 1/18 (I = 18) that is [15, 21]
    // — so no 24-window ever holds >2 or <1, matching the real box distribution.
    const total = CYCLE_SIZE
    const prestigeCount = this.outcomeCounts.prestige

    const rest: Set7PlusUc3Outcome[] = []
    for (const [outcome, count] of Object.entries(this.outcomeCounts) as Array<[Set7PlusUc3Outcome, number]>) {
      if (outcome === 'prestige') continue
      for (let i = 0; i < count; i++) rest.push(outcome)
    }
    shuffle(rest)

    const cycle: (Set7PlusUc3Outcome | null)[] = new Array(total).fill(null)

    if (prestigeCount > 0) {
      const interval = total / prestigeCount
      const jitter = Math.max(0, Math.floor(interval / 6))
      // Random phase: generateSealedBox clears belts per box, so each fresh box
      // consumes the FIRST 24 of a new cycle. Without a phase every box would
      // sample the same window and the per-box mean would drift high (~2 instead
      // of 1.3). A random phase makes a fresh cut land on a random window.
      const phase = Math.random() * interval
      for (let k = 0; k < prestigeCount; k++) {
        const wobble = jitter > 0 ? Math.floor(Math.random() * (2 * jitter + 1)) - jitter : 0
        let pos = Math.round(phase + k * interval + wobble) % total
        if (pos < 0) pos += total
        // Collisions are rare with small jitter; probe forward for a free slot.
        let guard = 0
        while (cycle[pos] !== null && guard < total) {
          pos = (pos + 1) % total
          guard++
        }
        cycle[pos] = 'prestige'
      }
    }

    let r = 0
    for (let i = 0; i < total; i++) {
      if (cycle[i] === null) cycle[i] = rest[r++]!
    }

    this.hopper.push(...(cycle as Set7PlusUc3Outcome[]))
  }

  next(): Set7PlusUc3Outcome {
    if (this.hopper.length === 0) {
      this._fill()
    }
    return this.hopper.shift()!
  }

  peek(count = 1): Set7PlusUc3Outcome[] {
    return this.hopper.slice(0, count)
  }

  get size(): number {
    return this.hopper.length
  }
}
