// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  deriveMatchWinner,
  resultsMatch,
  calculateOMW,
  rankPlayers,
} from './results'

describe('results', () => {
  describe('deriveMatchWinner', () => {
    it('returns player1 for 2-0', () => {
      assert.strictEqual(deriveMatchWinner('player1', 'player1', null), 'player1')
    })

    it('returns player2 for 0-2', () => {
      assert.strictEqual(deriveMatchWinner('player2', 'player2', null), 'player2')
    })

    it('returns player1 for 2-1', () => {
      assert.strictEqual(deriveMatchWinner('player1', 'player2', 'player1'), 'player1')
    })

    it('returns player2 for 1-2', () => {
      assert.strictEqual(deriveMatchWinner('player1', 'player2', 'player2'), 'player2')
    })

    it('returns draw for 1-1-draw', () => {
      assert.strictEqual(deriveMatchWinner('player1', 'player2', 'draw'), 'draw')
    })

    it('returns null for incomplete (only 1 game)', () => {
      assert.strictEqual(deriveMatchWinner('player1', null, null), null)
    })
  })

  describe('resultsMatch', () => {
    it('returns true for identical submissions', () => {
      const sub1 = { game1: 'player1', game2: 'player2', game3: 'player1' }
      const sub2 = { game1: 'player1', game2: 'player2', game3: 'player1' }
      assert.strictEqual(resultsMatch(sub1, sub2), true)
    })

    it('returns false for conflicting submissions', () => {
      const sub1 = { game1: 'player1', game2: 'player2', game3: 'player1' }
      const sub2 = { game1: 'player1', game2: 'player1', game3: null }
      assert.strictEqual(resultsMatch(sub1, sub2), false)
    })
  })

  describe('calculateOMW', () => {
    // Setup: player 'a' beat 'b' and 'c'
    // 'b' is 0-1 (win rate 0%, floored to 33%)
    // 'c' is 1-1 (win rate 50%)
    // a's OMW = (0.33 + 0.5) / 2 = 0.415
    const matches = [
      {
        player1Id: 'a',
        player2Id: 'b',
        matchWinner: 'a',
        isBye: false,
        finalConfirmed: true,
      },
      {
        player1Id: 'a',
        player2Id: 'c',
        matchWinner: 'a',
        isBye: false,
        finalConfirmed: true,
      },
      {
        player1Id: 'c',
        player2Id: 'd',
        matchWinner: 'c',
        isBye: false,
        finalConfirmed: true,
      },
    ]

    it('calculates average of opponent win rates', () => {
      const omw = calculateOMW('a', matches, ['a', 'b', 'c', 'd'])
      const expected = (0.33 + 0.5) / 2 // 0.415
      assert(
        Math.abs(omw - expected) < 0.001,
        `Expected OMW ~${expected}, got ${omw}`
      )
    })

    it('floors opponent rate at 33%', () => {
      // b has 0 wins in 1 match — rate would be 0%, but floored to 33%
      const matchesForB = [
        {
          player1Id: 'x',
          player2Id: 'b',
          matchWinner: 'x',
          isBye: false,
          finalConfirmed: true,
        },
      ]
      const omw = calculateOMW('x', matchesForB, ['x', 'b'])
      assert(
        Math.abs(omw - 0.33) < 0.001,
        `Expected floored OMW of 0.33, got ${omw}`
      )
    })

    it('excludes bye rounds', () => {
      const matchesWithBye = [
        {
          player1Id: 'a',
          player2Id: null,
          matchWinner: 'a',
          isBye: true,
          finalConfirmed: true,
        },
        {
          player1Id: 'a',
          player2Id: 'b',
          matchWinner: 'a',
          isBye: false,
          finalConfirmed: true,
        },
        {
          player1Id: 'b',
          player2Id: 'c',
          matchWinner: 'b',
          isBye: false,
          finalConfirmed: true,
        },
      ]
      // b is 1-1 overall but 1-0 against non-bye... wait, b won 1 of 2 confirmed non-bye = 50%
      const omw = calculateOMW('a', matchesWithBye, ['a', 'b', 'c'])
      // Only opponent is b: b's confirmed non-bye matches are both listed above, b won 1 of 2 = 50%
      assert(
        Math.abs(omw - 0.5) < 0.001,
        `Expected OMW of 0.5 (bye excluded), got ${omw}`
      )
    })
  })

  describe('rankPlayers', () => {
    it('ranks by match wins first', () => {
      const players = [
        { id: 'a', matchWins: 1, matchLosses: 2 },
        { id: 'b', matchWins: 3, matchLosses: 0 },
        { id: 'c', matchWins: 2, matchLosses: 1 },
      ]
      const ranked = rankPlayers(players, [])
      assert.strictEqual(ranked[0].id, 'b')
      assert.strictEqual(ranked[1].id, 'c')
      assert.strictEqual(ranked[2].id, 'a')
      assert.strictEqual(ranked[0].rank, 1)
      assert.strictEqual(ranked[1].rank, 2)
      assert.strictEqual(ranked[2].rank, 3)
    })

    it('breaks ties with OMW%', () => {
      // 'a' and 'b' both have 2 wins
      // 'a' played vs 'c' (1-1, 50% win rate) → a's OMW = 0.5
      // 'b' played vs 'd' (0-1, floored 33% win rate) → b's OMW = 0.33
      // so 'a' should rank above 'b'
      const players = [
        { id: 'a', matchWins: 2, matchLosses: 1 },
        { id: 'b', matchWins: 2, matchLosses: 1 },
      ]
      const matches = [
        // a beat c, d beat c → c is 0-1 with a, 0-1 with d = 0% floored to 33%... let's do it differently
        // a played c; c won 1 match total (50%)
        { player1Id: 'a', player2Id: 'c', matchWinner: 'a', isBye: false, finalConfirmed: true },
        { player1Id: 'c', player2Id: 'e', matchWinner: 'c', isBye: false, finalConfirmed: true },
        // b played d; d won 0 matches (0%, floored to 33%)
        { player1Id: 'b', player2Id: 'd', matchWinner: 'b', isBye: false, finalConfirmed: true },
      ]
      const ranked = rankPlayers(players, matches, ['a', 'b', 'c', 'd', 'e'])
      // a's OMW: opponent c has 1 win / 2 matches = 50%
      // b's OMW: opponent d has 0 wins / 1 match = 0%, floored to 33%
      assert.strictEqual(ranked[0].id, 'a', `Expected a first, got ${ranked[0].id}`)
      assert.strictEqual(ranked[1].id, 'b', `Expected b second, got ${ranked[1].id}`)
    })
  })
})
