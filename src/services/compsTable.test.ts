import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FEATURES, METRICS, type Feature, type MetricId, type Moment, type Reference, type Site } from './compsScore'
import { comparisonTable } from './compsTable'

const HIST = [0, 0, 1, 0, 7, 10, 9, 6, 3, 3, 2, 0, 0, 1]
const REF: Reference = {
  kits: 42,
  repeatsHistogram: HIST,
  metrics: Object.fromEntries(METRICS.map(m => [m.id, { mean: m.id === 'bases' || m.id === 'leaders' ? 6 : 5, sd: 1, n: 42 }])) as Record<MetricId, Moment>,
}
const ALL = Object.fromEntries(FEATURES.map(f => [f, true])) as Record<Feature, boolean>
const NONE = Object.fromEntries(FEATURES.map(f => [f, false])) as Record<Feature, boolean>

function site(id: string, patch: Partial<Record<MetricId, number>> = {}, features = ALL): Site {
  const metrics = Object.fromEntries(METRICS.map(m => [m.id, { mean: patch[m.id] ?? REF.metrics[m.id].mean, sd: 1, n: 4200 }]))
  return { id, name: id.toUpperCase(), features, packs: { kind: 'measured', kits: 4200, repeatsHistogram: HIST.map(n => n * 100), metrics } }
}

test('ours is the first column; the rest follow by grade', () => {
  const t = comparisonTable(REF, [site('worse', { bases: 0 }, NONE), site('ours', { bases: 0 }), site('best')], 'ours')
  assert.deepEqual(t.columns.map(c => c.id), ['ours', 'best', 'worse'])
})

test('the first row is the overall score; its target cell is a dash', () => {
  const t = comparisonTable(REF, [site('ours')], 'ours')
  assert.equal(t.rows[0]!.label, 'Overall')
  assert.deepEqual(t.rows[0]!.target, { kind: 'none' })
  assert.deepEqual(t.rows[0]!.cells[0], { kind: 'score', value: 100 })
})

test('numbers are green inside the real-box tolerance and red outside it', () => {
  const t = comparisonTable(REF, [site('ours'), site('low', { legendary: 2.5 })], 'ours')
  const row = t.rows.find(r => r.label === 'Legendaries per six packs')!
  assert.deepEqual(row.target, { kind: 'target', value: 5 })
  assert.deepEqual([row.cells[0]!.kind, (row.cells[0] as { good: boolean }).good], ['number', true])
  assert.deepEqual([row.cells[1]!.kind, (row.cells[1] as { good: boolean }).good], ['number', false])
})

test('number cells carry their z against the target', () => {
  const t = comparisonTable(REF, [site('ours'), site('low', { legendary: 2.5 })], 'ours')
  const row = t.rows.find(r => r.label === 'Legendaries per six packs')!
  const [ours, low] = row.cells as Array<{ z: number }>
  assert.ok(ours!.z < 0.01)
  assert.ok(low!.z > 10)
  assert.equal(t.rows.find(r => r.label === 'Bases per six packs'), undefined)
})

test('a row is a dash when the site never published what it needs', () => {
  const reported: Site = {
    id: 'r', name: 'R', features: ALL,
    packs: { kind: 'bounded', ksLowerBound: 0.9, meanRepeats: 13, crowded: 0.9, metrics: { legendary: { mean: 1, sd: 0, n: 1 } } },
  }
  const t = comparisonTable(REF, [site('ours'), reported], 'ours')
  assert.deepEqual(t.rows.find(r => r.label === 'Modified rarity ratios*')!.cells[1], { kind: 'none' })
  const dup = t.rows.find(r => r.label === 'Duplicates per six packs')!.cells[1] as { value: number, good: boolean }
  assert.deepEqual([dup.value, dup.good], [13, false])
})

test('play vs AI: alpha-only shows as an alpha cell, others as checks', () => {
  const ours = { ...site('ours'), playVsAi: 'alpha' as const }
  const other = { ...site('other'), playVsAi: true }
  const row = comparisonTable(REF, [ours, other, site('none')], 'ours').rows.find(r => r.label === 'Play vs AI')!
  assert.deepEqual(row.cells, [{ kind: 'alpha' }, { kind: 'check', on: true }, { kind: 'check', on: false }])
})
