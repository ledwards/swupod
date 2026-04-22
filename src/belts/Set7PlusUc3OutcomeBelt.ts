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
 * One 2160-pack cycle exactly encodes:
 * - Prestige: 1/18
 * - HS-only upgrade: (17/18) * (1/3)
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

const OUTCOME_COUNTS: Record<Set7PlusUc3Outcome, number> = {
  none: 1360,
  prestige: 120,
  hsUncommon: 408,
  hsRare: 204,
  hsSpecial: 51,
  hsLegendary: 17,
}

export class Set7PlusUc3OutcomeBelt {
  hopper: Set7PlusUc3Outcome[]

  constructor() {
    this.hopper = []
    this._fill()
  }

  _fill(): void {
    const cycle: Set7PlusUc3Outcome[] = []
    for (const [outcome, count] of Object.entries(OUTCOME_COUNTS) as Array<[Set7PlusUc3Outcome, number]>) {
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
