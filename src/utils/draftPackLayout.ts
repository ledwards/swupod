/** Pick the row count that yields the largest cards within the actual pack panel. */
export function draftPackLayout(width: number, height: number, count: number) {
  const n = Math.max(1, count), gap = 8
  const fit = (rows: number) => {
    const columns = Math.ceil(n / rows)
    const cardWidth = Math.max(1, Math.min(220, (width - (columns - 1) * gap) / columns, (height - (rows - 1) * gap) / rows / 1.4))
    return { rows, columns, cardWidth }
  }
  const one = fit(1), two = fit(2)
  return n > 1 && two.cardWidth > one.cardWidth * 1.05 ? two : one
}
