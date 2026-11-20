/**
 * IconsLeaderSlotBelt
 *
 * Icons 2027 Edition packs have no dedicated leader slot. One slot is a leader
 * about 1 time in 4 and a common otherwise (Card Gamer's pre-release product
 * breakdown, 2026-06-03: "25% chance of being a Leader"). FFG has published no
 * exact rate, so 1-in-4 is a best guess until real boxes are opened.
 *
 * Modelled as a printed strip, like CommonUpgradeBelt: a 48-pack cycle holding
 * 12 leader positions and 36 common positions, shuffled. 48 rather than 24 so a
 * single box is not forced to exactly 6 leaders — boxes vary, as real ones do.
 * The belt only decides WHICH sheet the slot is printed from; the leader and
 * the common themselves come from the LeaderBelt and a CommonBelt.
 */

export type IconsLeaderSlot = 'leader' | 'common'

const CYCLE_SIZE = 48
const LEADERS_PER_CYCLE = 12 // 1 in 4

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

export class IconsLeaderSlotBelt {
  hopper: IconsLeaderSlot[] = []

  next(): IconsLeaderSlot {
    if (this.hopper.length === 0) this._fill()
    return this.hopper.shift()!
  }

  _fill(): void {
    const cycle: IconsLeaderSlot[] = [
      ...Array<IconsLeaderSlot>(LEADERS_PER_CYCLE).fill('leader'),
      ...Array<IconsLeaderSlot>(CYCLE_SIZE - LEADERS_PER_CYCLE).fill('common'),
    ]
    this.hopper.push(...shuffle(cycle))
  }
}
