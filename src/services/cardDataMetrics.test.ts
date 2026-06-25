import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeCardGrades,
  computeCardMetricRates,
  computeGnsCopies,
  gradeFromZScore,
} from './cardDataMetrics'

describe('card data metrics', () => {
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

  it('shrinks and grades a sufficiently large slice', () => {
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
})
