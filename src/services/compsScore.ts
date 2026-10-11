/**
 * Pack comparison grade: one 0-100 number per simulator.
 *
 * Five equal parts, graded on what changes play — not on how a card looks:
 *   Repeats         repeats-per-kit DISTRIBUTION (two-sample KS), and repeated
 *                   commons, uncommons and rares+ per kit
 *   Rarity mix      legendary, rare, special, uncommon, common per kit
 *   Leaders & bases leaders and bases per kit, rare leaders, leader and base
 *                   repeats
 *   Sheet structure what print sheets guarantee a pack: commons covering every
 *                   main aspect, the same card twice in a pack, a kit never
 *                   without a legendary
 *   Ways to play    share of what real limited offers
 *
 * Printings (hyperspace, foil, prestige) are measured and shown but not
 * graded: a site with no hyperspace art plays the same. What a printing slot
 * DOES to play is graded — a foil slot that rerolls a random card instead of
 * reading a sheet shows up as extra repeats and a skewed rarity mix.
 *
 * Every graded metric is a z-score: the site's mean against the real mean,
 * in units of both sides' standard error. Full marks inside 3σ (at or above
 * the Bonferroni line, 3.0σ, for 17 tests at a family-wise α of 0.05, so a
 * perfect generator is not docked for the one metric chance pushes past 2σ)
 * and nothing from 6σ. KS: full marks at its α=0.05 critical value, nothing
 * at 2.5× it. A metric a site does not model or publish scores 0.
 *
 * Nothing here knows which site is ours.
 */

export const FEATURES = [
  'draft', 'sealed', 'solo', 'multiplayer', 'realOpponent', 'sitewideStats', 'personalStats',
] as const
export type Feature = typeof FEATURES[number]

export const AXES = ['repeats', 'rarity', 'leadersBases', 'structure', 'play'] as const
export type Axis = typeof AXES[number]

export const AXIS_LABELS: Record<Axis | 'printings', string> = {
  repeats: 'Repeats', rarity: 'Rarity mix', leadersBases: 'Leaders & bases', structure: 'Sheet structure', play: 'Ways to play',
  printings: 'Printings (not graded)',
}

/**
 * `axis: 'printings'` is shown, never graded. `verified`: needs card
 * treatment, so only number-verified boxes count for it.
 */
export const METRICS = [
  { id: 'repeatedCommon', label: 'Repeated commons', axis: 'repeats', verified: false },
  { id: 'repeatedUncommon', label: 'Repeated uncommons', axis: 'repeats', verified: false },
  { id: 'repeatedRarePlus', label: 'Repeated rares+', axis: 'repeats', verified: false },
  { id: 'legendary', label: 'Legendaries', axis: 'rarity', verified: false },
  { id: 'rare', label: 'Rares', axis: 'rarity', verified: false },
  { id: 'special', label: 'Specials', axis: 'rarity', verified: false },
  { id: 'uncommon', label: 'Uncommons', axis: 'rarity', verified: false },
  { id: 'common', label: 'Commons', axis: 'rarity', verified: false },
  { id: 'leaders', label: 'Leaders', axis: 'leadersBases', verified: false },
  { id: 'bases', label: 'Bases', axis: 'leadersBases', verified: false },
  { id: 'rareLeaders', label: 'Rare leaders', axis: 'leadersBases', verified: false },
  { id: 'leaderRepeats', label: 'Leader repeats', axis: 'leadersBases', verified: false },
  { id: 'baseRepeats', label: 'Base repeats', axis: 'leadersBases', verified: false },
  { id: 'aspectPacks', label: 'Packs with every main aspect', axis: 'structure', verified: false },
  { id: 'samePackRepeats', label: 'Packs with a card twice', axis: 'structure', verified: false },
  { id: 'noLegendary', label: 'Six packs with no legendary', axis: 'structure', verified: false },
  { id: 'samePrinting', label: 'Same-printing repeats', axis: 'printings', verified: true },
  { id: 'hyperspace', label: 'Hyperspace cards', axis: 'printings', verified: true },
  { id: 'hyperspaceFoil', label: 'Hyperspace foils', axis: 'printings', verified: true },
  { id: 'plainFoil', label: 'Plain foils', axis: 'printings', verified: true },
  { id: 'prestige', label: 'Prestige', axis: 'printings', verified: true },
  { id: 'hyperspaceRare', label: 'Hyperspace rares+', axis: 'printings', verified: true },
  { id: 'hyperspaceLeaders', label: 'Hyperspace leaders', axis: 'printings', verified: true },
  { id: 'hyperspaceBases', label: 'Hyperspace bases', axis: 'printings', verified: true },
] as const
export type MetricId = typeof METRICS[number]['id']
export const GRADED = METRICS.filter(m => m.axis !== 'printings')

export interface Moment { mean: number, sd: number, n: number }

export interface Reference {
  kits: number
  repeatsHistogram: number[]
  metrics: Record<MetricId, Moment>
  /** Duplicates per eight-pack kit. Shown, not graded. */
  repeats8?: Moment
}

export type SitePacks =
  /** Kits generated from the site's own pack code (run or ported). */
  | { kind: 'measured', kits: number, repeatsHistogram: number[], metrics: Partial<Record<MetricId, Moment>>, repeats8?: Moment }
  /** Only reported figures; `ksLowerBound` is the smallest KS they allow. */
  | { kind: 'bounded', ksLowerBound: number, meanRepeats: number, crowded: number, metrics: Partial<Record<MetricId, Moment>> }
  | { kind: 'unpublished' }

export interface Site {
  id: string
  name: string
  packs: SitePacks
  features: Record<Feature, boolean>
}

export interface MetricResult { id: MetricId | 'repeatsKs', score: number, z: number | null }

export interface Grade {
  id: string
  name: string
  total: number
  axes: Record<Axis, number>
  metrics: MetricResult[]
  /** Pack metrics below full marks, worst first. */
  misses: MetricResult[]
}

const FULL_Z = 3
const ZERO_Z = 6
const KS_C_05 = 1.358
const KS_ZERO = 2.5
/** Smallest standard error, so an exact real count (6 leaders) can still be met. */
const MIN_SE = 0.02

export function ksFromHistograms(a: number[], b: number[]): number {
  const na = a.reduce((x, y) => x + y, 0)
  const nb = b.reduce((x, y) => x + y, 0)
  let ca = 0, cb = 0, d = 0
  for (let v = 0; v < Math.max(a.length, b.length); v++) {
    ca += a[v] || 0
    cb += b[v] || 0
    d = Math.max(d, Math.abs(ca / na - cb / nb))
  }
  return d
}

/** α = 0.05 critical value; m = Infinity for a site known only by its figures. */
export function ksCritical(n: number, m: number): number {
  return Number.isFinite(m) ? KS_C_05 * Math.sqrt((n + m) / (n * m)) : KS_C_05 / Math.sqrt(n)
}

/** Distance from the real mean in standard errors of both samples. */
export function zScore(real: Moment, site: Moment): number {
  const se = Math.max(MIN_SE, Math.sqrt(real.sd ** 2 / real.n + site.sd ** 2 / site.n))
  return Math.abs(site.mean - real.mean) / se
}

export function zToScore(z: number): number {
  if (z <= FULL_Z) return 1
  return Math.max(0, 1 - (z - FULL_Z) / (ZERO_Z - FULL_Z))
}

export function ksResult(ref: Reference, packs: SitePacks): MetricResult {
  if (packs.kind === 'unpublished') return { id: 'repeatsKs', score: 0, z: null }
  const d = packs.kind === 'measured' ? ksFromHistograms(ref.repeatsHistogram, packs.repeatsHistogram) : packs.ksLowerBound
  const crit = ksCritical(ref.kits, packs.kind === 'measured' ? packs.kits : Infinity)
  const score = d <= crit ? 1 : Math.max(0, 1 - (d - crit) / (KS_ZERO * crit - crit))
  return { id: 'repeatsKs', score, z: d }
}

/** Graded metrics only. */
export function metricResults(ref: Reference, packs: SitePacks): MetricResult[] {
  const site = packs.kind === 'unpublished' ? {} : packs.metrics
  return [ksResult(ref, packs), ...GRADED.map(({ id }) => {
    const m = site[id]
    if (!m) return { id, score: 0, z: null }
    const z = zScore(ref.metrics[id], m)
    return { id, score: zToScore(z), z }
  })]
}

export function featuresScore(features: Record<Feature, boolean>): number {
  return FEATURES.filter(f => features[f]).length / FEATURES.length
}

const axisOf = (id: MetricResult['id']): Axis => id === 'repeatsKs' ? 'repeats' : GRADED.find(m => m.id === id)!.axis as Axis

export function gradeSite(ref: Reference, site: Site): Grade {
  const metrics = metricResults(ref, site.packs)
  const axisScore = (axis: Axis) => {
    const xs = metrics.filter(m => axisOf(m.id) === axis).map(m => m.score)
    return xs.reduce((a, b) => a + b, 0) / xs.length
  }
  const raw: Record<Axis, number> = {
    repeats: axisScore('repeats'),
    rarity: axisScore('rarity'),
    leadersBases: axisScore('leadersBases'),
    structure: axisScore('structure'),
    play: featuresScore(site.features),
  }
  const axes = Object.fromEntries(AXES.map(a => [a, Math.round(raw[a] * 100)])) as Record<Axis, number>
  return {
    id: site.id,
    name: site.name,
    total: Math.round((AXES.reduce((s, a) => s + raw[a], 0) / AXES.length) * 100),
    axes,
    metrics,
    misses: metrics.filter(m => m.score < 1).sort((a, b) => a.score - b.score || (b.z ?? -1) - (a.z ?? -1)),
  }
}

/** Every site, best first. Ties keep input order. */
export function gradeAll(ref: Reference, sites: Site[]): Grade[] {
  return sites.map(s => gradeSite(ref, s)).sort((a, b) => b.total - a.total)
}
