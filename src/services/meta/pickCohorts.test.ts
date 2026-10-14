import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildPickCohortRows, buildYouVsField } from './pickCohorts'

const pick = (cardName: string, avgPickPosition: number, extra: Record<string, unknown> = {}) => ({ cardName, avgPickPosition, firstPickPct: 10, timesPicked: 50, ...extra })

describe('buildPickCohortRows', () => {
  it('attaches top-player and personal average picks by card name', () => {
    const rows = buildPickCohortRows([pick('A', 3.2), pick('B', 7)], [pick('A', 2.5)], [pick('B', 9)])
    assert.equal(rows[0].cardName, 'A')
    assert.equal(rows[0].topAvgPick, 2.5)
    assert.equal(rows[0].youAvgPick, null)
    assert.equal(rows[1].youAvgPick, 9)
  })

  it('reports how many picks earlier top players take a card (positive = earlier)', () => {
    const rows = buildPickCohortRows([pick('A', 3.2)], [pick('A', 2.5)], null)
    assert.equal(rows[0].topDelta, 0.7)
  })

  it('keeps cohort-less rows comparable with null deltas', () => {
    const rows = buildPickCohortRows([pick('A', 3.2)], null, null)
    assert.equal(rows[0].topAvgPick, null)
    assert.equal(rows[0].topDelta, null)
  })
})

describe('buildYouVsField', () => {
  it('compares your win rate on a leader with the field and sorts by games played', () => {
    const out = buildYouVsField(
      [{ leaderName: 'Thrawn', winRate: 60, matches: 10 }, { leaderName: 'Luke', winRate: 40, matches: 5 }, { leaderName: 'Grogu', winRate: 100, matches: 1 }],
      [{ leaderName: 'Thrawn', winRate: 55, matches: 400, leaderImageUrl: 'a', leaderBackImageUrl: 'b' }, { leaderName: 'Luke', winRate: 50, matches: 300, leaderImageUrl: 'c', leaderBackImageUrl: null }],
      { minMatches: 3 },
    )
    assert.deepEqual(out.map((r) => r.leaderName), ['Thrawn', 'Luke'])
    assert.equal(out[0].delta, 5)
    assert.equal(out[1].delta, -10)
    assert.equal(out[0].imageUrl, 'b')
  })
})
