/**
 * The common plate a set's sheets share.
 *
 * OWNER-APPROVED EXCEPTION (2026-10-11) to "a belt does not read another
 * belt" (.claude/rules/belt-system.md): the hyperspace-foil sheet prints
 * some of its commons from the same plate as the normal common lanes, so a
 * foil common can be the foil copy of a normal printed `lag` packs earlier
 * on the line. Measured on the number-verified ASH boxes: foil commons land
 * in a kit holding their normal 41.7% of the time, where an independent
 * foil sheet gives 47%. Gated per set by packRules.foilCommonPlate.
 *
 * The normal lanes record what they print, in line order; the foil belt reads
 * a pack's worth from `lag` packs back. Nothing here edits a finished pack.
 */

import type { RawCard } from '../utils/cardData'

const CARDS_PER_LANE_PER_PACK = 4

export class CommonPlate {
  private lanes = new Map<string, RawCard[]>()
  constructor(private keep: number) {}

  record(lane: string, card: RawCard): void {
    const run = this.lanes.get(lane) ?? []
    run.push(card)
    if (run.length > this.keep) run.shift()
    this.lanes.set(lane, run)
  }

  /** Normal commons printed `lag` packs before the newest pack, across lanes. */
  packAgo(lag: number): RawCard[] {
    const out: RawCard[] = []
    for (const run of this.lanes.values()) {
      const end = run.length - CARDS_PER_LANE_PER_PACK * lag
      const start = end - CARDS_PER_LANE_PER_PACK
      if (start >= 0) out.push(...run.slice(start, end))
    }
    return out
  }
}

const plates = new Map<string, CommonPlate>()

export function getCommonPlate(setCode: string, lag: number): CommonPlate {
  let plate = plates.get(setCode)
  if (!plate) {
    plate = new CommonPlate(CARDS_PER_LANE_PER_PACK * (lag + 2))
    plates.set(setCode, plate)
  }
  return plate
}

/** A fresh box is a fresh cut: no plate history carries over. */
export function clearCommonPlates(): void {
  plates.clear()
}
