// @ts-nocheck
/**
 * Tests for packOpenerSeat — characterization vs the actual draft pack
 * generator. The test names include "OPENER MATH MUST MATCH" so a generator
 * change is loud in CI output.
 *
 * Source-of-truth references:
 *   STANDARD: app/api/draft/[shareId]/start/route.ts ~line 116
 *             packIndex = playerIndex * packsPerPlayer + packNum
 *   CHAOS:    src/utils/draftLogic.ts ~line 102-104
 *             packIndex = packNum * 8 + playerIndex   (8 hardcoded)
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { packOpenerSeat, CHAOS_PACKS_PER_SET_GROUP } from './packOpenerSeat.ts'

describe('packOpenerSeat — STANDARD mode (OPENER MATH MUST MATCH src/utils/draftLogic.ts)', () => {
  it('8-player, 3 packs/player: pack_index 0,1,2 → seat 0', () => {
    for (const packIndex of [0, 1, 2]) {
      const seat = packOpenerSeat({
        packIndex,
        packsPerPlayer: 3,
        playerCount: 8,
        isChaos: false,
      })
      assert.strictEqual(seat, 0, `pack_index ${packIndex} should belong to seat 0`)
    }
  })

  it('8-player, 3 packs/player: pack_index 3,4,5 → seat 1', () => {
    for (const packIndex of [3, 4, 5]) {
      const seat = packOpenerSeat({
        packIndex,
        packsPerPlayer: 3,
        playerCount: 8,
        isChaos: false,
      })
      assert.strictEqual(seat, 1, `pack_index ${packIndex} should belong to seat 1`)
    }
  })

  it('8-player, 3 packs/player: pack_index 21,22,23 → seat 7 (last seat)', () => {
    for (const packIndex of [21, 22, 23]) {
      const seat = packOpenerSeat({
        packIndex,
        packsPerPlayer: 3,
        playerCount: 8,
        isChaos: false,
      })
      assert.strictEqual(seat, 7, `pack_index ${packIndex} should belong to seat 7`)
    }
  })

  it('6-player, 3 packs/player: pack_index 0,1,2 → seat 0', () => {
    for (const packIndex of [0, 1, 2]) {
      const seat = packOpenerSeat({
        packIndex,
        packsPerPlayer: 3,
        playerCount: 6,
        isChaos: false,
      })
      assert.strictEqual(seat, 0)
    }
  })

  it('6-player, 3 packs/player: pack_index 15,16,17 → seat 5 (last seat)', () => {
    for (const packIndex of [15, 16, 17]) {
      const seat = packOpenerSeat({
        packIndex,
        packsPerPlayer: 3,
        playerCount: 6,
        isChaos: false,
      })
      assert.strictEqual(seat, 5, `pack_index ${packIndex} should belong to seat 5`)
    }
  })

  it('4-player, 4 packs/player: pack_index 0,1,2,3 → seat 0', () => {
    for (const packIndex of [0, 1, 2, 3]) {
      const seat = packOpenerSeat({
        packIndex,
        packsPerPlayer: 4,
        playerCount: 4,
        isChaos: false,
      })
      assert.strictEqual(seat, 0)
    }
  })

  it('4-player, 4 packs/player: pack_index 12,13,14,15 → seat 3 (last seat)', () => {
    for (const packIndex of [12, 13, 14, 15]) {
      const seat = packOpenerSeat({
        packIndex,
        packsPerPlayer: 4,
        playerCount: 4,
        isChaos: false,
      })
      assert.strictEqual(seat, 3, `pack_index ${packIndex} should belong to seat 3`)
    }
  })

  it('matches the generator formula playerIndex * packsPerPlayer + packNum for every pack', () => {
    // Walk an 8x3 grid as if we were the generator at draft-start, then
    // confirm that for every (player, packNum) pair the inverse gives us
    // back the player. This is the equivalence the live SQL relies on.
    const packsPerPlayer = 3
    const playerCount = 8
    for (let player = 0; player < playerCount; player++) {
      for (let packNum = 0; packNum < packsPerPlayer; packNum++) {
        const packIndex = player * packsPerPlayer + packNum
        const seat = packOpenerSeat({
          packIndex,
          packsPerPlayer,
          playerCount,
          isChaos: false,
        })
        assert.strictEqual(
          seat,
          player,
          `inverse failed for player ${player}, packNum ${packNum} (packIndex ${packIndex})`,
        )
      }
    }
  })
})

describe('packOpenerSeat — CHAOS mode (OPENER MATH MUST MATCH src/utils/draftLogic.ts)', () => {
  it('uses the hardcoded constant 8 from the generator', () => {
    // Documented in the helper file header: the chaos generator always
    // produces 8 packs per selected set group regardless of player count
    // (see app/api/draft/route.ts and src/utils/draftLogic.ts). The
    // constant is exported so a change to one is loud in the other.
    assert.strictEqual(CHAOS_PACKS_PER_SET_GROUP, 8)
  })

  it('chaos 8-player: pack_index 0 → seat 0; pack_index 1 → seat 1', () => {
    assert.strictEqual(
      packOpenerSeat({ packIndex: 0, packsPerPlayer: 3, playerCount: 8, isChaos: true }),
      0,
    )
    assert.strictEqual(
      packOpenerSeat({ packIndex: 1, packsPerPlayer: 3, playerCount: 8, isChaos: true }),
      1,
    )
  })

  it('chaos 8-player: pack_index 8 → seat 0 (round 2 starts back at seat 0)', () => {
    assert.strictEqual(
      packOpenerSeat({ packIndex: 8, packsPerPlayer: 3, playerCount: 8, isChaos: true }),
      0,
    )
  })

  it('chaos 8-player: pack_index 15 → seat 7 (last pack of round 2)', () => {
    assert.strictEqual(
      packOpenerSeat({ packIndex: 15, packsPerPlayer: 3, playerCount: 8, isChaos: true }),
      7,
    )
  })

  it('chaos: uses modulus 8 even when player count is < 8 (generator constant)', () => {
    // A 4-player chaos pod still uses the 8-pack-per-set generator.
    // pack_index 4..7 sit in the box but are never delivered to a seat;
    // pack_index 8 starts round 2 for seat 0. The helper's chaos branch
    // doesn't care about player_count — it returns what the generator
    // would assign if the seat existed.
    assert.strictEqual(
      packOpenerSeat({ packIndex: 8, packsPerPlayer: 3, playerCount: 4, isChaos: true }),
      0,
    )
  })

  it('matches the generator formula (packNum * 8) + player for every pack', () => {
    // Walk a 3-round x 8-seat chaos grid and confirm the inverse.
    const packsPerPlayer = 3
    for (let packNum = 0; packNum < packsPerPlayer; packNum++) {
      for (let player = 0; player < 8; player++) {
        const packIndex = packNum * 8 + player
        const seat = packOpenerSeat({
          packIndex,
          packsPerPlayer,
          playerCount: 8,
          isChaos: true,
        })
        assert.strictEqual(
          seat,
          player,
          `chaos inverse failed for player ${player}, packNum ${packNum} (packIndex ${packIndex})`,
        )
      }
    }
  })
})

describe('packOpenerSeat — boundary cases', () => {
  it('packIndex 0 → seat 0 in both modes (the trivial boundary)', () => {
    assert.strictEqual(
      packOpenerSeat({ packIndex: 0, packsPerPlayer: 3, playerCount: 8, isChaos: false }),
      0,
    )
    assert.strictEqual(
      packOpenerSeat({ packIndex: 0, packsPerPlayer: 3, playerCount: 8, isChaos: true }),
      0,
    )
  })

  it('STANDARD: packIndex = playerCount * packsPerPlayer - 1 → last seat', () => {
    // 8 players, 3 packs/player: last packIndex = 23 → seat 7.
    assert.strictEqual(
      packOpenerSeat({
        packIndex: 8 * 3 - 1,
        packsPerPlayer: 3,
        playerCount: 8,
        isChaos: false,
      }),
      7,
    )
    // 4 players, 4 packs/player: last packIndex = 15 → seat 3.
    assert.strictEqual(
      packOpenerSeat({
        packIndex: 4 * 4 - 1,
        packsPerPlayer: 4,
        playerCount: 4,
        isChaos: false,
      }),
      3,
    )
  })

  it('CHAOS: packIndex = packsPerPlayer * 8 - 1 → last seat (7)', () => {
    // 3 rounds × 8 seats = 24 packs; last index = 23 → seat 7.
    assert.strictEqual(
      packOpenerSeat({
        packIndex: 3 * 8 - 1,
        packsPerPlayer: 3,
        playerCount: 8,
        isChaos: true,
      }),
      7,
    )
  })
})

describe('packOpenerSeat — input validation', () => {
  it('throws on negative packIndex', () => {
    assert.throws(
      () =>
        packOpenerSeat({
          packIndex: -1,
          packsPerPlayer: 3,
          playerCount: 8,
          isChaos: false,
        }),
      RangeError,
    )
  })

  it('throws on non-integer packIndex', () => {
    assert.throws(
      () =>
        packOpenerSeat({
          packIndex: 1.5,
          packsPerPlayer: 3,
          playerCount: 8,
          isChaos: false,
        }),
      RangeError,
    )
  })

  it('throws on non-positive packsPerPlayer in STANDARD mode', () => {
    assert.throws(
      () =>
        packOpenerSeat({
          packIndex: 0,
          packsPerPlayer: 0,
          playerCount: 8,
          isChaos: false,
        }),
      RangeError,
    )
    assert.throws(
      () =>
        packOpenerSeat({
          packIndex: 0,
          packsPerPlayer: -1,
          playerCount: 8,
          isChaos: false,
        }),
      RangeError,
    )
  })

  it('tolerates 0 packsPerPlayer in CHAOS mode (chaos ignores it)', () => {
    // The chaos branch does not consult packsPerPlayer. A pod that came
    // through with a zero/missing value should not crash this helper.
    assert.strictEqual(
      packOpenerSeat({
        packIndex: 8,
        packsPerPlayer: 0,
        playerCount: 8,
        isChaos: true,
      }),
      0,
    )
  })
})

console.log('\nRunning packOpenerSeat tests...\n')
