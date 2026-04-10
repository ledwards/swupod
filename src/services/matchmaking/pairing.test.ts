// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { pairRound1, pairSwiss, assignBye } from './pairing'
import type { PairingPlayer } from './pairing'

function makePlayer(overrides: Partial<PairingPlayer> & { id: string; seatNumber: number }): PairingPlayer {
  return {
    matchWins: 0,
    matchLosses: 0,
    hasBye: false,
    dropped: false,
    opponents: [],
    ...overrides,
  }
}

describe('pairing', () => {
  describe('pairRound1', () => {
    it('pairs 8 players as 1v5 2v6 3v7 4v8', () => {
      const players = [1, 2, 3, 4, 5, 6, 7, 8].map(n =>
        makePlayer({ id: `p${n}`, seatNumber: n })
      )

      const pairings = pairRound1(players)

      assert.strictEqual(pairings.length, 4)
      assert.deepStrictEqual(pairings[0], { player1Id: 'p1', player2Id: 'p5', isBye: false })
      assert.deepStrictEqual(pairings[1], { player1Id: 'p2', player2Id: 'p6', isBye: false })
      assert.deepStrictEqual(pairings[2], { player1Id: 'p3', player2Id: 'p7', isBye: false })
      assert.deepStrictEqual(pairings[3], { player1Id: 'p4', player2Id: 'p8', isBye: false })
    })

    it('pairs 6 players as 1v4 2v5 3v6', () => {
      const players = [1, 2, 3, 4, 5, 6].map(n =>
        makePlayer({ id: `p${n}`, seatNumber: n })
      )

      const pairings = pairRound1(players)

      assert.strictEqual(pairings.length, 3)
      assert.deepStrictEqual(pairings[0], { player1Id: 'p1', player2Id: 'p4', isBye: false })
      assert.deepStrictEqual(pairings[1], { player1Id: 'p2', player2Id: 'p5', isBye: false })
      assert.deepStrictEqual(pairings[2], { player1Id: 'p3', player2Id: 'p6', isBye: false })
    })

    it('handles dropped player (opponent gets bye)', () => {
      const players = [1, 2, 3, 4, 5, 6, 7, 8].map(n =>
        makePlayer({ id: `p${n}`, seatNumber: n })
      )
      // p5 is dropped — p1's opposite — so p1 gets a bye
      players[4].dropped = true

      const pairings = pairRound1(players)

      // p1 gets a bye, others pair normally
      const p1Pairing = pairings.find(p => p.player1Id === 'p1')
      assert.ok(p1Pairing, 'p1 should have a pairing')
      assert.strictEqual(p1Pairing!.player2Id, null)
      assert.strictEqual(p1Pairing!.isBye, true)

      // p2v6, p3v7, p4v8 are normal
      const normalPairings = pairings.filter(p => !p.isBye)
      assert.strictEqual(normalPairings.length, 3)
    })
  })

  describe('pairSwiss', () => {
    it('groups by record, winners play winners', () => {
      // 8 players: p1-p4 have 1 win, p5-p8 have 0 wins
      // Set opponents so that no one from the same group has played each other yet
      const players: PairingPlayer[] = [
        makePlayer({ id: 'p1', seatNumber: 1, matchWins: 1, opponents: ['p5'] }),
        makePlayer({ id: 'p2', seatNumber: 2, matchWins: 1, opponents: ['p6'] }),
        makePlayer({ id: 'p3', seatNumber: 3, matchWins: 1, opponents: ['p7'] }),
        makePlayer({ id: 'p4', seatNumber: 4, matchWins: 1, opponents: ['p8'] }),
        makePlayer({ id: 'p5', seatNumber: 5, matchWins: 0, opponents: ['p1'] }),
        makePlayer({ id: 'p6', seatNumber: 6, matchWins: 0, opponents: ['p2'] }),
        makePlayer({ id: 'p7', seatNumber: 7, matchWins: 0, opponents: ['p3'] }),
        makePlayer({ id: 'p8', seatNumber: 8, matchWins: 0, opponents: ['p4'] }),
      ]

      const pairings = pairSwiss(players)

      assert.strictEqual(pairings.length, 4)

      const oneWinIds = new Set(['p1', 'p2', 'p3', 'p4'])
      const zeroWinIds = new Set(['p5', 'p6', 'p7', 'p8'])

      for (const pairing of pairings) {
        assert.ok(pairing.player2Id !== null, 'no byes expected with 8 players')
        const bothWinners = oneWinIds.has(pairing.player1Id) && oneWinIds.has(pairing.player2Id)
        const bothLosers = zeroWinIds.has(pairing.player1Id) && zeroWinIds.has(pairing.player2Id)
        assert.ok(bothWinners || bothLosers, `Expected same-record pairing, got ${pairing.player1Id} vs ${pairing.player2Id}`)
      }
    })

    it('avoids rematches', () => {
      // 4 players all with 1 win; a-b already played, c-d already played
      const players: PairingPlayer[] = [
        makePlayer({ id: 'a', seatNumber: 1, matchWins: 1, opponents: ['b'] }),
        makePlayer({ id: 'b', seatNumber: 2, matchWins: 1, opponents: ['a'] }),
        makePlayer({ id: 'c', seatNumber: 3, matchWins: 1, opponents: ['d'] }),
        makePlayer({ id: 'd', seatNumber: 4, matchWins: 1, opponents: ['c'] }),
      ]

      const pairings = pairSwiss(players)

      assert.strictEqual(pairings.length, 2)

      for (const pairing of pairings) {
        assert.ok(pairing.player2Id !== null)
        const isRematch =
          (pairing.player1Id === 'a' && pairing.player2Id === 'b') ||
          (pairing.player1Id === 'b' && pairing.player2Id === 'a') ||
          (pairing.player1Id === 'c' && pairing.player2Id === 'd') ||
          (pairing.player1Id === 'd' && pairing.player2Id === 'c')
        assert.ok(!isRematch, `Rematch detected: ${pairing.player1Id} vs ${pairing.player2Id}`)
      }
    })

    it('skips dropped players and gives bye for odd count', () => {
      // 5 active players (1 dropped) → odd active → one gets a bye
      const players: PairingPlayer[] = [
        makePlayer({ id: 'p1', seatNumber: 1 }),
        makePlayer({ id: 'p2', seatNumber: 2 }),
        makePlayer({ id: 'p3', seatNumber: 3 }),
        makePlayer({ id: 'p4', seatNumber: 4 }),
        makePlayer({ id: 'p5', seatNumber: 5 }),
        makePlayer({ id: 'p6', seatNumber: 6, dropped: true }),
      ]

      const pairings = pairSwiss(players)

      const byePairings = pairings.filter(p => p.isBye)
      const regularPairings = pairings.filter(p => !p.isBye)

      assert.strictEqual(byePairings.length, 1)
      assert.strictEqual(regularPairings.length, 2)

      // Dropped player should not appear in any pairing
      const allIds = pairings.flatMap(p => [p.player1Id, p.player2Id]).filter(Boolean)
      assert.ok(!allIds.includes('p6'), 'dropped player p6 should not appear in pairings')
    })
  })

  describe('assignBye', () => {
    it('assigns to lowest-ranked without prior bye', () => {
      const players: PairingPlayer[] = [
        makePlayer({ id: 'p1', seatNumber: 1, matchWins: 2, hasBye: false }),
        makePlayer({ id: 'p2', seatNumber: 2, matchWins: 1, hasBye: false }),
        makePlayer({ id: 'p3', seatNumber: 3, matchWins: 0, hasBye: false }),
      ]

      const byeId = assignBye(players)
      assert.strictEqual(byeId, 'p3')
    })

    it('skips players who already had a bye', () => {
      const players: PairingPlayer[] = [
        makePlayer({ id: 'p1', seatNumber: 1, matchWins: 1, hasBye: false }),
        makePlayer({ id: 'p2', seatNumber: 2, matchWins: 0, hasBye: true }),  // already had bye
        makePlayer({ id: 'p3', seatNumber: 3, matchWins: 1, hasBye: false }),
      ]

      // p2 has 0 wins but already had a bye, so p1 or p3 (1 win, no bye) should get it
      const byeId = assignBye(players)
      assert.notStrictEqual(byeId, 'p2')
      assert.ok(byeId === 'p1' || byeId === 'p3')
    })

    it('skips dropped players', () => {
      const players: PairingPlayer[] = [
        makePlayer({ id: 'p1', seatNumber: 1, matchWins: 2, hasBye: false }),
        makePlayer({ id: 'p2', seatNumber: 2, matchWins: 0, hasBye: false, dropped: true }),
        makePlayer({ id: 'p3', seatNumber: 3, matchWins: 1, hasBye: false }),
      ]

      // p2 has lowest wins but is dropped, so p3 (next lowest) should get it
      const byeId = assignBye(players)
      assert.strictEqual(byeId, 'p3')
    })
  })
})
