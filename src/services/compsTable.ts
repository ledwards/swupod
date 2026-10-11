/**
 * The /comps comparison table, derived from the graded scorecard: a target
 * column (what the opened real boxes show), then one column per site (ours
 * first, then by grade). The overall score is the first row, then details as
 * checks or numbers. A number is good when the grade could not tell it apart
 * from the real boxes. Nothing is typed per site.
 */

import { gradeSite, zScore, type Feature, type Moment, type Grade, type MetricId, type Reference, type Site } from './compsScore'

export type TableCell =
  | { kind: 'score', value: number }
  | { kind: 'check', on: boolean }
  /** `z`: distance from the target in standard errors of both samples. */
  | { kind: 'number', value: number, good: boolean, percent?: boolean, z?: number }
  /** A target value: shown plainly, not judged. */
  | { kind: 'target', value: number, percent?: boolean }
  /** Legendary : rare : special : uncommon : common per six packs. */
  | { kind: 'mix', values: number[], z?: number[] }
  /** Shipped to alpha testers only: the page shows it per viewer. */
  | { kind: 'alpha' }
  | { kind: 'none' }

export interface TableRow { label: string, target: TableCell, cells: TableCell[] }

export interface ComparisonTable { columns: Array<{ id: string, name: string }>, rows: TableRow[] }

const none: TableCell = { kind: 'none' }
const MIX: MetricId[] = ['legendary', 'rare', 'special', 'uncommon', 'common']
const BASE_MIX: MetricId[] = ['baseLegendary', 'baseRare', 'baseSpecial', 'baseUncommon', 'baseCommon']

function meanOf(h: number[]): number {
  const n = h.reduce((a, b) => a + b, 0)
  return h.reduce((a, c, k) => a + c * k, 0) / n
}

function momentOf(h: number[]): Moment {
  const n = h.reduce((a, b) => a + b, 0)
  const mean = meanOf(h)
  const sd = Math.sqrt(h.reduce((a, c, k) => a + c * (k - mean) ** 2, 0) / Math.max(1, n - 1))
  return { mean, sd, n }
}

function score(g: Grade, id: MetricId | 'repeatsKs'): number {
  return g.metrics.find(m => m.id === id)?.score ?? 0
}

/** Play vs AI is shown, not graded: 'alpha' while AI play is alpha-only. */
export type TableSite = Site & { playVsAi?: boolean | 'alpha' }

export function comparisonTable(ref: Reference, sites: TableSite[], oursId: string): ComparisonTable {
  const graded = sites.map(s => ({ site: s, grade: gradeSite(ref, s) }))
    .sort((a, b) => (a.site.id === oursId ? -1 : b.site.id === oursId ? 1 : b.grade.total - a.grade.total))

  const yes: TableCell = { kind: 'check', on: true }
  /** A per-kit count shown as a percent of `per` (packs per kit, or 1 for kits). */
  const shareRow = (label: string, id: MetricId, per: number): TableRow => ({
    label,
    target: { kind: 'target', value: 100 * ref.metrics[id].mean / per, percent: true },
    cells: graded.map(({ site, grade }) => {
      const m = site.packs.kind === 'unpublished' ? undefined : site.packs.metrics[id]
      return m ? { kind: 'number', value: 100 * m.mean / per, good: score(grade, id) === 1, percent: true, z: zScore(ref.metrics[id], m) } : none
    }),
  })
  const metricRow = (label: string, id: MetricId): TableRow => ({
    label,
    target: { kind: 'target', value: ref.metrics[id].mean },
    cells: graded.map(({ site, grade }) => {
      const m = site.packs.kind === 'unpublished' ? undefined : site.packs.metrics[id]
      return m ? { kind: 'number', value: m.mean, good: score(grade, id) === 1, z: zScore(ref.metrics[id], m) } : none
    }),
  })
  /** Legendary : rare : special : uncommon : common per six packs. */
  const mixRow = (label: string, ids: MetricId[]): TableRow => ({
    label,
    target: { kind: 'mix', values: ids.map(id => ref.metrics[id].mean) },
    cells: graded.map(({ site }) => {
      const p = site.packs
      if (p.kind === 'unpublished' || ids.some(id => !p.metrics[id])) return none
      return { kind: 'mix', values: ids.map(id => p.metrics[id]!.mean), z: ids.map(id => zScore(ref.metrics[id], p.metrics[id]!)) }
    }),
  })
  const featureRow = (label: string, f: Feature): TableRow => ({
    label,
    target: yes,
    cells: graded.map(({ site }) => ({ kind: 'check', on: site.features[f] })),
  })

  return {
    columns: graded.map(({ site }) => ({ id: site.id, name: site.name })),
    rows: [
      { label: 'Overall', target: none, cells: graded.map(({ grade }) => ({ kind: 'score', value: grade.total })) },
      {
        label: 'Duplicates per six packs',
        target: { kind: 'target', value: meanOf(ref.repeatsHistogram) },
        cells: graded.map(({ site, grade }) => {
          const p = site.packs
          if (p.kind === 'unpublished') return none
          const value = p.kind === 'bounded' ? p.meanRepeats : meanOf(p.repeatsHistogram)
          const measured: Moment = p.kind === 'bounded' ? { mean: value, sd: 0, n: 1 } : momentOf(p.repeatsHistogram)
          return { kind: 'number', value, good: grade.axes.repeats === 100, z: zScore(momentOf(ref.repeatsHistogram), measured) }
        }),
      },
      metricRow('Legendaries per six packs', 'legendary'),
      metricRow('Rare leaders per six packs', 'rareLeaders'),
      mixRow('Base rarity ratios', BASE_MIX),
      mixRow('Modified rarity ratios*', MIX),
      metricRow('Repeated leaders per six packs', 'leaderRepeats'),
      shareRow('Packs with every main aspect', 'aspectPacks', 6),
      shareRow('Packs with the same card twice', 'samePackRepeats', 6),
      shareRow('Six packs with no legendary', 'noLegendary', 1),
      featureRow('Draft with other people', 'multiplayer'),
      featureRow('Play a real opponent', 'realOpponent'),
      {
        label: 'Play vs AI',
        target: yes,
        cells: graded.map(({ site }) => {
          const ai = (site as TableSite).playVsAi
          return ai === 'alpha' ? { kind: 'alpha' } : { kind: 'check', on: ai === true }
        }),
      },
      featureRow('Your own stats', 'personalStats'),
    ],
  }
}
