// Sealed pod config — spec tests.
//
// SPEC (Competitive Sealed):
// - Standard sealed = 6 packs per player.
// - Competitive Sealed = 8 packs per player.
// - Standard sealed allows 2–16 players (default 8).
// - Competitive Sealed is capped at exactly 8 players.
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { sealedPacksPerPlayer, sealedMaxPlayers } from './sealedPodConfig'

describe('sealedPacksPerPlayer', () => {
  it('SPEC: standard sealed deals 6 packs per player', () => {
    assert.strictEqual(sealedPacksPerPlayer(false), 6)
  })

  it('SPEC: Competitive Sealed deals 8 packs per player', () => {
    assert.strictEqual(sealedPacksPerPlayer(true), 8)
  })
})

describe('sealedMaxPlayers', () => {
  it('SPEC: standard defaults to 8 players when nothing requested', () => {
    assert.strictEqual(sealedMaxPlayers(false), 8)
    assert.strictEqual(sealedMaxPlayers(false, null), 8)
    assert.strictEqual(sealedMaxPlayers(false, 0), 8)
  })

  it('SPEC: standard honors requested value within 2–16', () => {
    assert.strictEqual(sealedMaxPlayers(false, 2), 2)
    assert.strictEqual(sealedMaxPlayers(false, 12), 12)
    assert.strictEqual(sealedMaxPlayers(false, 16), 16)
  })

  it('SPEC: standard clamps out-of-range requests to 2–16', () => {
    assert.strictEqual(sealedMaxPlayers(false, 1), 2)
    assert.strictEqual(sealedMaxPlayers(false, 40), 16)
  })

  it('SPEC: competitive is always capped at 8 players', () => {
    assert.strictEqual(sealedMaxPlayers(true), 8)
    assert.strictEqual(sealedMaxPlayers(true, 16), 8)
    assert.strictEqual(sealedMaxPlayers(true, 2), 8)
  })
})
