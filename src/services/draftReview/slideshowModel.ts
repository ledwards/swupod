/**
 * Draft review / observer slideshow: the pure rules the slideshow pages share
 * (labels, seat selection, follow-the-latest-pick). Same behavior as the
 * legacy DraftSlideshow overlay.
 */

/** "Pack 2 · Pick 6", or "Leaders · Pick 1" for the leader round (pack 0). */
export function pickLabel(pick: { packNumber: number; pickInPack: number } | undefined): string {
  if (!pick) return ''
  return pick.packNumber === 0 ? `Leaders · Pick ${pick.pickInPack}` : `Pack ${pick.packNumber} · Pick ${pick.pickInPack}`
}

/** Toggle one seat; the last selected seat stays selected so the stage is never blank. */
export function toggleSeat(selected: ReadonlySet<number>, seat: number): Set<number> {
  const next = new Set(selected)
  if (next.has(seat)) {
    if (next.size <= 1) return new Set(selected)
    next.delete(seat)
  } else {
    next.add(seat)
  }
  return next
}

/** "All Players": select every open seat, or clear when they are all on already. */
export function toggleAllSeats(selected: ReadonlySet<number>, openSeats: readonly number[]): Set<number> {
  const allOn = openSeats.length > 0 && openSeats.every(n => selected.has(n))
  return allOn ? new Set<number>() : new Set(openSeats)
}

/** The slide to move to when new picks arrive, or null to stay put. */
export function followTailIndex({ current, previousCount, nextCount }: { current: number; previousCount: number; nextCount: number }): number | null {
  if (previousCount <= 0 || nextCount <= previousCount) return null
  if (current < previousCount - 1) return null
  return nextCount - 1
}
