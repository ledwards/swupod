import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeCardGrades,
  computeStrictOrProvisionalGrades,
  computeCardMetricRates,
  computeGnsCopies,
  formatSeventeenLandsDeltaMetric,
  formatSeventeenLandsRateMetric,
  gradeFromZScore,
  SEVENTEEN_LANDS_TABLE_COLUMNS,
} from './cardDataMetrics'

describe('card data metrics', () => {
  it('defines the canonical minimal 17L column set', () => {
    assert.deepEqual(SEVENTEEN_LANDS_TABLE_COLUMNS, [
      'Title',
      'Aspects',
      'C',
      'R',
      'G',
      'GP WR',
      'OH WR',
      'GD WR',
      'GIH WR',
      'GNS WR',
      'IIH',
      'PR',
      'RWS%',
      'PWAR',
    ])
  })

  it('formats canonical 17L rate metrics with the count in the percentage cell', () => {
    const gns = formatSeventeenLandsRateMetric('gnsWr', 42, 85)

    assert.equal(gns.display, 'GNS WR 49.4% (42/85)')
    assert.equal(gns.formula, 'gns_wins / gns_count')
    assert.equal(gns.value, '49.4% (42/85)')
  })

  it('formats canonical 17L delta metrics as percentage-point deltas', () => {
    const iih = formatSeventeenLandsDeltaMetric('iih', 7.44)
    const pwar = formatSeventeenLandsDeltaMetric('playedWar', -5.06)

    assert.equal(iih.display, 'IIH +7.4pp')
    assert.equal(iih.formula, '(gih_wins / gih_count) - (gns_wins / gns_count)')
    assert.equal(pwar.display, 'PWAR -5.1pp')
    assert.equal(pwar.formula, '(played_wins / played_count) - (unplayed_wins / unplayed_count)')
  })

  it('computes GNS from deck copies minus opener, later draws, and tutored seen copies', () => {
    assert.equal(computeGnsCopies({ deckCopies: 3, openerCopies: 1, drawnLaterCopies: 1 }), 1)
    assert.equal(computeGnsCopies({ deckCopies: 2, openerCopies: 1, drawnLaterCopies: 1, tutoredSeenCopies: 1 }), 0)
    assert.equal(computeGnsCopies({ deckCopies: 1, openerCopies: 0, drawnLaterCopies: 0 }), 1)
  })

  it('copy-weights GP, OH, GD, GIH, GNS, IIH, played rate, and resource rate', () => {
    const metrics = computeCardMetricRates([
      {
        deckCopies: 2,
        openerCopies: 1,
        drawnLaterCopies: 1,
        playedCopiesFromSeenHand: 1,
        resourcedCopiesFromSeenHand: 1,
        win: 1,
      },
      {
        deckCopies: 2,
        openerCopies: 0,
        drawnLaterCopies: 0,
        playedCopiesFromSeenHand: 0,
        resourcedCopiesFromSeenHand: 0,
        win: 0,
      },
    ], { iihMinDenominator: 1 })

    assert.equal(metrics.gpCount, 4)
    assert.equal(metrics.gpWins, 2)
    assert.equal(metrics.gpWr, 0.5)
    assert.equal(metrics.ohCount, 1)
    assert.equal(metrics.ohWr, 1)
    assert.equal(metrics.gdCount, 1)
    assert.equal(metrics.gdWr, 1)
    assert.equal(metrics.gihCount, 2)
    assert.equal(metrics.gihWr, 1)
    assert.equal(metrics.gnsCount, 2)
    assert.equal(metrics.gnsWr, 0)
    assert.equal(metrics.iih, 100)
    assert.equal(metrics.playedRate, 0.5)
    assert.equal(metrics.resourcedWhenSeen, 0.5)
  })

  it('marks played and resource rates unavailable when copy-safe provenance is missing', () => {
    const metrics = computeCardMetricRates([
      { deckCopies: 1, openerCopies: 1, drawnLaterCopies: 0, playedCopiesFromSeenHand: null, win: 1 },
    ])

    assert.equal(metrics.playedRate, null)
    assert.equal(metrics.resourcedWhenSeen, null)
  })

  it('maps z-scores into the 17Lands-style grade bands', () => {
    assert.equal(gradeFromZScore(2.2), 'A+')
    assert.equal(gradeFromZScore(1.9), 'A')
    assert.equal(gradeFromZScore(0.2), 'C+')
    assert.equal(gradeFromZScore(0), 'C')
    assert.equal(gradeFromZScore(-2), 'F')
  })

  it('grades a sufficiently large 17Lands-style slice', () => {
    const inputs = Array.from({ length: 25 }, (_, index) => ({
      key: `card-${index}`,
      wins: 25 + index,
      denominator: 100,
    }))
    const grades = computeCardGrades(inputs)

    assert.equal(grades.length, 25)
    assert.equal(grades.every((grade) => grade.status === 'graded'), true)
    assert.notEqual(grades[24].grade, null)
    assert.equal(computeCardGrades(inputs.slice(0, 4)).every((grade) => grade.status === 'slice-too-small'), true)
  })

  it('shrinks grade rates toward the slice mean by default', () => {
    const grades = computeCardGrades([
      { key: 'tiny-hot-sample', wins: 1, denominator: 1 },
      { key: 'large-cold-sample', wins: 0, denominator: 99 },
    ], { minDenominator: 1, minCards: 2 })

    const tiny = grades.find((grade) => grade.key === 'tiny-hot-sample')
    assert.ok(tiny?.shrunkRate != null)
    assert.equal(Math.round(tiny.shrunkRate * 1000000) / 1000000, 0.029412)
  })

  it('falls back to provisional grades for tiny dev slices', () => {
    const { grades, provisional } = computeStrictOrProvisionalGrades([
      { key: 'a', wins: 1, denominator: 1 },
      { key: 'b', wins: 1, denominator: 1 },
      { key: 'c', wins: 0, denominator: 1 },
      { key: 'd', wins: 0, denominator: 1 },
      { key: 'e', wins: 1, denominator: 1 },
    ])

    assert.equal(provisional, true)
    assert.notEqual(grades.get('a')?.grade, null)
    assert.notEqual(grades.get('c')?.grade, null)
  })

  it('keeps strict grades and fills smaller nonzero samples with provisional grades', () => {
    const inputs = Array.from({ length: 25 }, (_, index) => ({
      key: `strict-${index}`,
      wins: 25 + index,
      denominator: 50,
    }))
    inputs.push({ key: 'small-but-observed', wins: 1, denominator: 1 })
    inputs.push({ key: 'unobserved', wins: 0, denominator: 0 })

    const { grades, provisional } = computeStrictOrProvisionalGrades(inputs)

    assert.equal(provisional, true)
    assert.notEqual(grades.get('strict-0')?.grade, null)
    assert.notEqual(grades.get('small-but-observed')?.grade, null)
    assert.equal(grades.get('unobserved')?.grade, null)
  })

  it('assigns C when every gradeable card is exactly average', () => {
    const grades = computeCardGrades(Array.from({ length: 25 }, (_, index) => ({
      key: `card-${index}`,
      wins: 25,
      denominator: 50,
    })))

    assert.equal(grades.every((grade) => grade.grade === 'C'), true)
    assert.equal(grades.every((grade) => grade.zScore === 0), true)
  })
})
