import { describe, it } from 'node:test'
import assert from 'node:assert'
import { computeLeaderContextStats } from './leaderPickContext'

// SPEC: for each fresh opening pack, the round-1 pick is "chosen over" the other
// leaders in that same opening. We hardcode openings with a KNOWN answer and
// assert the aggregation, never deriving expectations from the implementation.

const byName = (stats) => Object.fromEntries(stats.map((s) => [s.leader, s]))
const rival = (stats, name) => stats.rivals.find((r) => r.rival === name)

describe('computeLeaderContextStats', () => {
  it('per-leader first-pick rate = firstPicks / openings', () => {
    // Vader offered 3 times, taken first twice → 2/3. Thrawn offered 3, taken 0.
    const openings = [
      { openingLeaders: ['Vader', 'Thrawn', 'Boba'], firstPick: 'Vader' },
      { openingLeaders: ['Vader', 'Thrawn', 'Krennic'], firstPick: 'Vader' },
      { openingLeaders: ['Vader', 'Thrawn', 'Palpatine'], firstPick: 'Palpatine' },
    ]
    const stats = byName(computeLeaderContextStats(openings))

    assert.strictEqual(stats['Vader'].openings, 3)
    assert.strictEqual(stats['Vader'].firstPicks, 2)
    assert.ok(Math.abs(stats['Vader'].firstPickRate - 2 / 3) < 1e-9, 'Vader 2/3')
    assert.strictEqual(stats['Thrawn'].openings, 3)
    assert.strictEqual(stats['Thrawn'].firstPicks, 0)
    assert.strictEqual(stats['Thrawn'].firstPickRate, 0)
  })

  it('head-to-head: A chosen over B counts only decided openings', () => {
    // Vader vs Thrawn share 3 openings. Vader taken first twice; the third,
    // Palpatine was taken first (neither Vader nor Thrawn "won"). So the decided
    // head-to-head is 2-0 Vader → chosenOverRate 1.0 for Vader, 0.0 for Thrawn,
    // but coOpenings is 3 for both.
    const openings = [
      { openingLeaders: ['Vader', 'Thrawn', 'Boba'], firstPick: 'Vader' },
      { openingLeaders: ['Vader', 'Thrawn', 'Krennic'], firstPick: 'Vader' },
      { openingLeaders: ['Vader', 'Thrawn', 'Palpatine'], firstPick: 'Palpatine' },
    ]
    const stats = byName(computeLeaderContextStats(openings))

    const vVsT = rival(stats['Vader'], 'Thrawn')
    assert.strictEqual(vVsT.coOpenings, 3, 'shared 3 openings')
    assert.strictEqual(vVsT.pickedOver, 2)
    assert.strictEqual(vVsT.pickedUnder, 0)
    assert.strictEqual(vVsT.chosenOverRate, 1, 'Vader won both decided')

    const tVsV = rival(stats['Thrawn'], 'Vader')
    assert.strictEqual(tVsV.pickedOver, 0)
    assert.strictEqual(tVsV.pickedUnder, 2)
    assert.strictEqual(tVsV.chosenOverRate, 0)
  })

  it('a pair never decided between themselves has chosenOverRate null', () => {
    // Boba and Krennic co-occur once, but Vader is taken first → undecided pair.
    const openings = [
      { openingLeaders: ['Vader', 'Boba', 'Krennic'], firstPick: 'Vader' },
    ]
    const stats = byName(computeLeaderContextStats(openings))
    const bVsK = rival(stats['Boba'], 'Krennic')
    assert.strictEqual(bVsK.coOpenings, 1)
    assert.strictEqual(bVsK.pickedOver, 0)
    assert.strictEqual(bVsK.pickedUnder, 0)
    assert.strictEqual(bVsK.chosenOverRate, null)
  })

  it('split preference: 1-1 head-to-head → 0.5 each', () => {
    const openings = [
      { openingLeaders: ['Luke', 'Leia'], firstPick: 'Luke' },
      { openingLeaders: ['Luke', 'Leia'], firstPick: 'Leia' },
    ]
    const stats = byName(computeLeaderContextStats(openings))
    assert.strictEqual(rival(stats['Luke'], 'Leia').chosenOverRate, 0.5)
    assert.strictEqual(rival(stats['Leia'], 'Luke').chosenOverRate, 0.5)
  })

  it('duplicate leader within one opening is not double-counted', () => {
    const openings = [
      { openingLeaders: ['Vader', 'Vader', 'Thrawn'], firstPick: 'Vader' },
    ]
    const stats = byName(computeLeaderContextStats(openings))
    assert.strictEqual(stats['Vader'].openings, 1, 'counted once despite duplicate')
    assert.strictEqual(rival(stats['Vader'], 'Thrawn').coOpenings, 1)
  })
})
