import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { logRounds, splitDeckState, costCurve, seatMatches, recordsById } from './logModel'
import type { HubView } from '../pods/hubTypes'

const pick = (type: 'leader' | 'card', packNumber: number, pickInPack: number) =>
  ({ type, packNumber, pickInPack, visibleCards: [], pickedInstanceId: null })

describe('logRounds', () => {
  it('orders Leaders, Pack 1-3 and drops empty rounds', () => {
    const rounds = logRounds([pick('card', 2, 1), pick('leader', 1, 1), pick('card', 1, 1), pick('card', 1, 2)])
    assert.deepEqual(rounds.map(r => [r.key, r.picks.length]), [['leaders', 1], ['pack1', 2], ['pack2', 1]])
  })
})

describe('splitDeckState', () => {
  it('takes the active leader and base, sorts the deck by cost, keeps the sideboard', () => {
    const split = splitDeckState({
      activeLeader: 'L', activeBase: 'B',
      cardPositions: {
        L: { card: { isLeader: true } },
        L2: { card: { isLeader: true }, section: 'sideboard' },
        B: { card: { type: 'Base' } },
        a: { card: { cost: 3 }, section: 'deck', visible: true },
        b: { card: { cost: 1 }, section: 'deck', visible: true },
        off: { card: { cost: 2 }, section: 'deck', visible: true, enabled: false },
        unplaced: { card: { cost: 4 }, section: 'deck' },
        s: { card: { cost: 5 }, section: 'sideboard', visible: true },
        s2: { card: { cost: 6 }, section: 'sideboard', visible: true },
        hidden: { card: { cost: 5 }, section: 'sideboard', visible: false },
      },
    })
    assert.deepEqual(split.leader, { isLeader: true })
    assert.deepEqual(split.base, { type: 'Base' })
    assert.deepEqual(split.deck.map(c => c.cost), [1, 3])
    assert.equal(split.sideboard.length, 2)
  })
  it('is empty without a state', () => {
    assert.deepEqual(splitDeckState(null), { leader: null, base: null, deck: [], sideboard: [] })
  })
})

describe('costCurve', () => {
  it('counts 0 through 6 and folds 7+ together', () => {
    assert.deepEqual(costCurve([{ cost: 0 }, { cost: 2 }, { cost: 2 }, { cost: 7 }, { cost: 9 }, {}]), [2, 0, 2, 0, 0, 0, 0, 2])
  })
})

describe('seatMatches', () => {
  const side = (id: string, name: string) => ({ id, name, isBot: false, isYou: false, points: 0, deck: null })
  const view = {
    tournament: {
      rounds: [
        { key: 'r1', label: 'Round 1', matches: [{ p1: side('me', 'Lee'), p2: side('x', 'Cal'), score: [2, 0], games: ['player1', 'player1'], winner: 'player1', status: 'finished' }] },
        { key: 'r2', label: 'Round 2', matches: [{ p1: side('y', 'Mira'), p2: side('me', 'Lee'), score: [2, 1], games: ['player1', 'player2', 'player1'], winner: 'player1', status: 'finished' }] },
        { key: 'r3', label: 'Round 3', matches: [{ p1: side('me', 'Lee'), p2: null, score: [0, 0], games: [], winner: null, status: 'bye' }] },
      ],
      standings: [{ id: 'me', record: '1–1' }],
    },
  } as unknown as HubView

  it('scores each match from the player side', () => {
    assert.deepEqual(seatMatches(view, 'me').map(m => [m.opponent, m.score, m.result, m.games.join('')]), [
      ['Cal', '2–0', 'win', 'WW'],
      ['Mira', '1–2', 'loss', 'LWL'],
      ['Bye', '', 'bye', ''],
    ])
  })
  it('has nothing without a tournament or player', () => {
    assert.deepEqual(seatMatches(null, 'me'), [])
    assert.deepEqual(seatMatches(view, null), [])
  })
  it('maps standings records by id', () => {
    assert.deepEqual(recordsById(view), { me: '1–1' })
  })
})
