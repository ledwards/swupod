import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  barWidth, duplicateVerdictStatus, groupTestsBySet, healthStatus, metricStatus, rateScale,
  structuralStatus, testSetCode, worstStatus, zStatus, type QATestResult,
} from './qaReport'
import { groupPacksByPool, poolEvidence, type QAPack, type QAPackCard } from './qaPoolEvidence'

describe('QA status vocabulary', () => {
  it('maps rate verdicts: within 95% passes, 95-99% is watched, beyond 99% fails', () => {
    assert.equal(metricStatus('expected'), 'pass')
    assert.equal(metricStatus('slight_variance'), 'watch')
    assert.equal(metricStatus('outlier'), 'fail')
    assert.equal(metricStatus('insufficient_data'), 'none')
    assert.equal(metricStatus(undefined), 'none')
  })

  it('treats a structural "warning" as No Data (no tracked packs), like the legacy page', () => {
    assert.equal(structuralStatus('pass'), 'pass')
    assert.equal(structuralStatus('fail'), 'fail')
    assert.equal(structuralStatus('warning'), 'none')
  })

  it('maps quality-score bands and duplicate verdicts', () => {
    assert.equal(healthStatus('excellent'), 'pass')
    assert.equal(healthStatus('good'), 'pass')
    assert.equal(healthStatus('acceptable'), 'watch')
    assert.equal(healthStatus('needs_attention'), 'fail')
    assert.equal(duplicateVerdictStatus('consistent'), 'pass')
    assert.equal(duplicateVerdictStatus('minor-drift'), 'watch')
    assert.equal(duplicateVerdictStatus('investigate'), 'fail')
    assert.equal(duplicateVerdictStatus('sparse'), 'none')
    assert.equal(duplicateVerdictStatus('no-data'), 'none')
  })

  it('takes the worst status, No Data only when nothing has data', () => {
    assert.equal(worstStatus(['pass', 'watch', 'pass']), 'watch')
    assert.equal(worstStatus(['none', 'fail', 'pass']), 'fail')
    assert.equal(worstStatus(['none', 'pass']), 'pass')
    assert.equal(worstStatus(['none']), 'none')
    assert.equal(worstStatus([]), 'none')
  })
})

describe('groupTestsBySet', () => {
  const t = (name: string, status: 'passed' | 'failed' = 'passed'): QATestResult => ({ name, suite: 'pack_generation', status })

  it('reads the set from the "SET: " test-name prefix', () => {
    assert.equal(testSetCode('SOR: all packs have 16 cards'), 'SOR')
    assert.equal(testSetCode('LAW: HS common rate'), 'LAW')
    assert.equal(testSetCode('all sets: belt seam'), null)
    assert.equal(testSetCode('Sealed pod collation'), null)
  })

  it('one group per set in order, No Data for sets without tests, General last', () => {
    const groups = groupTestsBySet([t('SHD: a'), t('SOR: b', 'failed'), t('SOR: c'), t('misc check')], ['SOR', 'SHD', 'ASH'])
    assert.deepEqual(groups.map((g) => [g.key, g.status, g.passed, g.failed]), [
      ['SOR', 'fail', 1, 1],
      ['SHD', 'pass', 1, 0],
      ['ASH', 'none', 0, 0],
      ['General', 'pass', 1, 0],
    ])
  })

  it('keeps sets the order does not list, after the listed ones', () => {
    const groups = groupTestsBySet([t('IBH: a'), t('SOR: b')], ['SOR'])
    assert.deepEqual(groups.map((g) => g.key), ['SOR', 'IBH'])
  })
})

describe('observed-vs-expected bars', () => {
  it('puts the expected outline at two thirds of the track', () => {
    const max = rateScale(0.12, 0.125)
    assert.equal(barWidth(0.125, max), `${(0.125 / max) * 100}%`)
    assert.ok(Math.abs(0.125 / max - 2 / 3) < 1e-9)
  })

  it('grows the scale so an observed rate far above expected still fits', () => {
    const max = rateScale(0.5, 0.1)
    assert.ok(0.5 / max < 1)
  })

  it('clamps widths to the track', () => {
    assert.equal(barWidth(2, 1), '100%')
    assert.equal(barWidth(-1, 1), '0%')
    assert.equal(barWidth(1, 0), '0%')
  })

  it('flags per-pool evidence by z: over 3 fails, over 2 is watched', () => {
    assert.equal(zStatus(1, 1, 0.8), 'pass')
    assert.equal(zStatus(3, 1, 0.8), 'watch')
    assert.equal(zStatus(4, 1, 0.8), 'fail')
  })
})

describe('pool evidence', () => {
  const card = (name: string, extra: Partial<QAPackCard> = {}): QAPackCard => ({ cardId: name, name, treatment: 'normal', type: 'Unit', rarity: 'Common', ...extra })
  const pack = (sourceId: string, packIndex: number, cards: QAPackCard[]): QAPack => ({ sourceId, sourceType: 'sealed', packIndex, cards })

  it('groups packs into pools and orders packs by index', () => {
    const pools = groupPacksByPool([pack('a', 1, []), pack('b', 0, []), pack('a', 0, [])])
    assert.deepEqual(pools.map((p) => [p.sourceId, p.packs.map((x) => x.packIndex)]), [['a', [0, 1]], ['b', [0]]])
  })

  it('counts excess copies, keeping leaders and bases out of duplicates', () => {
    const lines = poolEvidence([
      pack('a', 0, [card('X'), card('X'), card('X', { isHyperspace: true }), card('L', { type: 'Leader', isHyperspace: true }), card('L', { type: 'Leader' })]),
      pack('a', 1, [card('Leg', { rarity: 'Legendary', isFoil: true })]),
    ])
    const by = Object.fromEntries(lines.map((l) => [l.key, l]))
    assert.equal(by['regular']!.count, 1)
    assert.equal(by['regular']!.detail, 'X x2')
    assert.equal(by['any']!.count, 2)
    assert.equal(by['any']!.detail, 'X x3 (hyperspace, regular)')
    assert.equal(by['legendary']!.detail, 'Leg (foil)')
    assert.equal(by['hyperspace']!.detail, '1 leader, 0 bases, 1 other')
  })
})
