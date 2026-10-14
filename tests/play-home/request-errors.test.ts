import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { playerFacingError } from '../../play-home/home/shared'

const FALLBACK = "Couldn't reach the game server. Try again in a moment."

describe('playerFacingError', () => {
  it('FIXED: never shows a raw JSON parse failure', () => {
    const e = new SyntaxError("Failed to execute 'json' on 'Response': Unexpected end of JSON input")
    assert.equal(playerFacingError(e, FALLBACK), FALLBACK)
  })

  it('hides network and timeout failures behind the fallback', () => {
    assert.equal(playerFacingError(new TypeError('Failed to fetch'), FALLBACK), FALLBACK)
    assert.equal(playerFacingError(new DOMException('signal timed out', 'TimeoutError'), FALLBACK), FALLBACK)
    assert.equal(playerFacingError('nope', FALLBACK), FALLBACK)
  })

  it('keeps a message the server wrote for the player', () => {
    assert.equal(playerFacingError(new Error('That game is full.'), FALLBACK), 'That game is full.')
  })
})
