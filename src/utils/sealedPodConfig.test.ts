// Sealed pod config — spec tests.
//
// SPEC:
// - Sealed defaults to 6 packs per player.
// - Players may choose 6 or 8 packs; nothing else is accepted (fallback 6).
// - Competitive Sealed = 8 packs per player, whatever was requested.
// - Standard sealed allows 2–16 players (default 8).
// - Competitive Sealed is capped at exactly 8 players.
// - Competitive Sealed promises 20 minutes of BUILDING, preceded by a 5-minute
//   pack-opening allowance — so deck_lock_at is 25 minutes after the deal.
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  sealedPacksPerPlayer,
  sealedMaxPlayers,
  normalizeSealedPackCount,
  competitiveSealedDeckLockMinutes,
  COMPETITIVE_SEALED_BUILD_MINUTES,
  COMPETITIVE_SEALED_PACK_OPENING_MINUTES,
  SEALED_PACK_COUNT_OPTIONS,
} from './sealedPodConfig'

describe('normalizeSealedPackCount', () => {
  it('SPEC: the only selectable pack counts are 6 and 8', () => {
    assert.deepStrictEqual([...SEALED_PACK_COUNT_OPTIONS], [6, 8])
  })

  it('SPEC: 6 and 8 are both accepted', () => {
    assert.strictEqual(normalizeSealedPackCount(6), 6)
    assert.strictEqual(normalizeSealedPackCount(8), 8)
  })

  it('SPEC: numeric strings (URL params) are accepted', () => {
    assert.strictEqual(normalizeSealedPackCount('6'), 6)
    assert.strictEqual(normalizeSealedPackCount('8'), 8)
  })

  it('SPEC: missing values fall back to 6', () => {
    assert.strictEqual(normalizeSealedPackCount(), 6)
    assert.strictEqual(normalizeSealedPackCount(null), 6)
    assert.strictEqual(normalizeSealedPackCount(undefined), 6)
  })

  it('SPEC: invalid values fall back to 6', () => {
    assert.strictEqual(normalizeSealedPackCount(7), 6)
    assert.strictEqual(normalizeSealedPackCount(0), 6)
    assert.strictEqual(normalizeSealedPackCount(-8), 6)
    assert.strictEqual(normalizeSealedPackCount(24), 6)
    assert.strictEqual(normalizeSealedPackCount(6.5), 6)
    assert.strictEqual(normalizeSealedPackCount('eight'), 6)
    assert.strictEqual(normalizeSealedPackCount(''), 6)
  })
})

describe('sealedPacksPerPlayer', () => {
  it('SPEC: standard sealed deals 6 packs per player by default', () => {
    assert.strictEqual(sealedPacksPerPlayer(false), 6)
    assert.strictEqual(sealedPacksPerPlayer(false, null), 6)
  })

  it('SPEC: standard sealed honors a requested 6 or 8', () => {
    assert.strictEqual(sealedPacksPerPlayer(false, 6), 6)
    assert.strictEqual(sealedPacksPerPlayer(false, 8), 8)
    assert.strictEqual(sealedPacksPerPlayer(false, '8'), 8)
  })

  it('SPEC: standard sealed falls back to 6 for invalid requests', () => {
    assert.strictEqual(sealedPacksPerPlayer(false, 12), 6)
    assert.strictEqual(sealedPacksPerPlayer(false, 'lots'), 6)
  })

  it('SPEC: Competitive Sealed defaults to 8 packs per player', () => {
    assert.strictEqual(sealedPacksPerPlayer(true), 8)
    assert.strictEqual(sealedPacksPerPlayer(true, null), 8)
  })

  it('NEW CODE: Competitive Sealed honors a requested 6 or 8', () => {
    // OLD CODE forced 8 regardless of what the host chose.
    assert.strictEqual(sealedPacksPerPlayer(true, 6), 6)
    assert.strictEqual(sealedPacksPerPlayer(true, '6'), 6)
    assert.strictEqual(sealedPacksPerPlayer(true, 8), 8)
  })

  it('SPEC: Competitive Sealed falls back to 8 for invalid requests', () => {
    assert.strictEqual(sealedPacksPerPlayer(true, 12), 8)
    assert.strictEqual(sealedPacksPerPlayer(true, 'lots'), 8)
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

describe('competitiveSealedDeckLockMinutes', () => {
  it('SPEC: the promised build window is 20 minutes', () => {
    assert.strictEqual(COMPETITIVE_SEALED_BUILD_MINUTES, 20)
  })

  it('SPEC: packs get a 5-minute opening allowance before the build clock starts', () => {
    assert.strictEqual(COMPETITIVE_SEALED_PACK_OPENING_MINUTES, 5)
  })

  it('BUGGY: a 20-minute deadline set at deal time ate the build window with pack opening', () => {
    // Sealed players still have to open 8 packs and review the pool before the
    // deckbuilder loads, so the deadline must be LONGER than the build window.
    assert.ok(
      competitiveSealedDeckLockMinutes() > COMPETITIVE_SEALED_BUILD_MINUTES,
      'deck_lock_at must leave room for pack opening on top of the build window'
    )
  })

  it('FIXED: deck_lock_at is 25 minutes after the deal (5 opening + 20 building)', () => {
    assert.strictEqual(competitiveSealedDeckLockMinutes(), 25)
  })
})
