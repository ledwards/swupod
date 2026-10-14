import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildLeaderMatchups, withDeckLeaderFallback } from './leaderMatchups'

const row = (player: string, opponent: string, result: string) => ({ player_leader: player, opponent_leader: opponent, result })

describe('buildLeaderMatchups', () => {
  it('orders leaders by matches played and caps the grid size', () => {
    const rows = [
      row('Thrawn', 'Luke', 'win'), row('Thrawn', 'Luke', 'win'), row('Thrawn', 'Grogu', 'loss'),
      row('Luke', 'Thrawn', 'loss'), row('Grogu', 'Luke', 'win'),
    ]
    const out = buildLeaderMatchups(rows, { limit: 2, minMatches: 1 })
    assert.deepEqual(out.leaders, ['Thrawn', 'Luke'])
    assert.equal(out.grid.length, 2)
  })

  it('reports the row leader win rate against the column leader from both perspectives', () => {
    const rows = [row('Thrawn', 'Luke', 'win'), row('Thrawn', 'Luke', 'loss'), row('Luke', 'Thrawn', 'loss'), row('Luke', 'Thrawn', 'loss')]
    const out = buildLeaderMatchups(rows, { limit: 8, minMatches: 1 })
    const t = out.leaders.indexOf('Thrawn')
    const l = out.leaders.indexOf('Luke')
    assert.deepEqual({ ...out.grid[t][l] }, { wins: 3, losses: 1, draws: 0, matches: 4, winRate: 75 })
    assert.equal(out.grid[l][t]?.winRate, 25)
  })

  it('leaves the mirror cell empty and withholds a rate under the sample floor', () => {
    const rows = [row('Thrawn', 'Thrawn', 'win'), row('Thrawn', 'Luke', 'win')]
    const out = buildLeaderMatchups(rows, { limit: 8, minMatches: 5 })
    const t = out.leaders.indexOf('Thrawn')
    const l = out.leaders.indexOf('Luke')
    assert.equal(out.grid[t][t], null)
    assert.equal(out.grid[t][l]?.matches, 1)
    assert.equal(out.grid[t][l]?.winRate, null)
  })

  it('merges leader names that differ only by case or spacing and skips unknown results', () => {
    const rows = [row('Grand Admiral  Thrawn', 'luke skywalker', 'win'), row('grand admiral thrawn', 'Luke Skywalker', 'abandoned'), row('', 'Luke Skywalker', 'win')]
    const out = buildLeaderMatchups(rows, { limit: 8, minMatches: 1 })
    assert.deepEqual(out.leaders, ['Grand Admiral Thrawn', 'luke skywalker'])
    assert.equal(out.grid[0][1]?.matches, 1)
  })

  it('FIXED: merges "Name, Subtitle" reports with bare-name reports of the same leader', () => {
    const rows = [row('Cad Bane, Still Faster than You', 'Ezra Bridger', 'win'), row('Cad Bane', "Ezra Bridger, It's Now or Never", 'loss')]
    const out = buildLeaderMatchups(rows, { limit: 8, minMatches: 1 })
    assert.deepEqual(out.leaders, ['Cad Bane', 'Ezra Bridger'])
    assert.equal(out.grid[0][1]?.matches, 2)
  })

  it('FIXED: drops reports whose leader was never resolved', () => {
    const rows = [row('Unresolved leader', 'Cad Bane', 'win'), row('Cad Bane', 'unresolved leader', 'loss'), row('Cad Bane', 'Grogu', 'win')]
    const out = buildLeaderMatchups(rows, { limit: 8, minMatches: 1 })
    assert.deepEqual(out.leaders, ['Cad Bane', 'Grogu'])
    assert.equal(out.identifiedMatches, 1)
  })
})

describe('withDeckLeaderFallback', () => {
  it('FIXED: uses the built deck leader when the reported player leader is unresolved', () => {
    const rows = withDeckLeaderFallback([
      { player_leader: 'Unresolved leader', deck_leader: 'Tarfful', opponent_leader: 'Bossk', result: 'win' },
      { player_leader: 'Grogu', deck_leader: 'Tarfful', opponent_leader: 'Bossk', result: 'win' },
      { player_leader: '', deck_leader: null, opponent_leader: 'Bossk', result: 'win' },
    ])
    assert.deepEqual(rows.map((r) => r.player_leader), ['Tarfful', 'Grogu', ''])
  })
})
