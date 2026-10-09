// Premier rotation is derived from the release calendar, not a hand-kept list.
// These cases walk the real schedule so a stale-by-default regression (the bug
// this replaced) fails loudly instead of silently mislabelling card pools.
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getPremierLegalSets, getKarabastCardPool, getLatestReleasedSetCode } from './latest'

const at = (iso: string): Date => new Date(`${iso}T12:00:00Z`)
const legal = (iso: string): string[] => [...getPremierLegalSets(at(iso))].sort()

describe('getPremierLegalSets', () => {
  it('is only the first batch before any rotation has happened', () => {
    // SOR/SHD/TWI are batch 0; nothing rotates until set 7 releases.
    assert.deepStrictEqual(legal('2024-12-01'), ['SHD', 'SOR', 'TWI'])
  })

  it('holds both batches once the second year is out — the 6-set maximum', () => {
    // SEC (set 6) released 2025-11-07: batches 0 and 1 are both legal = 6 sets.
    const sets = legal('2025-12-01')
    assert.strictEqual(sets.length, 6)
    assert.deepStrictEqual(sets, ['JTL', 'LOF', 'SEC', 'SHD', 'SOR', 'TWI'])
  })

  it('rotates the first three out the day LAW releases, not before', () => {
    // LAW (set 7, batch 2) releases 2026-03-13 — the official first rotation.
    assert.ok(legal('2026-03-12').includes('SOR'), 'SOR still legal the day before')
    const after = legal('2026-03-13')
    for (const rotated of ['SOR', 'SHD', 'TWI']) {
      assert.ok(!after.includes(rotated), `${rotated} rotated out on release day`)
    }
    assert.deepStrictEqual(after, ['JTL', 'LAW', 'LOF', 'SEC'])
  })

  it('keeps JTL legal after ASH — batch 1 does not rotate until set 10', () => {
    // The old hardcoded list dropped JTL here and never added ASH. Both wrong.
    assert.deepStrictEqual(legal('2026-08-01'), ['ASH', 'JTL', 'LAW', 'LOF', 'SEC'])
  })

  it('never exceeds the six-set maximum at any point on the calendar', () => {
    for (const day of ['2024-03-08', '2024-11-08', '2025-03-14', '2025-11-07',
                       '2026-03-13', '2026-07-17', '2027-01-01', '2030-01-01']) {
      assert.ok(getPremierLegalSets(at(day)).size <= 6, `${day} exceeded 6 legal sets`)
    }
  })

  it('excludes a set that exists in config but has not released yet', () => {
    // ASH is configured with a 2026-07-17 release; the day before it is not legal.
    assert.ok(!legal('2026-07-16').includes('ASH'))
    assert.ok(legal('2026-07-17').includes('ASH'))
  })
})

describe('getKarabastCardPool', () => {
  it('maps an unreleased set to Next Set', () => {
    assert.strictEqual(getKarabastCardPool('ASH', at('2026-07-16')), 'Next Set')
  })

  it('maps a released, Premier-legal set to Current', () => {
    assert.strictEqual(getKarabastCardPool('ASH', at('2026-08-01')), 'Current')
    // The exact case that was wrong: Karabast lists ASH lobbies as "current",
    // and the old list returned Unlimited for them.
    assert.strictEqual(getKarabastCardPool('JTL', at('2026-08-01')), 'Current')
  })

  it('maps a rotated set to Unlimited', () => {
    assert.strictEqual(getKarabastCardPool('SOR', at('2026-08-01')), 'Unlimited')
  })

  it('reads the primary (last) set of a comma list, e.g. Chaos pools', () => {
    assert.strictEqual(getKarabastCardPool('SOR,ASH', at('2026-08-01')), 'Current')
  })

  it('falls back to Unlimited with no set code', () => {
    assert.strictEqual(getKarabastCardPool(null, at('2026-08-01')), 'Unlimited')
    assert.strictEqual(getKarabastCardPool('', at('2026-08-01')), 'Unlimited')
  })
})

describe('getLatestReleasedSetCode', () => {
  it('ignores sets that have not released yet', () => {
    assert.strictEqual(getLatestReleasedSetCode(at('2026-07-16')), 'LAW')
    assert.strictEqual(getLatestReleasedSetCode(at('2026-08-01')), 'ASH')
  })
})
