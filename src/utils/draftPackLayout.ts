/**
 * Pick the row count that yields the largest cards within the actual pack panel.
 * `aspect` is card height / width: 1.4 for upright cards, 360/504 for the
 * landscape leaders dealt in the leader draft.
 */
export function draftPackLayout(width: number, height: number, count: number, aspect = 1.4, maxWidth = 220) {
  const n = Math.max(1, count), gap = 8
  const fit = (rows: number) => {
    const columns = Math.ceil(n / rows)
    const cardWidth = Math.max(1, Math.min(maxWidth, (width - (columns - 1) * gap) / columns, (height - (rows - 1) * gap) / rows / aspect))
    return { rows, columns, cardWidth }
  }
  const one = fit(1), two = fit(2)
  return n > 1 && two.cardWidth > one.cardWidth * 1.05 ? two : one
}
