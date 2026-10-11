import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FEATURES, METRICS, featuresScore, gradeAll, gradeSite, ksCritical, ksFromHistograms, ksResult, zScore, zToScore,
  type Feature, type MetricId, type Moment, type Reference, type Site,
} from './compsScore'

const HIST = [0, 0, 1, 0, 7, 10, 9, 6, 3, 3, 2, 0, 0, 1]
const REF: Reference = {
  kits: 42,
  repeatsHistogram: HIST,
  metrics: Object.fromEntries(METRICS.map(m => [m.id, { mean: 5, sd: 1, n: 42 }])) as Record<MetricId, Moment>,
}
const ALL = Object.fromEntries(FEATURES.map(f => [f, true])) as Record<Feature, boolean>
const NONE = Object.fromEntries(FEATURES.map(f => [f, false])) as Record<Feature, boolean>

/** A site whose kits are exactly the reference, many times over. */
function mirror(): Site {
  return {
    id: 'mirror', name: 'Mirror', features: ALL,
    packs: {
      kind: 'measured', kits: 4200, repeatsHistogram: HIST.map(n => n * 100),
      metrics: Object.fromEntries(METRICS.map(m => [m.id, { mean: 5, sd: 1, n: 4200 }])),
    },
  }
}

test('KS: identical distributions are 0 apart, disjoint ones are 1 apart', () => {
  assert.equal(ksFromHistograms([1, 2, 3], [2, 4, 6]), 0)
  assert.equal(ksFromHistograms([5, 0, 0], [0, 0, 5]), 1)
})

test('KS critical value shrinks with sample size and has a finite limit', () => {
  assert.ok(ksCritical(42, 100) > ksCritical(42, 10_000))
  assert.ok(Math.abs(ksCritical(42, Infinity) - 0.2095) < 1e-3)
})

test('a site that matches the real boxes scores 100 on every part', () => {
  const g = gradeSite(REF, mirror())
  assert.equal(g.total, 100)
  assert.deepEqual(Object.values(g.axes), [100, 100, 100, 100])
  assert.deepEqual(g.misses, [])
})

test('z: full marks to 3σ (≥ the Bonferroni line for 14 graded metrics), nothing from 6σ', () => {
  assert.equal(zToScore(0), 1)
  assert.equal(zToScore(3), 1)
  assert.ok(Math.abs(zToScore(4.5) - 0.5) < 1e-9)
  assert.equal(zToScore(6), 0)
  assert.equal(zToScore(300), 0)
})

test('z uses both samples, with a floor so an exact count can still be met', () => {
  assert.equal(zScore({ mean: 6, sd: 0, n: 42 }, { mean: 6, sd: 0, n: 1000 }), 0)
  assert.ok(zScore({ mean: 6, sd: 0, n: 42 }, { mean: 0, sd: 0, n: 1000 }) >= 300)
  assert.ok(Math.abs(zScore({ mean: 5, sd: 1, n: 100 }, { mean: 5.3, sd: 0, n: 1 }) - 3) < 1e-9)
})

test('KS: no repeats at all scores 0; a bounded site uses the large-sample critical value', () => {
  assert.equal(ksResult(REF, { kind: 'measured', kits: 1000, repeatsHistogram: [1000], metrics: {} }).score, 0)
  const b = ksResult(REF, { kind: 'bounded', ksLowerBound: 0.1, meanRepeats: 6, crowded: 0.07, metrics: {} })
  assert.equal(b.score, 1)
})

test('a graded metric the site does not model scores 0 and is listed as a miss', () => {
  const site = mirror()
  if (site.packs.kind !== 'measured') throw new Error('mirror')
  delete site.packs.metrics.bases
  const g = gradeSite(REF, site)
  assert.ok(g.misses.some(m => m.id === 'bases' && m.score === 0 && m.z === null))
  assert.ok(g.axes.leadersBases < 100)
})

test('printings are not graded: a site with no hyperspace, foil or prestige loses nothing for it', () => {
  const site = mirror()
  if (site.packs.kind !== 'measured') throw new Error('mirror')
  for (const id of ['hyperspace', 'hyperspaceFoil', 'plainFoil', 'prestige', 'hyperspaceRare', 'hyperspaceLeaders', 'hyperspaceBases', 'samePrinting'] as const) {
    site.packs.metrics[id] = { mean: 0, sd: 0, n: 4200 }
  }
  const g = gradeSite(REF, site)
  assert.equal(g.total, 100)
  assert.deepEqual(g.misses, [])
})

test('unpublished packs earn nothing on any pack part', () => {
  const g = gradeSite(REF, { id: 'x', name: 'X', packs: { kind: 'unpublished' }, features: ALL })
  assert.deepEqual(g.axes, { repeats: 0, rarity: 0, leadersBases: 0, play: 100 })
  assert.equal(g.total, 25)
})

test('features: share of the standard ways to play', () => {
  assert.equal(featuresScore(ALL), 1)
  assert.equal(featuresScore(NONE), 0)
  assert.equal(featuresScore({ ...NONE, sealed: true, solo: true }), 2 / FEATURES.length)
})

test('gradeAll sorts best first and keeps every site', () => {
  const worse: Site = { ...mirror(), id: 'worse', name: 'Worse', features: NONE }
  assert.deepEqual(gradeAll(REF, [worse, mirror()]).map(g => g.id), ['mirror', 'worse'])
})
