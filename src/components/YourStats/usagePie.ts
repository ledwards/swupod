export interface UsageSlice {
  /** Games played — drives the wedge's share of the circle. */
  matches: number
  /** Resolved wedge color (hex). */
  color: string
}

/**
 * Distinct categorical palette for the usage pies ("Your Leaders" /
 * "Your Archetypes"). Each leader/archetype gets its OWN color so wedges never
 * blend — unlike base-aspect tinting, where only a few colors exist and two
 * leaders on the same aspect merged into one solid disc. Ordered so neighbors
 * (wedges are laid out in usage order) contrast strongly, and picked to read on
 * the dark card surface.
 */
export const USAGE_PIE_COLORS = [
  '#4A90E2', // blue
  '#E1654A', // coral
  '#27AE60', // green
  '#F1C40F', // yellow
  '#9B59B6', // purple
  '#1ABC9C', // teal
  '#E67E22', // orange
  '#E84393', // pink
  '#5DADE2', // sky
  '#52BE80', // mint
  '#AF7AC5', // lilac
  '#F39C12', // amber
]

/** Stable color for the item at display index `i` (cycles past the palette). */
export function usagePieColor(i: number): string {
  const idx = ((i % USAGE_PIE_COLORS.length) + USAGE_PIE_COLORS.length) % USAGE_PIE_COLORS.length
  return USAGE_PIE_COLORS[idx] ?? '#888'
}

/**
 * Build the `conic-gradient(...)` color stops for a usage pie.
 *
 * Wedges are sized by share of games. A thin transparent cut is carved at every
 * wedge boundary — including the 0°/360° seam — so adjacent wedges stay visually
 * distinct (mirrors the /stats recharts pie's `paddingAngle`); the cut is
 * transparent so it reveals the card surface behind the disc. A lone 100% wedge
 * is a full disc (no cut). The gap shrinks for slivers thinner than it so a tiny
 * wedge never collapses to pure transparent.
 *
 * @returns the comma-joined stop list, or null when there's nothing to plot
 *          (the caller renders the empty-state fallback).
 */
export function buildUsagePieStops(slices: UsageSlice[], gapDeg = 3): string | null {
  const plotted = slices.filter((s) => (s.matches || 0) > 0)
  if (plotted.length === 0) return null
  const total = plotted.reduce((sum, s) => sum + s.matches, 0)
  const gap = plotted.length > 1 ? gapDeg : 0
  let acc = 0
  return plotted
    .map((s) => {
      const color = s.color || '#888'
      const start = (acc / total) * 360
      acc += s.matches
      const end = (acc / total) * 360
      const g = Math.min(gap, Math.max(0, end - start - 1))
      const from = start + g / 2
      const to = end - g / 2
      return `transparent ${start}deg ${from}deg, ${color} ${from}deg ${to}deg, transparent ${to}deg ${end}deg`
    })
    .join(', ')
}
