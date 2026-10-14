import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildCurveComparison, CURVE_BUCKETS } from './deckCurve'

describe('buildCurveComparison', () => {
  it('buckets costs as 0-1, 2..7 and 8+', () => {
    assert.deepEqual(CURVE_BUCKETS, ['0-1', '2', '3', '4', '5', '6', '7', '8+'])
  })

  it('averages copies per deck for every deck and for winning decks', () => {
    const out = buildCurveComparison([
      { costs: [1, 2, 2, 9], wins: 2, losses: 0 },
      { costs: [3, 3], wins: 0, losses: 2 },
    ])
    assert.equal(out.allDecks, 2)
    assert.equal(out.winningDecks, 1)
    const byLabel = Object.fromEntries(out.buckets.map((b) => [b.label, b]))
    assert.equal(byLabel['2'].all, 1)
    assert.equal(byLabel['2'].winning, 2)
    assert.equal(byLabel['3'].all, 1)
    assert.equal(byLabel['3'].winning, 0)
    assert.equal(byLabel['8+'].winning, 1)
    assert.equal(out.allAvgCost, 3.3)
    assert.equal(out.winningAvgCost, 3.5)
  })

  it('treats a deck as winning only when it won more than it lost', () => {
    const out = buildCurveComparison([{ costs: [2], wins: 1, losses: 1 }, { costs: [2], wins: 0, losses: 0 }])
    assert.equal(out.winningDecks, 0)
    assert.equal(out.winningAvgCost, null)
    assert.equal(out.buckets[1].winning, 0)
  })
})
