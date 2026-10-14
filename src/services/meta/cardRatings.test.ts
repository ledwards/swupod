import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pooledWinRate, sortRows } from './cardRatings'

describe('pooledWinRate', () => {
  it('pools wins over games across cards rather than averaging the rates', () => {
    const cards = [{ gihWins: 30, gihCount: 50 }, { gihWins: 1, gihCount: 10 }]
    // 31 wins / 60 games = 51.7%, not the 35% mean of 60% and 10%
    assert.equal(pooledWinRate(cards, 'gihWins', 'gihCount'), 51.7)
  })

  it('returns null when no card has games', () => {
    assert.equal(pooledWinRate([{ gihWins: null, gihCount: null }], 'gihWins', 'gihCount'), null)
  })
})

describe('sortRows', () => {
  const rows = [{ name: 'a', v: 2 }, { name: 'b', v: null }, { name: 'c', v: 5 }]
  it('sorts descending with missing values last', () => {
    assert.deepEqual(sortRows(rows, (r) => r.v, 'descending').map((r) => r.name), ['c', 'a', 'b'])
  })
  it('sorts ascending with missing values still last', () => {
    assert.deepEqual(sortRows(rows, (r) => r.v, 'ascending').map((r) => r.name), ['a', 'c', 'b'])
  })
})
