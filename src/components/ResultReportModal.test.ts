// @ts-nocheck
/**
 * ResultReportModal logic tests.
 *
 * Tests the pure helpers that govern when the Submit button is enabled.
 * Per SWU rules, match outcomes can be:
 *  - Player 1 wins (>= 2 game wins for player 1)
 *  - Player 2 wins (>= 2 game wins for player 2)
 *  - Draw (3 games played and neither player has 2 wins — includes 1-1-1,
 *    0-0-0 all-draws, 1-0-2-with-draws, etc.)
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { isDecided, needsGame3, countWins } from './ResultReportModal.helpers'

describe('ResultReportModal isDecided', () => {
  describe('decided by 2-game sweep', () => {
    it('returns true for 2-0 player1', () => {
      assert.strictEqual(isDecided('player1', 'player1', null), true)
    })
    it('returns true for 2-0 player2', () => {
      assert.strictEqual(isDecided('player2', 'player2', null), true)
    })
  })

  describe('decided by 2-1 split', () => {
    it('returns true for player1 2-1 (loss-win-win)', () => {
      assert.strictEqual(isDecided('player2', 'player1', 'player1'), true)
    })
    it('returns true for player2 2-1 (win-loss-loss)', () => {
      assert.strictEqual(isDecided('player1', 'player2', 'player2'), true)
    })
    it('returns true for player1 2-1 with a per-game draw (draw-win-win)', () => {
      assert.strictEqual(isDecided('draw', 'player1', 'player1'), true)
    })
  })

  describe('decided by match-level draw (3 games, no 2-win)', () => {
    it('returns true for 1-1-1 (player1, player2, draw)', () => {
      // Per spec: this is a valid match draw — both players win one, one game drawn
      assert.strictEqual(isDecided('player1', 'player2', 'draw'), true)
    })
    it('returns true for 1-1-1 (player2, player1, draw)', () => {
      assert.strictEqual(isDecided('player2', 'player1', 'draw'), true)
    })
    it('returns true for 0-0-0 all-draws', () => {
      assert.strictEqual(isDecided('draw', 'draw', 'draw'), true)
    })
    it('returns true for 1-0-2-draws (player1 has 1 win, two draws)', () => {
      assert.strictEqual(isDecided('player1', 'draw', 'draw'), true)
    })
    it('returns true for 0-1-2-draws (player2 has 1 win, two draws)', () => {
      assert.strictEqual(isDecided('draw', 'player2', 'draw'), true)
    })
  })

  describe('not decided', () => {
    it('returns false when only 1 game filled', () => {
      assert.strictEqual(isDecided('player1', null, null), false)
    })
    it('returns false when game1+game2 are split and game3 is missing', () => {
      // 1-1-_: not yet decided, must play game 3
      assert.strictEqual(isDecided('player1', 'player2', null), false)
    })
    it('returns false when game1+game2 are draws and game3 is missing', () => {
      // 0-0-_: not yet decided, must play game 3
      assert.strictEqual(isDecided('draw', 'draw', null), false)
    })
    it('returns false when no games are filled', () => {
      assert.strictEqual(isDecided(null, null, null), false)
    })
  })
})

describe('ResultReportModal needsGame3', () => {
  it('returns false when game1 is missing', () => {
    assert.strictEqual(needsGame3(null, 'player1'), false)
  })
  it('returns false when game2 is missing', () => {
    assert.strictEqual(needsGame3('player1', null), false)
  })
  it('returns false when someone won 2-0', () => {
    assert.strictEqual(needsGame3('player1', 'player1'), false)
    assert.strictEqual(needsGame3('player2', 'player2'), false)
  })
  it('returns true on 1-1 split', () => {
    assert.strictEqual(needsGame3('player1', 'player2'), true)
    assert.strictEqual(needsGame3('player2', 'player1'), true)
  })
  it('returns true on draw-win (no 2-win yet)', () => {
    assert.strictEqual(needsGame3('draw', 'player1'), true)
    assert.strictEqual(needsGame3('player2', 'draw'), true)
  })
  it('returns true on 0-0 (both draws)', () => {
    assert.strictEqual(needsGame3('draw', 'draw'), true)
  })
})

describe('ResultReportModal countWins', () => {
  it('counts player1 wins ignoring null and draw', () => {
    assert.strictEqual(countWins(['player1', 'draw', null], 'player1'), 1)
    assert.strictEqual(countWins(['player1', 'player1', 'draw'], 'player1'), 2)
  })
  it('counts player2 wins ignoring null and draw', () => {
    assert.strictEqual(countWins(['player2', 'draw', 'player2'], 'player2'), 2)
  })
})
