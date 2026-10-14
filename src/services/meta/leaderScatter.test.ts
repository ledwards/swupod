import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildLeaderScatter } from './leaderScatter'

describe('buildLeaderScatter', () => {
  const winRates = [
    { leaderName: 'Thrawn', winRate: 58, matches: 40, leaderImageUrl: 't.png', leaderBackImageUrl: 'tb.png' },
    { leaderName: 'Luke', winRate: 44, matches: 30, leaderImageUrl: 'l.png', leaderBackImageUrl: null },
    { leaderName: 'Grogu', winRate: 70, matches: 2, leaderImageUrl: null, leaderBackImageUrl: null },
  ]
  const popularity = [
    { cardName: 'Thrawn', selectionRate: 12 },
    { cardName: 'Luke', selectionRate: 4 },
    { cardName: 'Grogu', selectionRate: 1 },
  ]

  it('joins win rate to popularity by leader and drops thin samples', () => {
    const out = buildLeaderScatter(winRates, popularity, { minMatches: 10 })
    assert.deepEqual(out.points.map((p) => p.leaderName), ['Thrawn', 'Luke'])
    assert.equal(out.points[0].share, 12)
    assert.equal(out.points[0].imageUrl, 'tb.png')
    assert.equal(out.points[1].imageUrl, 'l.png')
  })

  it('reports match-weighted average win rate and mean share for the quadrant lines', () => {
    const out = buildLeaderScatter(winRates, popularity, { minMatches: 10 })
    assert.equal(out.avgWinRate, 52)
    assert.equal(out.avgShare, 8)
  })

  it('pads the axis ranges so points never sit on an edge', () => {
    const out = buildLeaderScatter(winRates, popularity, { minMatches: 10 })
    assert.ok(out.winRateRange[0] < 44 && out.winRateRange[1] > 58)
    assert.ok(out.shareMax > 12)
  })

  it('returns no points when nothing clears the floor', () => {
    const out = buildLeaderScatter(winRates, popularity, { minMatches: 100 })
    assert.equal(out.points.length, 0)
    assert.equal(out.avgWinRate, null)
  })
})
