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
  | { kind: 'number', value: number, good: boolean }
  /** A target value: shown plainly, not judged. */
  | { kind: 'target', value: number }
  /** Shipped to alpha testers only: the page shows it per viewer. */
  | { kind: 'alpha' }
  | { kind: 'none' }

export interface TableRow { label: string, target: TableCell, cells: TableCell[] }

export interface ComparisonTable { columns: Array<{ id: string, name: string }>, rows: TableRow[] }

const none: TableCell = { kind: 'none' }

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
  /** A check on pack contents; a dash where the site never published what it needs. */
  const packCheck = (label: string, needs: MetricId[], has: (site: Site, grade: Grade) => boolean): TableRow => ({
    label,
    target: yes,
    cells: graded.map(({ site, grade }) => {
      const p = site.packs
      if (p.kind === 'unpublished' || needs.some(id => !p.metrics[id])) return none
      return { kind: 'check', on: has(site, grade) }
    }),
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
      packCheck('Rarity mix', ['legendary', 'rare', 'special', 'uncommon', 'common'], (_, g) => g.axes.rarity === 100),
      packCheck('Leaders and bases', ['leaders', 'bases'], (_, g) => g.axes.leadersBases === 100),
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
