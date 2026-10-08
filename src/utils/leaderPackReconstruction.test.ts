import { describe, it } from 'node:test'
import assert from 'node:assert'
import { reconstructOriginalLeaderPacks } from './draftLogReconstruction'

// SPEC (leader draft): each seat is dealt `packsPerPlayer` leaders (3 in a
// standard draft) and there are exactly that many rounds, passing RIGHT — so
// every dealt leader is eventually picked and the original per-seat packs are
// fully recoverable from every seat's drafted_leaders. This is the invariant
// migration 077's backfill relies on.

const leader = (instanceId) => ({ instanceId, name: `Leader ${instanceId}` })
const picked = (instanceId, leaderRound) => ({ instanceId, leaderRound })
const idSet = (pack) => new Set(pack.map((c) => c.instanceId))

describe('reconstructOriginalLeaderPacks (backfill contract)', () => {
  it('recovers the exact 3-leader opening packs for a 3-seat draft', () => {
    // KNOWN deal (the spec we are testing against — NOT derived from output):
    //   seat 1 opened { L1a, L1b, L1c }
    //   seat 2 opened { L2a, L2b, L2c }
    //   seat 3 opened { L3a, L3b, L3c }
    // Passing right, the picks that actually get recorded per seat are:
    const players = [
      { seatNumber: 1, draftedLeaders: [picked('L1a', 1), picked('L3b', 2), picked('L2c', 3)] },
      { seatNumber: 2, draftedLeaders: [picked('L2a', 1), picked('L1b', 2), picked('L3c', 3)] },
      { seatNumber: 3, draftedLeaders: [picked('L3a', 1), picked('L2b', 2), picked('L1c', 3)] },
    ]

    const packs = reconstructOriginalLeaderPacks(players, 3)

    assert.strictEqual(packs.length, 3, 'one original pack per seat')
    // Index i holds seat (i+1)'s opening pack.
    assert.deepStrictEqual(idSet(packs[0]), new Set(['L1a', 'L1b', 'L1c']), 'seat 1 opening')
    assert.deepStrictEqual(idSet(packs[1]), new Set(['L2a', 'L2b', 'L2c']), 'seat 2 opening')
    assert.deepStrictEqual(idSet(packs[2]), new Set(['L3a', 'L3b', 'L3c']), 'seat 3 opening')
  })

  it('recovers openings for a 2-seat draft (3 rounds still consume every leader)', () => {
    // seat 1 opened { A, B, C }; seat 2 opened { D, E, F }.
    // Round 1: each picks from own pack. Round 2: packs swap. Round 3: swap back
    // (2 seats passing right), so each pack's last leader is taken by its owner.
    //   seat 1: A(r1, own), then from seat 2's pack E(r2), then own C(r3)
    //   seat 2: D(r1, own), then from seat 1's pack B(r2), then own F(r3)
    const players = [
      { seatNumber: 1, draftedLeaders: [picked('A', 1), picked('E', 2), picked('C', 3)] },
      { seatNumber: 2, draftedLeaders: [picked('D', 1), picked('B', 2), picked('F', 3)] },
    ]

    const packs = reconstructOriginalLeaderPacks(players, 2)

    assert.strictEqual(packs.length, 2)
    assert.deepStrictEqual(idSet(packs[0]), new Set(['A', 'B', 'C']), 'seat 1 opening')
    assert.deepStrictEqual(idSet(packs[1]), new Set(['D', 'E', 'F']), 'seat 2 opening')
  })

  it('places every drafted leader exactly once (no loss, no empty pack)', () => {
    const players = [
      { seatNumber: 1, draftedLeaders: [picked('L1a', 1), picked('L3b', 2), picked('L2c', 3)] },
      { seatNumber: 2, draftedLeaders: [picked('L2a', 1), picked('L1b', 2), picked('L3c', 3)] },
      { seatNumber: 3, draftedLeaders: [picked('L3a', 1), picked('L2b', 2), picked('L1c', 3)] },
    ]

    const packs = reconstructOriginalLeaderPacks(players, 3)

    const total = packs.reduce((n, p) => n + p.length, 0)
    assert.strictEqual(total, 9, 'all 9 leaders placed')
    assert.ok(packs.every((p) => p.length === 3), 'every opening pack has 3 leaders')
  })
})
