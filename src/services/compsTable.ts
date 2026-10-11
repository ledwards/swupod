/**
 * The /comps comparison table, derived from the graded scorecard: a target
 * column (what the opened real boxes show), then one column per site (ours
 * first, then by grade). The overall score is the first row, then details as
 * checks or numbers. A number is good when the grade could not tell it apart
 * from the real boxes. Nothing is typed per site.
 */

import { gradeSite, type Feature, type Grade, type MetricId, type Reference, type Site } from './compsScore'

export type TableCell =
  | { kind: 'score', value: number }
  | { kind: 'check', on: boolean }
  | { kind: 'number', value: number, good: boolean, percent?: boolean }
  /** A target value: shown plainly, not judged. */
  | { kind: 'target', value: number, percent?: boolean }
  /** Legendary : rare : special : uncommon : common per six packs. */
  | { kind: 'mix', values: number[] }
  /** Shipped to alpha testers only: the page shows it per viewer. */
  | { kind: 'alpha' }
  | { kind: 'none' }

export interface TableRow { label: string, target: TableCell, cells: TableCell[] }

export interface ComparisonTable { columns: Array<{ id: string, name: string }>, rows: TableRow[] }

const none: TableCell = { kind: 'none' }
const MIX: MetricId[] = ['legendary', 'rare', 'special', 'uncommon', 'common']

function meanOf(h: number[]): number {
  const n = h.reduce((a, b) => a + b, 0)
  return h.reduce((a, c, k) => a + c * k, 0) / n
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
      return m ? { kind: 'number', value: 100 * m.mean / per, good: score(grade, id) === 1, percent: true } : none
    }),
  })
  const metricRow = (label: string, id: MetricId): TableRow => ({
    label,
    target: { kind: 'target', value: ref.metrics[id].mean },
    cells: graded.map(({ site, grade }) => {
      const m = site.packs.kind === 'unpublished' ? undefined : site.packs.metrics[id]
      return m ? { kind: 'number', value: m.mean, good: score(grade, id) === 1 } : none
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
      { label: 'Overall', target: { kind: 'score', value: 100 }, cells: graded.map(({ grade }) => ({ kind: 'score', value: grade.total })) },
      {
        label: 'Duplicates per six packs',
        target: { kind: 'target', value: meanOf(ref.repeatsHistogram) },
        cells: graded.map(({ site, grade }) => {
          const p = site.packs
          if (p.kind === 'unpublished') return none
          const value = p.kind === 'bounded' ? p.meanRepeats : meanOf(p.repeatsHistogram)
          return { kind: 'number', value, good: grade.axes.repeats === 100 }
        }),
      },
      metricRow('Legendaries per six packs', 'legendary'),
      metricRow('Rare leaders per six packs', 'rareLeaders'),
      {
        label: 'Rarity mix per six packs',
        target: { kind: 'mix', values: MIX.map(id => ref.metrics[id].mean) },
        cells: graded.map(({ site }) => {
          const p = site.packs
          if (p.kind === 'unpublished' || MIX.some(id => !p.metrics[id])) return none
          return { kind: 'mix', values: MIX.map(id => p.metrics[id]!.mean) }
        }),
      },
      metricRow('Bases per six packs', 'bases'),
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
