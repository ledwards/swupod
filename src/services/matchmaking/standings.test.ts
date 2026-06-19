import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeRankedStandings,
  hasConfirmedMatch,
  recordsThroughRound,
  tallyRecords,
  toRankMatches,
} from './standings'

const p = (id: string, username = id, dropped = false) => ({ id, username, dropped })

const match = (
  id: string,
  roundNumber: number,
  player1: ReturnType<typeof p> | null,
  player2: ReturnType<typeof p> | null,
  winner: 'player1' | 'player2' | 'draw' | null,
  options: { bye?: boolean; confirmed?: boolean } = {}
) => ({
  id,
  roundNumber,
  player1,
  player2,
  isBye: options.bye ?? false,
  game1Result: null,
  game2Result: null,
  game3Result: null,
  player1Submitted: false,
  player2Submitted: false,
  finalConfirmed: options.confirmed ?? true,
  matchWinner: winner,
  podOwnerOverride: false,
})

const round = (roundNumber: number, matches: any[]) => ({
  roundNumber,
  status: 'complete',
  matches,
})

describe('matchmaking standings derivation', () => {
  it('ranks an 8-player Swiss event by wins, then OMW%', () => {
    const players = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(id => p(id, `Player ${id}`))
    const [A, B, C, D, E, F, G, H] = players
    const rounds = [
      round(1, [
        match('r1-a', 1, A, B, 'player1'),
        match('r1-b', 1, C, D, 'player1'),
        match('r1-c', 1, E, F, 'player1'),
        match('r1-d', 1, G, H, 'player1'),
      ]),
      round(2, [
        match('r2-a', 2, A, C, 'player1'),
        match('r2-b', 2, E, G, 'player1'),
        match('r2-c', 2, B, D, 'player1'),
        match('r2-d', 2, F, H, 'player1'),
      ]),
      round(3, [
        match('r3-a', 3, A, E, 'player1'),
        match('r3-b', 3, C, G, 'player1'),
        match('r3-c', 3, B, F, 'player1'),
        match('r3-d', 3, D, H, 'player1'),
      ]),
    ]

    const standings = computeRankedStandings(rounds, players)

    assert.equal(standings[0].id, 'A')
    assert.equal(standings[0].wins, 3)
    assert.equal(standings[0].losses, 0)
    assert.equal(Math.round(standings[0].omwPercent * 100), 67)
    assert.deepEqual(
      standings.map(s => `${s.id}:${s.wins}-${s.losses}`),
      ['A:3-0', 'B:2-1', 'C:2-1', 'E:2-1', 'D:1-2', 'F:1-2', 'G:1-2', 'H:0-3']
    )
  })

  it('breaks equal-win ties with OMW%, not losses or draw count', () => {
    const players = ['A', 'B', 'C', 'D', 'E', 'F'].map(id => p(id))
    const [A, B, C, D, E, F] = players
    const rounds = [
      round(1, [
        match('a-c', 1, A, C, 'player1'),
        match('b-e', 1, B, E, 'player1'),
      ]),
      round(2, [
        match('a-d', 2, A, D, 'player1'),
        match('b-f', 2, B, F, 'player1'),
      ]),
      round(3, [
        match('c-e', 3, C, E, 'player1'),
        match('c-f', 3, C, F, 'player1'),
        match('d-e', 3, D, E, 'player1'),
        match('d-f', 3, D, F, 'player1'),
      ]),
    ]

    const standings = computeRankedStandings(rounds, players)
    const a = standings.find(s => s.id === 'A')!
    const b = standings.find(s => s.id === 'B')!

    assert.equal(a.wins, 2)
    assert.equal(b.wins, 2)
    assert.equal(Math.round(a.omwPercent * 100), 67)
    assert.equal(Math.round(b.omwPercent * 100), 33)
    assert.ok(a.rank < b.rank, 'SPEC: A ranks ahead because its opponents have stronger records')
  })

  it('transforms broadcast winners into player-id winners for OMW calculation', () => {
    const A = p('A')
    const B = p('B')
    const C = p('C')
    const rounds = [
      round(1, [
        match('p1-win', 1, A, B, 'player1'),
        match('p2-win', 1, A, C, 'player2'),
        match('draw', 1, B, C, 'draw'),
        match('bye', 1, A, null, 'player1', { bye: true }),
      ]),
    ]

    assert.deepEqual(toRankMatches(rounds), [
      { player1Id: 'A', player2Id: 'B', matchWinner: 'A', isBye: false, finalConfirmed: true },
      { player1Id: 'A', player2Id: 'C', matchWinner: 'C', isBye: false, finalConfirmed: true },
      { player1Id: 'B', player2Id: 'C', matchWinner: 'draw', isBye: false, finalConfirmed: true },
      { player1Id: 'A', player2Id: null, matchWinner: 'A', isBye: true, finalConfirmed: true },
    ])
  })

  it('tracks empty, bye, draw, and dropped-player records without dropping prior OMW contribution', () => {
    const players = [p('A'), p('B'), p('C', 'Dropped C', true)]
    const [A, B, C] = players
    const emptyRounds = [round(1, [match('pending', 1, A, B, null, { confirmed: false })])]

    assert.equal(hasConfirmedMatch(emptyRounds), false)
    assert.equal(Math.round(computeRankedStandings(emptyRounds, players)[0].omwPercent * 100), 33)

    const rounds = [
      round(1, [
        match('bye-a', 1, A, null, 'player1', { bye: true }),
        match('draw-b-c', 1, B, C, 'draw'),
      ]),
      round(2, [
        match('a-c', 2, A, C, 'player1'),
      ]),
    ]
    const standings = computeRankedStandings(rounds, players)
    const a = standings.find(s => s.id === 'A')!
    const c = standings.find(s => s.id === 'C')!

    assert.equal(hasConfirmedMatch(rounds), true)
    assert.deepEqual({ wins: a.wins, losses: a.losses, draws: a.draws }, { wins: 2, losses: 0, draws: 0 })
    assert.deepEqual({ wins: c.wins, losses: c.losses, draws: c.draws, dropped: c.dropped }, {
      wins: 0,
      losses: 1,
      draws: 1,
      dropped: true,
    })
    assert.equal(Math.round(a.omwPercent * 100), 33)
  })

  it('returns records through the round before the displayed card round', () => {
    const A = p('A')
    const B = p('B')
    const C = p('C')
    const rounds = [
      round(1, [
        match('bye-a', 1, A, null, 'player1', { bye: true }),
        match('b-c', 1, B, C, 'player1'),
      ]),
      round(2, [
        match('a-b', 2, A, B, 'player2'),
      ]),
      round(3, [
        match('a-c-draw', 3, A, C, 'draw'),
      ]),
    ]

    const beforeRound2 = recordsThroughRound(rounds, 2)
    assert.deepEqual(beforeRound2.get('A'), { wins: 1, losses: 0, draws: 0 })
    assert.deepEqual(beforeRound2.get('B'), { wins: 1, losses: 0, draws: 0 })
    assert.deepEqual(beforeRound2.get('C'), { wins: 0, losses: 1, draws: 0 })

    const beforeRound3 = recordsThroughRound(rounds, 3)
    assert.deepEqual(beforeRound3.get('A'), { wins: 1, losses: 1, draws: 0 })
    assert.deepEqual(beforeRound3.get('B'), { wins: 2, losses: 0, draws: 0 })

    const finalTally = tallyRecords(rounds)
    assert.deepEqual(recordsThroughRound(rounds, 99), finalTally)
    assert.deepEqual(finalTally.get('A'), { wins: 1, losses: 1, draws: 1 })
    assert.deepEqual(finalTally.get('C'), { wins: 0, losses: 1, draws: 1 })
  })
})
