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
    const cycle: Set7PlusUc3Outcome[] = []
    for (const [outcome, count] of Object.entries(this.outcomeCounts) as Array<[Set7PlusUc3Outcome, number]>) {
      for (let i = 0; i < count; i++) {
        cycle.push(outcome)
      }
    }
    shuffle(cycle)
    this.hopper.push(...cycle)
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
