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

    // Helper: every prior matchup encoded in the players' opponent histories.
    function priorMatchups(players: PairingPlayer[]): Set<string> {
      const set = new Set<string>()
      for (const p of players) {
        for (const oppId of p.opponents) {
          set.add([p.id, oppId].sort().join(':'))
        }
      }
      return set
    }

    function assertNoRematches(players: PairingPlayer[], runs = 50): void {
      const played = priorMatchups(players)
      for (let run = 0; run < runs; run++) {
        const pairings = pairSwiss(players)
        for (const pairing of pairings) {
          if (pairing.isBye || pairing.player2Id == null) continue
          const key = [pairing.player1Id, pairing.player2Id].sort().join(':')
          assert.ok(
            !played.has(key),
            `Rematch produced: ${pairing.player1Id} vs ${pairing.player2Id} (run ${run})`
          )
        }
      }
    }

    it('pairs DOWN across score groups to avoid a forced rematch (6 players)', () => {
      // Standings after 2 rounds:
      //   {c,d} @ 2 wins   {a,b} @ 1 win   {e,f} @ 0 wins
      // a and b are the ONLY 1-win players and they already played each other.
      // Naive "pair within the score group" rematches a vs b. Correct Swiss
      // pairs a and b DOWN into the 0-win group (a-e, b-f) and keeps c-d.
      // Prior matchups: a-c, a-b, b-e, c-f, d-f, d-e.
      const players: PairingPlayer[] = [
        makePlayer({ id: 'a', seatNumber: 1, matchWins: 1, opponents: ['c', 'b'] }),
        makePlayer({ id: 'b', seatNumber: 2, matchWins: 1, opponents: ['e', 'a'] }),
        makePlayer({ id: 'c', seatNumber: 3, matchWins: 2, opponents: ['a', 'f'] }),
        makePlayer({ id: 'd', seatNumber: 4, matchWins: 2, opponents: ['f', 'e'] }),
        makePlayer({ id: 'e', seatNumber: 5, matchWins: 0, opponents: ['b', 'd'] }),
        makePlayer({ id: 'f', seatNumber: 6, matchWins: 0, opponents: ['d', 'c'] }),
      ]

      // A rematch-free pairing exists (e.g. a-e, b-f, c-d), so none may repeat.
      assertNoRematches(players)

      // Every player must be paired exactly once (no bye with an even count).
      const pairings = pairSwiss(players)
      assert.strictEqual(pairings.length, 3)
      const seen = pairings.flatMap(p => [p.player1Id, p.player2Id])
      assert.deepStrictEqual([...seen].sort(), ['a', 'b', 'c', 'd', 'e', 'f'])
    })

    it('avoids rematches when the natural standings pairing would repeat (8 players)', () => {
      // 8 players, 2 rounds played. p0 has already played p1, but the greedy
      // float-down strands p0 into a p0-p1 rematch even though a rematch-free
      // pairing exists. Prior matchups encoded in each player's opponents.
      const players: PairingPlayer[] = [
        makePlayer({ id: 'p0', seatNumber: 1, matchWins: 0, opponents: ['p2', 'p1'] }),
        makePlayer({ id: 'p1', seatNumber: 2, matchWins: 1, opponents: ['p4', 'p0'] }),
        makePlayer({ id: 'p2', seatNumber: 3, matchWins: 1, opponents: ['p0', 'p6'] }),
        makePlayer({ id: 'p3', seatNumber: 4, matchWins: 1, opponents: ['p7', 'p4'] }),
        makePlayer({ id: 'p4', seatNumber: 5, matchWins: 2, opponents: ['p1', 'p3'] }),
        makePlayer({ id: 'p5', seatNumber: 6, matchWins: 1, opponents: ['p6', 'p7'] }),
        makePlayer({ id: 'p6', seatNumber: 7, matchWins: 1, opponents: ['p5', 'p2'] }),
        makePlayer({ id: 'p7', seatNumber: 8, matchWins: 1, opponents: ['p3', 'p5'] }),
      ]

      assertNoRematches(players)

      const pairings = pairSwiss(players)
      assert.strictEqual(pairings.length, 4)
    })

    it('4-player pod across 3 rounds never repeats a matchup', () => {
      // Round 3 of a 4-player pod: rounds 1 and 2 already paired
      //   r1: a-c, b-d   r2: a-b, c-d
      // The only remaining unplayed pairs are a-d and b-c, so round 3 must be
      // a-d / b-c. Standings (a 2-0, b/c 1-1, d 0-2) would naively rematch the
      // top player a against a previous opponent.
      const players: PairingPlayer[] = [
        makePlayer({ id: 'a', seatNumber: 1, matchWins: 2, opponents: ['c', 'b'] }),
        makePlayer({ id: 'b', seatNumber: 2, matchWins: 1, opponents: ['d', 'a'] }),
        makePlayer({ id: 'c', seatNumber: 3, matchWins: 1, opponents: ['a', 'd'] }),
        makePlayer({ id: 'd', seatNumber: 4, matchWins: 0, opponents: ['b', 'c'] }),
      ]

      assertNoRematches(players)

      // The forced pairing is a-d and b-c.
      const pairings = pairSwiss(players)
      const keys = pairings.map(p => [p.player1Id, p.player2Id].sort().join(':')).sort()
      assert.deepStrictEqual(keys, ['a:d', 'b:c'])
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

describe('pairing — bye × drop invariants', () => {
  const make = (id: string, seat: number, extra: Partial<PairingPlayer> = {}): PairingPlayer => ({
    id,
    seatNumber: seat,
    matchWins: 0,
    matchLosses: 0,
    hasBye: false,
    dropped: false,
    opponents: [],
    ...extra,
  })

  it('SPEC: even active count produces zero byes', () => {
    const players = [1, 2, 3, 4].map(n => make(`p${n}`, n))
    const pairings = pairSwiss(players)
    assert.equal(pairings.filter(p => p.isBye).length, 0)
    assert.equal(pairings.length, 2)
  })

  it('SPEC: odd active count produces exactly one bye', () => {
    const players = [1, 2, 3, 4, 5].map(n => make(`p${n}`, n))
    const pairings = pairSwiss(players)
    assert.equal(pairings.filter(p => p.isBye).length, 1)
    // 5 active → 1 bye + 2 real matches; everyone appears exactly once.
    const everyId = pairings.flatMap(p => [p.player1Id, p.player2Id]).filter(Boolean)
    assert.equal(new Set(everyId).size, 5)
  })

  it('SPEC: a drop that turns an even field odd yields exactly one bye for the next round', () => {
    // 6 seated, one dropped → 5 active → odd → one bye.
    const players = [1, 2, 3, 4, 5, 6].map(n => make(`p${n}`, n))
    players[2]!.dropped = true
    const pairings = pairSwiss(players)
    assert.equal(pairings.filter(p => p.isBye).length, 1)
    const allIds = pairings.flatMap(p => [p.player1Id, p.player2Id]).filter(Boolean)
    assert.ok(!allIds.includes('p3'), 'dropped p3 must not be paired or given a bye')
  })

  it('SPEC: two drops keeping the field even yields no bye', () => {
    // 6 seated, two dropped → 4 active → even → no bye.
    const players = [1, 2, 3, 4, 5, 6].map(n => make(`p${n}`, n))
    players[1]!.dropped = true
    players[4]!.dropped = true
    const pairings = pairSwiss(players)
    assert.equal(pairings.filter(p => p.isBye).length, 0)
    assert.equal(pairings.length, 2)
    const allIds = pairings.flatMap(p => [p.player1Id, p.player2Id]).filter(Boolean)
    assert.ok(!allIds.includes('p2') && !allIds.includes('p5'), 'dropped players excluded')
  })

  it('SPEC: assignBye never returns a dropped player even when every eligible player already had a bye', () => {
    // All non-dropped players already had a bye → fallback path; the dropped
    // player has the fewest wins but must still never receive the bye.
    const players = [
      make('p1', 1, { matchWins: 2, hasBye: true }),
      make('p2', 2, { matchWins: 1, hasBye: true }),
      make('p3', 3, { matchWins: 0, dropped: true }),
    ]
    const byeId = assignBye(players)
    assert.notEqual(byeId, 'p3')
    assert.ok(byeId === 'p1' || byeId === 'p2')
  })

  describe('rematch avoidance (4+ players)', () => {
    it('SPEC: avoids an AVOIDABLE rematch via cross-group pairing (closed win-group)', () => {
      // a & b are 2-0 and already played each other; c & d are 1-1 and already
      // played each other. The win-group greedy pass is forced into a-b AND c-d
      // (both rematches), but a-c + b-d is rematch-free. pairSwiss is randomized,
      // so loop hard to defeat luck.
      for (let iter = 0; iter < 300; iter++) {
        const players = [
          makePlayer({ id: 'a', seatNumber: 1, matchWins: 2, opponents: ['b'] }),
          makePlayer({ id: 'b', seatNumber: 2, matchWins: 2, opponents: ['a'] }),
          makePlayer({ id: 'c', seatNumber: 3, matchWins: 1, opponents: ['d'] }),
          makePlayer({ id: 'd', seatNumber: 4, matchWins: 1, opponents: ['c'] }),
        ]
        const pairings = pairSwiss(players)
        assert.strictEqual(pairings.length, 2, `iter ${iter}: two matches, no bye`)
        const byId = Object.fromEntries(players.map(p => [p.id, p]))
        for (const pr of pairings) {
          assert.ok(!pr.isBye && pr.player2Id, `iter ${iter}: no bye expected`)
          const isRematch = byId[pr.player1Id].opponents.includes(pr.player2Id)
          assert.ok(!isRematch, `iter ${iter}: ${pr.player1Id} vs ${pr.player2Id} is an avoidable rematch`)
        }
      }
    })

    it('SPEC: an UNAVOIDABLE rematch still produces a pairing (no crash, no spurious bye)', () => {
      // Only two active players who already played: they MUST be paired again.
      for (let iter = 0; iter < 50; iter++) {
        const players = [
          makePlayer({ id: 'a', seatNumber: 1, matchWins: 1, opponents: ['b'] }),
          makePlayer({ id: 'b', seatNumber: 2, matchWins: 0, opponents: ['a'] }),
        ]
        const pairings = pairSwiss(players)
        assert.strictEqual(pairings.length, 1, `iter ${iter}: exactly one match`)
        assert.strictEqual(pairings[0].isBye, false, `iter ${iter}: not a bye`)
        const ids = [pairings[0].player1Id, pairings[0].player2Id].sort()
        assert.deepStrictEqual(ids, ['a', 'b'], `iter ${iter}: a vs b`)
      }
    })

    it('SPEC: a clean 8-player round with no prior matches yields four matches and no byes', () => {
      for (let iter = 0; iter < 100; iter++) {
        const players = [1, 2, 3, 4, 5, 6, 7, 8].map(n =>
          makePlayer({ id: `p${n}`, seatNumber: n, matchWins: n <= 4 ? 1 : 0 })
        )
        const pairings = pairSwiss(players)
        assert.strictEqual(pairings.length, 4, `iter ${iter}: four matches`)
        assert.ok(pairings.every(p => !p.isBye), `iter ${iter}: no byes for even count`)
      }
    })
  })
})
