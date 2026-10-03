/** Pick the row count that yields the largest cards within the actual pack panel. */
export function draftPackLayout(width: number, height: number, count: number) {
  const n = Math.max(1, count), gap = 8
  const fit = (rows: number) => {
    const columns = Math.ceil(n / rows)
    const cardWidth = Math.max(1, Math.min(220, (width - (columns - 1) * gap) / columns, (height - (rows - 1) * gap) / rows / 1.4))
    return { rows, columns, cardWidth }
  }
  let best = fit(1)
  for (let rows = 2; rows <= n; rows++) {
    const candidate = fit(rows)
    if (candidate.cardWidth > best.cardWidth * 1.05) best = candidate
  }
  return best
}
