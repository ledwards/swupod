import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareDimension, dimensionHasDivergence } from './packFidelity'

test('aligned: actuals near theory over many packs → aligned, tiny z', () => {
  const theory = { Common: { mean: 11.5, sd: 0.6 } }
  // 1000 packs, observed total right at expected (11_500).
  const [v] = compareDimension(theory, { Common: 11_500 }, 1000)
  assert.equal(v.label, 'aligned')
  assert.ok(Math.abs(v.z!) < 0.01, `z should be ~0, got ${v.z}`)
})

test('notable: large effect + significant p → notable', () => {
  const theory = { Rare: { mean: 1.2, sd: 0.66 } }
  // 1000 packs; expected 1200, observed 1500 → +25% per-pack, z ≈ 14.4.
  const [v] = compareDimension(theory, { Rare: 1500 }, 1000)
  assert.equal(v.label, 'notable')
  assert.ok(v.pValue! < 0.01)
  assert.ok(Math.abs(v.relDev - 0.25) < 1e-6)
})

test('minor: significant p but sub-5% effect → minor not notable', () => {
  const theory = { Common: { mean: 11.5, sd: 0.6 } }
  // Huge sample makes a 1% gap significant; effect floor keeps it "minor".
  // 100k packs, expected 1_150_000, observed 1_161_500 (+1%). z is large.
  const [v] = compareDimension(theory, { Common: 1_161_500 }, 100_000)
  assert.ok(v.pValue! < 0.01, 'should be statistically significant at huge N')
  assert.equal(v.label, 'minor')
})

test('deterministic slot: sd 0, mismatch flagged; exact match aligned', () => {
  const theory = { hyperspaceFoil: { mean: 1, sd: 0 } }
  const exact = compareDimension(theory, { hyperspaceFoil: 500 }, 500)[0]
  assert.equal(exact.label, 'aligned')
  assert.equal(exact.z, null)

  const off = compareDimension(theory, { hyperspaceFoil: 490 }, 500)[0]
  assert.equal(off.label, 'deterministic-mismatch')
  assert.equal(off.pValue, null)
})

test('unexpected category present in actuals but not theory is surfaced', () => {
  const theory = { Common: { mean: 9, sd: 0.5 } }
  const verdicts = compareDimension(theory, { Common: 9000, Mythic: 12 }, 1000)
  const mythic = verdicts.find((v) => v.bucket === 'Mythic')!
  assert.ok(mythic)
  assert.equal(mythic.expectedTotal, 0)
  assert.equal(mythic.relDev, Infinity)
})

test('dimensionHasDivergence flags notable and deterministic-mismatch only', () => {
  const aligned = [{ label: 'aligned' }, { label: 'minor' }] as any
  const diverged = [{ label: 'aligned' }, { label: 'notable' }] as any
  assert.equal(dimensionHasDivergence(aligned), false)
  assert.equal(dimensionHasDivergence(diverged), true)
})
