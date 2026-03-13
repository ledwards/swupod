// @ts-nocheck
/**
 * Tests for PackSelector sorting logic.
 *
 * SPEC:
 * - Regular boosters (SOR, SHD, TWI, JTL, LOF, SEC, LAW) appear in main group
 * - Carbonite boosters (JTL-CB, LOF-CB, SEC-CB, LAW-CB) appear in carbonite group
 * - Each group is sorted by release order (set number)
 * - getBaseCode strips the -CB suffix
 * - getSetNumber maps set codes to release order
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getBaseCode, getSetNumber, sortSetsForDisplay } from './packSelectorSort.ts'

// === Test data matching what fetchSets() returns ===

const ALL_SETS = [
  { code: 'SOR', name: 'Spark of Rebellion' },
  { code: 'SHD', name: 'Shadows of the Galaxy' },
  { code: 'TWI', name: 'Twilight of the Republic' },
  { code: 'JTL', name: 'Jump to Lightspeed' },
  { code: 'JTL-CB', name: 'JTL Carbonite', carbonite: true },
  { code: 'LOF', name: 'Legends of the Force' },
  { code: 'LOF-CB', name: 'LOF Carbonite', carbonite: true },
  { code: 'SEC', name: 'Secrets of Power' },
  { code: 'SEC-CB', name: 'SEC Carbonite', carbonite: true },
  { code: 'LAW', name: 'A Lawless Time' },
  { code: 'LAW-CB', name: 'LAW Carbonite', carbonite: true },
]

const REGULAR_SETS_ONLY = [
  { code: 'SOR', name: 'Spark of Rebellion' },
  { code: 'SHD', name: 'Shadows of the Galaxy' },
  { code: 'TWI', name: 'Twilight of the Republic' },
  { code: 'JTL', name: 'Jump to Lightspeed' },
  { code: 'LOF', name: 'Legends of the Force' },
  { code: 'SEC', name: 'Secrets of Power' },
  { code: 'LAW', name: 'A Lawless Time' },
]

describe('getBaseCode', () => {
  it('returns regular set codes unchanged', () => {
    assert.strictEqual(getBaseCode('SOR'), 'SOR')
    assert.strictEqual(getBaseCode('LAW'), 'LAW')
    assert.strictEqual(getBaseCode('JTL'), 'JTL')
  })

  it('strips -CB suffix from carbonite codes', () => {
    assert.strictEqual(getBaseCode('JTL-CB'), 'JTL')
    assert.strictEqual(getBaseCode('LOF-CB'), 'LOF')
    assert.strictEqual(getBaseCode('SEC-CB'), 'SEC')
    assert.strictEqual(getBaseCode('LAW-CB'), 'LAW')
  })
})

describe('getSetNumber', () => {
  it('maps all regular sets to correct order', () => {
    assert.strictEqual(getSetNumber('SOR'), 1)
    assert.strictEqual(getSetNumber('SHD'), 2)
    assert.strictEqual(getSetNumber('TWI'), 3)
    assert.strictEqual(getSetNumber('JTL'), 4)
    assert.strictEqual(getSetNumber('LOF'), 5)
    assert.strictEqual(getSetNumber('SEC'), 6)
    assert.strictEqual(getSetNumber('LAW'), 7)
  })

  it('maps carbonite codes to same number as their base set', () => {
    assert.strictEqual(getSetNumber('JTL-CB'), 4)
    assert.strictEqual(getSetNumber('LOF-CB'), 5)
    assert.strictEqual(getSetNumber('SEC-CB'), 6)
    assert.strictEqual(getSetNumber('LAW-CB'), 7)
  })

  it('returns 999 for unknown set codes', () => {
    assert.strictEqual(getSetNumber('ZZZ'), 999)
  })
})

describe('sortSetsForDisplay', () => {
  it('puts all regular sets in main group', () => {
    const { main } = sortSetsForDisplay(ALL_SETS)
    const codes = main.map(s => s.code)

    assert.deepStrictEqual(codes, ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW'],
      'main group should contain all 7 regular sets in release order')
  })

  it('puts all carbonite sets in carbonite group', () => {
    const { carbonite } = sortSetsForDisplay(ALL_SETS)
    const codes = carbonite.map(s => s.code)

    assert.deepStrictEqual(codes, ['JTL-CB', 'LOF-CB', 'SEC-CB', 'LAW-CB'],
      'carbonite group should contain all 4 carbonite sets in release order')
  })

  it('LAW regular booster is in main group, not carbonite', () => {
    const { main, carbonite } = sortSetsForDisplay(ALL_SETS)

    assert.ok(main.some(s => s.code === 'LAW'),
      'LAW should be in main group')
    assert.ok(!carbonite.some(s => s.code === 'LAW'),
      'LAW should NOT be in carbonite group')
  })

  it('LAW-CB is in carbonite group, not main', () => {
    const { main, carbonite } = sortSetsForDisplay(ALL_SETS)

    assert.ok(!main.some(s => s.code === 'LAW-CB'),
      'LAW-CB should NOT be in main group')
    assert.ok(carbonite.some(s => s.code === 'LAW-CB'),
      'LAW-CB should be in carbonite group')
  })

  it('returns empty carbonite group when no carbonite sets', () => {
    const { main, carbonite } = sortSetsForDisplay(REGULAR_SETS_ONLY)

    assert.strictEqual(main.length, 7, 'main should have all 7 sets')
    assert.strictEqual(carbonite.length, 0, 'carbonite should be empty')
  })

  it('sorts main group by release order regardless of input order', () => {
    const shuffled = [
      { code: 'LAW', name: 'A Lawless Time' },
      { code: 'SOR', name: 'Spark of Rebellion' },
      { code: 'JTL', name: 'Jump to Lightspeed' },
      { code: 'TWI', name: 'Twilight of the Republic' },
      { code: 'SEC', name: 'Secrets of Power' },
      { code: 'SHD', name: 'Shadows of the Galaxy' },
      { code: 'LOF', name: 'Legends of the Force' },
    ]
    const { main } = sortSetsForDisplay(shuffled)
    const codes = main.map(s => s.code)

    assert.deepStrictEqual(codes, ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW'])
  })

  it('sorts carbonite group by release order regardless of input order', () => {
    const shuffled = [
      { code: 'LAW-CB', name: 'LAW Carbonite', carbonite: true },
      { code: 'JTL-CB', name: 'JTL Carbonite', carbonite: true },
      { code: 'SEC-CB', name: 'SEC Carbonite', carbonite: true },
      { code: 'LOF-CB', name: 'LOF Carbonite', carbonite: true },
    ]
    const { carbonite } = sortSetsForDisplay(shuffled)
    const codes = carbonite.map(s => s.code)

    assert.deepStrictEqual(codes, ['JTL-CB', 'LOF-CB', 'SEC-CB', 'LAW-CB'])
  })

  it('handles empty input', () => {
    const { main, carbonite } = sortSetsForDisplay([])

    assert.strictEqual(main.length, 0)
    assert.strictEqual(carbonite.length, 0)
  })

  it('preserves prereleaseDate on sets', () => {
    const sets = [
      { code: 'LAW', name: 'A Lawless Time', prereleaseDate: '2026-03-06' },
      { code: 'LAW-CB', name: 'LAW Carbonite', carbonite: true },
    ]
    const { main, carbonite } = sortSetsForDisplay(sets)

    assert.strictEqual(main[0].prereleaseDate, '2026-03-06', 'prereleaseDate should be preserved on main set')
    assert.ok(carbonite[0].carbonite, 'carbonite flag should be preserved')
  })
})
