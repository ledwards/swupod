import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeSwissPracticeEventSummary,
  deckIdentityFromDeckState,
} from './eventAnalytics'

const players = [
  { id: 'A', username: 'A', poolShareId: 'pool-a', activeLeaderName: 'Leia Organa', baseName: 'Echo Base', archetypeName: 'Leia Command', poolCardCount: 48 },
  { id: 'B', username: 'B', poolShareId: 'pool-b', activeLeaderName: 'Leia Organa', baseName: 'Echo Base', archetypeName: 'Leia Command', poolCardCount: 47 },
  { id: 'C', username: 'C', poolShareId: 'pool-c', activeLeaderName: 'Darth Vader', baseName: 'Command Center', archetypeName: 'Vader Command', poolCardCount: 49 },
  { id: 'D', username: 'D', poolShareId: 'pool-d', activeLeaderName: null, baseName: null, archetypeName: null, poolCardCount: 45 },
]

const rounds = [
  {
    matches: [
      { player1: { id: 'A' }, player2: { id: 'C' }, isBye: false, finalConfirmed: true, matchWinner: 'player1' },
      { player1: { id: 'B' }, player2: { id: 'D' }, isBye: false, finalConfirmed: true, matchWinner: 'draw' },
    ],
  },
  {
    matches: [
      { player1: { id: 'A' }, player2: null, isBye: true, finalConfirmed: true, matchWinner: 'player1' },
      { player1: { id: 'B' }, player2: { id: 'C' }, isBye: false, finalConfirmed: true, matchWinner: 'player2' },
    ],
  },
]

describe('Swiss Practice event analytics', () => {
  it('computes leader and archetype meta share from known event decks', () => {
    const summary = computeSwissPracticeEventSummary({ players, rounds })

    assert.equal(summary.totalDecks, 4)
    assert.equal(summary.knownLeaderDecks, 3)
    assert.equal(summary.leaderMeta[0].name, 'Leia Organa')
    assert.equal(summary.leaderMeta[0].deckCount, 2)
    assert.equal(summary.leaderMeta[0].metaShare, 0.5)
    assert.equal(
      summary.leaderMeta.reduce((sum, row) => sum + row.metaShare, 0),
      1
    )
  })

  it('calculates match win rates without counting byes as archetype wins', () => {
    const summary = computeSwissPracticeEventSummary({ players, rounds })
    const leia = summary.archetypeMeta.find(row => row.name === 'Leia Command')
    const vader = summary.archetypeMeta.find(row => row.name === 'Vader Command')

    assert.equal(leia?.matchWins, 1)
    assert.equal(leia?.matchLosses, 1)
    assert.equal(leia?.matchDraws, 1)
    assert.equal(leia?.matchWinRate, 1 / 3)
    assert.equal(vader?.matchWins, 1)
    assert.equal(vader?.matchLosses, 1)
  })

  it('summarizes pool coverage without pretending to have full luck math', () => {
    const summary = computeSwissPracticeEventSummary({ players, rounds })

    assert.equal(summary.poolContext.playersWithPools, 4)
    assert.equal(summary.poolContext.expectedPacksPerPlayer, 3)
    assert.equal(summary.poolContext.averagePoolCards, 47.25)
    assert.equal(summary.poolContext.status, 'ready')
  })

  it('extracts active deck identity from deck builder state and falls back to drafted leader', () => {
    const identity = deckIdentityFromDeckState({
      activeLeader: 'leader-slot',
      activeBase: 'base-slot',
      cardPositions: {
        'leader-slot': { card: { name: 'Han Solo' } },
        'base-slot': { card: { name: 'Blue Base', aspects: ['Vigilance'], hp: 30 } },
      },
    })

    assert.equal(identity.activeLeaderName, 'Han Solo')
    assert.equal(identity.baseName, 'Blue Base')
    assert.equal(identity.archetypeName, 'Han Solo Blue 30')

    const fallback = deckIdentityFromDeckState(null, [{ name: 'Luke Skywalker' }])
    assert.equal(fallback.activeLeaderName, 'Luke Skywalker')
  })
})
