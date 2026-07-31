// @ts-nocheck
/**
 * Pod Pairing Algorithm Tests
 *
 * Tests the opposite-seat pairing system used for draft pod matchmaking.
 * Covers: even/odd player counts, bye assignment, seat ordering,
 * stored bye persistence, edge cases.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { computePairings, computeSealedPodPairings } from './podPairings'

// Helper to create players with sequential seats
function makePlayers(count, startSeat = 1) {
  return Array.from({ length: count }, (_, i) => ({
    userId: `player-${i + 1}`,
    seatNumber: startSeat + i,
  }))
}

// SPEC (src/utils/podPairings.ts computeSealedPodPairings):
//   Casual sealed pod      -> a stored random pairing, rendered by /sealed/:id/pod
//   Competitive Sealed pod -> NOTHING stored; round 1 comes from the Swiss
//                             bracket (pairRound1) when the host starts matches
describe('computeSealedPodPairings', () => {
  it('pairs a casual sealed pod so the pod hub can show "Your Opponent"', () => {
    const result = computeSealedPodPairings(makePlayers(8), false)

    assert.notStrictEqual(result, null)
    assert.strictEqual(result.matches.length, 4)
    assert.strictEqual(result.byePlayerId, null)
  })

  it('gives a casual odd-count sealed pod a bye', () => {
    const result = computeSealedPodPairings(makePlayers(7), false)

    assert.strictEqual(result.matches.length, 3)
    assert.notStrictEqual(result.byePlayerId, null)
  })

  it('BUGGY: a competitive pod must NOT get random pairings that contradict Swiss', () => {
    const result = computeSealedPodPairings(makePlayers(8), true)

    assert.strictEqual(result, null)
  })

  it('FIXED: competitive returns null for every player count', () => {
    for (const count of [0, 1, 2, 3, 7, 8]) {
      assert.strictEqual(
        computeSealedPodPairings(makePlayers(count), true),
        null,
        `competitive pod with ${count} players must store no pairings`
      )
    }
  })

  it('never pairs a casual pod with fewer than 2 players', () => {
    const result = computeSealedPodPairings(makePlayers(1), false)

    assert.strictEqual(result.matches.length, 0)
    assert.strictEqual(result.byePlayerId, 'player-1')
  })
})

describe('computePairings', () => {
  describe('even player counts', () => {
    it('pairs 2 players as a single match', () => {
      const players = makePlayers(2)
      const result = computePairings(players)

      assert.strictEqual(result.matches.length, 1)
      assert.strictEqual(result.byePlayerId, null)
      assert.strictEqual(result.matches[0].player1Id, 'player-1')
      assert.strictEqual(result.matches[0].player2Id, 'player-2')
    })

    it('pairs 4 players into 2 matches using opposite seats', () => {
      const players = makePlayers(4)
      const result = computePairings(players)

      assert.strictEqual(result.matches.length, 2)
      assert.strictEqual(result.byePlayerId, null)

      // Seat 1 vs Seat 3, Seat 2 vs Seat 4
      assert.strictEqual(result.matches[0].player1Id, 'player-1')
      assert.strictEqual(result.matches[0].player2Id, 'player-3')
      assert.strictEqual(result.matches[1].player1Id, 'player-2')
      assert.strictEqual(result.matches[1].player2Id, 'player-4')
    })

    it('pairs 6 players into 3 matches using opposite seats', () => {
      const players = makePlayers(6)
      const result = computePairings(players)

      assert.strictEqual(result.matches.length, 3)
      assert.strictEqual(result.byePlayerId, null)

      // Seat 1 vs Seat 4, Seat 2 vs Seat 5, Seat 3 vs Seat 6
      assert.strictEqual(result.matches[0].player1Id, 'player-1')
      assert.strictEqual(result.matches[0].player2Id, 'player-4')
      assert.strictEqual(result.matches[1].player1Id, 'player-2')
      assert.strictEqual(result.matches[1].player2Id, 'player-5')
      assert.strictEqual(result.matches[2].player1Id, 'player-3')
      assert.strictEqual(result.matches[2].player2Id, 'player-6')
    })

    it('pairs 8 players into 4 matches using opposite seats', () => {
      const players = makePlayers(8)
      const result = computePairings(players)

      assert.strictEqual(result.matches.length, 4)
      assert.strictEqual(result.byePlayerId, null)

      // Seat 1 vs Seat 5, ..., Seat 4 vs Seat 8
      assert.strictEqual(result.matches[0].player1Id, 'player-1')
      assert.strictEqual(result.matches[0].player2Id, 'player-5')
      assert.strictEqual(result.matches[3].player1Id, 'player-4')
      assert.strictEqual(result.matches[3].player2Id, 'player-8')
    })
  })

  describe('odd player counts (bye)', () => {
    it('assigns a bye for 3 players', () => {
      const players = makePlayers(3)
      const result = computePairings(players)

      assert.strictEqual(result.matches.length, 1)
      assert.notStrictEqual(result.byePlayerId, null)
      // Bye player should be one of the 3 players
      assert.ok(
        players.some(p => p.userId === result.byePlayerId),
        'Bye player should be from the player list'
      )
    })

    it('assigns a bye for 5 players', () => {
      const players = makePlayers(5)
      const result = computePairings(players)

      assert.strictEqual(result.matches.length, 2)
      assert.notStrictEqual(result.byePlayerId, null)
    })

    it('assigns a bye for 7 players', () => {
      const players = makePlayers(7)
      const result = computePairings(players)

      assert.strictEqual(result.matches.length, 3)
      assert.notStrictEqual(result.byePlayerId, null)
    })

    it('bye player is NOT included in any match', () => {
      const players = makePlayers(5)
      const result = computePairings(players)

      const matchedPlayerIds = result.matches.flatMap(m => [m.player1Id, m.player2Id])
      assert.ok(
        !matchedPlayerIds.includes(result.byePlayerId),
        `Bye player ${result.byePlayerId} should not appear in matches`
      )
    })

    it('all non-bye players appear in exactly one match', () => {
      const players = makePlayers(5)
      const result = computePairings(players)

      const matchedPlayerIds = result.matches.flatMap(m => [m.player1Id, m.player2Id])
      const nonByePlayers = players.filter(p => p.userId !== result.byePlayerId)

      for (const p of nonByePlayers) {
        const count = matchedPlayerIds.filter(id => id === p.userId).length
        assert.strictEqual(count, 1, `Player ${p.userId} should appear exactly once, got ${count}`)
      }
    })
  })

  describe('stored bye', () => {
    it('uses stored bye player ID if valid', () => {
      const players = makePlayers(3)
      const result = computePairings(players, 'player-2')

      assert.strictEqual(result.byePlayerId, 'player-2')
      assert.strictEqual(result.matches.length, 1)
    })

    it('ignores stored bye if player not in list', () => {
      const players = makePlayers(3)
      const result = computePairings(players, 'player-99')

      // Should pick a random bye since stored one is invalid
      assert.notStrictEqual(result.byePlayerId, 'player-99')
      assert.ok(
        players.some(p => p.userId === result.byePlayerId),
        'Should pick bye from current players'
      )
    })

    it('ignores stored bye for even player count', () => {
      const players = makePlayers(4)
      const result = computePairings(players, 'player-2')

      assert.strictEqual(result.byePlayerId, null)
      assert.strictEqual(result.matches.length, 2)
    })

    it('stored bye produces deterministic pairings', () => {
      const players = makePlayers(5)
      const result1 = computePairings(players, 'player-3')
      const result2 = computePairings(players, 'player-3')

      assert.strictEqual(result1.byePlayerId, result2.byePlayerId)
      assert.strictEqual(result1.matches.length, result2.matches.length)
      for (let i = 0; i < result1.matches.length; i++) {
        assert.strictEqual(result1.matches[i].player1Id, result2.matches[i].player1Id)
        assert.strictEqual(result1.matches[i].player2Id, result2.matches[i].player2Id)
      }
    })
  })

  describe('seat ordering', () => {
    it('sorts by seat number before pairing', () => {
      // Players in random order
      const players = [
        { userId: 'alice', seatNumber: 4 },
        { userId: 'bob', seatNumber: 1 },
        { userId: 'charlie', seatNumber: 3 },
        { userId: 'diana', seatNumber: 2 },
      ]
      const result = computePairings(players)

      // Sorted: bob(1), diana(2), charlie(3), alice(4)
      // Pairings: bob vs charlie, diana vs alice
      assert.strictEqual(result.matches[0].player1Id, 'bob')
      assert.strictEqual(result.matches[0].player2Id, 'charlie')
      assert.strictEqual(result.matches[1].player1Id, 'diana')
      assert.strictEqual(result.matches[1].player2Id, 'alice')
    })

    it('handles non-sequential seat numbers', () => {
      const players = [
        { userId: 'a', seatNumber: 10 },
        { userId: 'b', seatNumber: 20 },
        { userId: 'c', seatNumber: 30 },
        { userId: 'd', seatNumber: 40 },
      ]
      const result = computePairings(players)

      // Sorted: a(10), b(20), c(30), d(40)
      // Pairings: a vs c, b vs d
      assert.strictEqual(result.matches[0].player1Id, 'a')
      assert.strictEqual(result.matches[0].player2Id, 'c')
      assert.strictEqual(result.matches[1].player1Id, 'b')
      assert.strictEqual(result.matches[1].player2Id, 'd')
    })
  })

  describe('edge cases', () => {
    it('returns empty matches for 0 players', () => {
      const result = computePairings([])

      assert.strictEqual(result.matches.length, 0)
      assert.strictEqual(result.byePlayerId, null)
    })

    it('returns bye for single player', () => {
      const players = [{ userId: 'solo', seatNumber: 1 }]
      const result = computePairings(players)

      assert.strictEqual(result.matches.length, 0)
      assert.strictEqual(result.byePlayerId, 'solo')
    })

    it('every player is either matched or has bye (3 players)', () => {
      const players = makePlayers(3)
      const result = computePairings(players)

      const allIds = new Set(players.map(p => p.userId))
      const matchedIds = new Set(result.matches.flatMap(m => [m.player1Id, m.player2Id]))
      if (result.byePlayerId) matchedIds.add(result.byePlayerId)

      assert.deepStrictEqual(allIds, matchedIds)
    })

    it('every player is either matched or has bye (7 players)', () => {
      const players = makePlayers(7)
      const result = computePairings(players)

      const allIds = new Set(players.map(p => p.userId))
      const matchedIds = new Set(result.matches.flatMap(m => [m.player1Id, m.player2Id]))
      if (result.byePlayerId) matchedIds.add(result.byePlayerId)

      assert.deepStrictEqual(allIds, matchedIds)
    })

    it('no duplicate pairings (no player in multiple matches)', () => {
      const players = makePlayers(8)
      const result = computePairings(players)

      const matchedIds = result.matches.flatMap(m => [m.player1Id, m.player2Id])
      const uniqueIds = new Set(matchedIds)
      assert.strictEqual(matchedIds.length, uniqueIds.size, 'Each player should appear only once')
    })

    it('no self-pairings (player vs themselves)', () => {
      const players = makePlayers(8)
      const result = computePairings(players)

      for (const match of result.matches) {
        assert.notStrictEqual(
          match.player1Id, match.player2Id,
          `Player ${match.player1Id} should not be paired with themselves`
        )
      }
    })
  })

  describe('randomness of bye assignment', () => {
    it('bye is assigned randomly for odd player counts (statistical check)', () => {
      const players = makePlayers(3)
      const byeCounts = new Map()

      // Run 300 times - each player should get bye roughly 100 times
      for (let i = 0; i < 300; i++) {
        const result = computePairings(players, null)
        const count = byeCounts.get(result.byePlayerId) || 0
        byeCounts.set(result.byePlayerId, count + 1)
      }

      // Each player should have received bye at least once (very unlikely to fail)
      for (const player of players) {
        assert.ok(
          (byeCounts.get(player.userId) || 0) > 0,
          `Player ${player.userId} should receive bye at least once in 300 runs`
        )
      }
    })
  })
})
