// @ts-nocheck
/**
 * CommonUpgradeBelt
 *
 * A small collation belt that pre-determines which packs get a common slot
 * upgraded to a Hyperspace common (drawn from HyperspaceCommonBelt).
 *
 * LAW+ only. Cycle of 48 packs:
 *   - 1 pack upgrades Belt A slot 4 (pack index 5) → HS common from HyperspaceCommonBelt
 *   - 1 pack upgrades Belt B slot 6 (pack index 7) → HS common from HyperspaceCommonBelt
 *   - 46 packs get no common upgrade
 *
 * This gives exactly 1 upgrade per box (24 packs) on average.
 * The upgraded slot gets a fresh draw from the HyperspaceCommonBelt,
 * replacing the normal common entirely (not transforming it).
 */

export type CommonUpgradeSlot = 'beltA' | 'beltB' | 'none'

/** Fisher-Yates shuffle */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const CYCLE_SIZE = 48

export class CommonUpgradeBelt {
  hopper: CommonUpgradeSlot[]

  constructor() {
    this.hopper = []
    this._fill()
  }

  next(): CommonUpgradeSlot {
    if (this.hopper.length === 0) {
      this._fill()
    }
    return this.hopper.shift()!
  }

  _fill(): void {
    const cycle: CommonUpgradeSlot[] = [
      'beltA',
      'beltB',
      ...Array(CYCLE_SIZE - 2).fill('none') as CommonUpgradeSlot[],
    ]
    shuffle(cycle)
    this.hopper.push(...cycle)
  }
}
