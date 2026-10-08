// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { reconstructDraftLog } from './draftLogReconstruction'

// Helper: create a card with instanceId
function card(id: string) {
  return { instanceId: id, name: `Card ${id}` }
}

// Helper: create a DraftedCard entry
function draftedCard(instanceId: string, packNumber: number, pickInPack: number, pickNumber: number) {
  return { instanceId, packNumber, pickInPack, pickNumber }
}

// Helper: create a DraftedLeader entry
function draftedLeader(instanceId: string, leaderRound: number) {
  return { instanceId, leaderRound }
}

describe('draftLogReconstruction', () => {
  describe('2-player draft card picks', () => {
    // 2 players, seat 1 and seat 2
    // Each player has 3 packs of 3 cards each (simplified)
    // Pack 1: pass left (seat 1 -> seat 2 is "left" in terms of decreasing seat number...
    //   but actually pass left = clockwise = decreasing seat, so seat 2 -> seat 1)
    //   Actually for 2 players it's the same - packs alternate between them every pick.

    it('pick 1 sees full pack (own pack), pick 2 sees pack minus one card', () => {
      // Player at seat 1 (idx 0) has pack with cards A,B,C
      // Player at seat 2 (idx 1) has pack with cards D,E,F
      // Pack 1 passes left.
      // Pick 1: seat 1 sees own pack [A,B,C], seat 2 sees own pack [D,E,F]
      // Pick 2: seat 1 sees seat 2's pack minus seat 2's pick, seat 2 sees seat 1's pack minus seat 1's pick

      const allPacks = [
        [{ cards: [card('A'), card('B'), card('C')] }], // seat 1's pack 1
        [{ cards: [card('D'), card('E'), card('F')] }], // seat 2's pack 1
      ]

      const players = [
        {
          seatNumber: 1,
          draftedCards: [
            draftedCard('A', 1, 1, 1), // pick 1 from own pack
            draftedCard('E', 1, 2, 2), // pick 2 from seat 2's pack (D removed by seat 2)
            draftedCard('B', 1, 3, 3), // pick 3 from own pack (A already taken by self)
          ],
          draftedLeaders: [],
        },
        {
          seatNumber: 2,
          draftedCards: [
            draftedCard('D', 1, 1, 1), // pick 1 from own pack
            draftedCard('B', 1, 2, 2), // pick 2 from seat 1's pack (A removed by seat 1)
            draftedCard('F', 1, 3, 3), // pick 3 from own pack (D already taken by self)
          ],
          draftedLeaders: [],
        },
      ]

      const result = reconstructDraftLog({
        targetSeat: 1,
        totalSeats: 2,
        allPacks,
        players,
      })

      // Filter to just pack 1 card picks
      const pack1Picks = result.filter(p => p.type === 'card' && p.packNumber === 1)

      // Pick 1: seat 1 sees own full pack [A, B, C]
      assert.strictEqual(pack1Picks[0].visibleCards.length, 3, 'Pick 1 should see 3 cards')
      assert.strictEqual(pack1Picks[0].pickedInstanceId, 'A')
      const pick1Ids = pack1Picks[0].visibleCards.map(c => c.instanceId).sort()
      assert.deepStrictEqual(pick1Ids, ['A', 'B', 'C'])

      // Pick 2: seat 1 sees seat 2's pack minus seat 2's pick (D removed)
      assert.strictEqual(pack1Picks[1].visibleCards.length, 2, 'Pick 2 should see 2 cards')
      assert.strictEqual(pack1Picks[1].pickedInstanceId, 'E')
      const pick2Ids = pack1Picks[1].visibleCards.map(c => c.instanceId).sort()
      assert.deepStrictEqual(pick2Ids, ['E', 'F'])

      // Pick 3: seat 1 sees own pack minus own pick from pick 1 (A removed) and seat 2's pick (B removed)
      assert.strictEqual(pack1Picks[2].visibleCards.length, 1, 'Pick 3 should see 1 card')
      assert.strictEqual(pack1Picks[2].pickedInstanceId, 'B')
    })

    it('preserves visible card order when the picked card is not first', () => {
      const allPacks = [
        [
          { cards: [card('A'), card('B'), card('C')] },
          { cards: [] },
          { cards: [] },
        ],
        [
          { cards: [card('D'), card('E'), card('F')] },
          { cards: [] },
          { cards: [] },
        ],
      ]

      const players = [
        {
          seatNumber: 1,
          draftedCards: [
            draftedCard('B', 1, 1, 1),
          ],
          draftedLeaders: [],
        },
        {
          seatNumber: 2,
          draftedCards: [
            draftedCard('D', 1, 1, 1),
          ],
          draftedLeaders: [],
        },
      ]

      const result = reconstructDraftLog({
        targetSeat: 1,
        totalSeats: 2,
        allPacks,
        players,
      })
      const firstPick = result.find(p => p.type === 'card' && p.packNumber === 1 && p.pickInPack === 1)

      assert.ok(firstPick)
      assert.deepStrictEqual(firstPick.visibleCards.map(c => c.instanceId), ['A', 'B', 'C'])
      assert.strictEqual(firstPick.pickedInstanceId, 'B')
    })
  })

  describe('4-player pass-right (pack 2)', () => {
    it('verifies source pack and removal chain for pack 2', () => {
      // 4 players, pack 2 passes right (increasing seat numbers)
      // Seat 1 (idx 0): pack [A1..A3]
      // Seat 2 (idx 1): pack [B1..B3]
      // Seat 3 (idx 2): pack [C1..C3]
      // Seat 4 (idx 3): pack [D1..D3]
      //
      // Pass right: pack stays with owner at pick 1, then moves to seat+1
      // Pick 1: each sees own pack
      // Pick 2: seat 1 sees seat 4's pack (4's pack passed right to seat 1... wait)
      //
      // Pass right = increasing seat. So seat 1's pack goes to seat 2, then seat 3, etc.
      // At pick K, seat S sees the pack that started at sourceIdx = (S - (K-1) + N) % N
      // Pick 1: source = S (own pack)
      // Pick 2 for seat 1: source = (0 - 1 + 4) % 4 = 3 = seat 4's pack

      const allPacks = [
        [
          { cards: [] }, // pack 1 (not testing)
          { cards: [card('A1'), card('A2'), card('A3')] }, // pack 2
          { cards: [] }, // pack 3
        ],
        [
          { cards: [] },
          { cards: [card('B1'), card('B2'), card('B3')] },
          { cards: [] },
        ],
        [
          { cards: [] },
          { cards: [card('C1'), card('C2'), card('C3')] },
          { cards: [] },
        ],
        [
          { cards: [] },
          { cards: [card('D1'), card('D2'), card('D3')] },
          { cards: [] },
        ],
      ]

      const players = [
        {
          seatNumber: 1,
          draftedCards: [
            draftedCard('A1', 2, 1, 1),  // pick 1: own pack
            draftedCard('D2', 2, 2, 2),  // pick 2: seat 4's pack minus seat 4's pick
            draftedCard('C3', 2, 3, 3),  // pick 3: seat 3's pack
          ],
          draftedLeaders: [],
        },
        {
          seatNumber: 2,
          draftedCards: [
            draftedCard('B1', 2, 1, 1),
            draftedCard('A2', 2, 2, 2),
            draftedCard('D3', 2, 3, 3),
          ],
          draftedLeaders: [],
        },
        {
          seatNumber: 3,
          draftedCards: [
            draftedCard('C1', 2, 1, 1),
            draftedCard('B2', 2, 2, 2),
            draftedCard('A3', 2, 3, 3),
          ],
          draftedLeaders: [],
        },
        {
          seatNumber: 4,
          draftedCards: [
            draftedCard('D1', 2, 1, 1),
            draftedCard('C2', 2, 2, 2),
            draftedCard('B3', 2, 3, 3),
          ],
          draftedLeaders: [],
        },
      ]

      const result = reconstructDraftLog({
        targetSeat: 1,
        totalSeats: 4,
        allPacks,
        players,
      })

      // Filter pack 2 picks for seat 1
      const pack2Picks = result.filter(p => p.type === 'card' && p.packNumber === 2)

      // Pick 1: seat 1 sees own pack [A1, A2, A3]
      assert.strictEqual(pack2Picks[0].visibleCards.length, 3)
      assert.strictEqual(pack2Picks[0].pickedInstanceId, 'A1')

      // Pick 2: source = seat 4's pack. Seat 4 picked D1 at pick 1.
      // So seat 1 sees [D2, D3]
      assert.strictEqual(pack2Picks[1].visibleCards.length, 2)
      assert.strictEqual(pack2Picks[1].pickedInstanceId, 'D2')
      const pick2Ids = pack2Picks[1].visibleCards.map(c => c.instanceId).sort()
      assert.deepStrictEqual(pick2Ids, ['D2', 'D3'])

      // Pick 3: source = seat 3's pack. Seat 3 picked C1, seat 4 picked C2.
      // So seat 1 sees [C3]
      assert.strictEqual(pack2Picks[2].visibleCards.length, 1)
      assert.strictEqual(pack2Picks[2].pickedInstanceId, 'C3')
    })
  })

  describe('leader reconstruction', () => {
    it('reconstructs leader round 2 with correct source and prior removal', () => {
      // 3 players, leaders pass right
      // Seat 1 original leaders: [L1a, L1b, L1c]
      // Seat 2 original leaders: [L2a, L2b, L2c]
      // Seat 3 original leaders: [L3a, L3b, L3c]
      //
      // Round 1: each player picks from own pack (source = self)
      // Round 2: source = (idx - 1 + 3) % 3
      //   Seat 1 (idx 0): source = (0 - 1 + 3) % 3 = 2 (seat 3's pack)
      //   Seat 2 (idx 1): source = (1 - 1 + 3) % 3 = 0 (seat 1's pack)
      //   Seat 3 (idx 2): source = (2 - 1 + 3) % 3 = 1 (seat 2's pack)
      // Round 3: source = (idx - 2 + 3) % 3
      //   Seat 1: source = (0 - 2 + 3) % 3 = 1 (seat 2's pack)
      //   Seat 2: source = (1 - 2 + 3) % 3 = 2 (seat 3's pack)
      //   Seat 3: source = (2 - 2 + 3) % 3 = 0 (seat 1's pack)

      const allPacks = [
        [{ cards: [] }], // card packs not tested here
        [{ cards: [] }],
        [{ cards: [] }],
      ]

      const players = [
        {
          seatNumber: 1,
          draftedCards: [],
          draftedLeaders: [
            { ...card('L1a'), ...draftedLeader('L1a', 1) },  // round 1: own pack
            { ...card('L3b'), ...draftedLeader('L3b', 2) },  // round 2: seat 3's pack
            { ...card('L2c'), ...draftedLeader('L2c', 3) },  // round 3: seat 2's pack
          ],
        },
        {
          seatNumber: 2,
          draftedCards: [],
          draftedLeaders: [
            { ...card('L2a'), ...draftedLeader('L2a', 1) },
            { ...card('L1b'), ...draftedLeader('L1b', 2) },
            { ...card('L3c'), ...draftedLeader('L3c', 3) },
          ],
        },
        {
          seatNumber: 3,
          draftedCards: [],
          draftedLeaders: [
            { ...card('L3a'), ...draftedLeader('L3a', 1) },
            { ...card('L2b'), ...draftedLeader('L2b', 2) },
            { ...card('L1c'), ...draftedLeader('L1c', 3) },
          ],
        },
      ]

      const result = reconstructDraftLog({
        targetSeat: 1,
        totalSeats: 3,
        allPacks,
        players,
      })

      const leaderPicks = result.filter(p => p.type === 'leader')

      // Round 1: seat 1 sees own leaders [L1a, L1b, L1c]
      assert.strictEqual(leaderPicks[0].visibleCards.length, 3)
      assert.strictEqual(leaderPicks[0].pickedInstanceId, 'L1a')

      // Round 2: seat 1 sees seat 3's pack minus seat 3's round 1 pick (L3a removed)
      // Seat 3's original pack = [L3a, L3b, L3c]. Seat 3 picked L3a at round 1.
      // So visible = [L3b, L3c]
      assert.strictEqual(leaderPicks[1].visibleCards.length, 2)
      assert.strictEqual(leaderPicks[1].pickedInstanceId, 'L3b')
      const round2Ids = leaderPicks[1].visibleCards.map(c => c.instanceId).sort()
      assert.deepStrictEqual(round2Ids, ['L3b', 'L3c'])

      // Round 3: seat 1 sees seat 2's pack minus 2 prior picks
      // Seat 2's pack = [L2a, L2b, L2c]
      // Round 1 picker for seat 2's pack: (2 + 0) % 3 = 2 = seat 3... wait
      // Actually round 1 picker: (sourceIdx + (j-1)) % N = (1 + 0) % 3 = 1 = seat 2 picked L2a
      // Round 2 picker: (1 + 1) % 3 = 2 = seat 3 picked L2b
      // Remaining: [L2c]
      assert.strictEqual(leaderPicks[2].visibleCards.length, 1)
      assert.strictEqual(leaderPicks[2].pickedInstanceId, 'L2c')
    })
  })

  describe('seat wrapping', () => {
    it('wraps correctly at boundaries for pack 1 (pass left)', () => {
      // 4 players. Pack 1 passes left.
      // Seat 1 at pick 2: source = (0 + 1) % 4 = 1 = seat 2's pack
      // Seat 4 at pick 2: source = (3 + 1) % 4 = 0 = seat 1's pack (wraps!)

      const allPacks = [
        [{ cards: [card('A1'), card('A2')] }, { cards: [] }, { cards: [] }],
        [{ cards: [card('B1'), card('B2')] }, { cards: [] }, { cards: [] }],
        [{ cards: [card('C1'), card('C2')] }, { cards: [] }, { cards: [] }],
        [{ cards: [card('D1'), card('D2')] }, { cards: [] }, { cards: [] }],
      ]

      const players = [
        {
          seatNumber: 1,
          draftedCards: [
            draftedCard('A1', 1, 1, 1),
            draftedCard('B2', 1, 2, 2),
          ],
          draftedLeaders: [],
        },
        {
          seatNumber: 2,
          draftedCards: [
            draftedCard('B1', 1, 1, 1),
            draftedCard('C2', 1, 2, 2),
          ],
          draftedLeaders: [],
        },
        {
          seatNumber: 3,
          draftedCards: [
            draftedCard('C1', 1, 1, 1),
            draftedCard('D2', 1, 2, 2),
          ],
          draftedLeaders: [],
        },
        {
          seatNumber: 4,
          draftedCards: [
            draftedCard('D1', 1, 1, 1),
            draftedCard('A2', 1, 2, 2),  // seat 4 pick 2 from seat 1's pack (wraps!)
          ],
          draftedLeaders: [],
        },
      ]

      // Test seat 4's pick 2
      const result = reconstructDraftLog({
        targetSeat: 4,
        totalSeats: 4,
        allPacks,
        players,
      })

      const pack1Picks = result.filter(p => p.type === 'card' && p.packNumber === 1)

      // Pick 2 for seat 4: source = (3 + 1) % 4 = 0 = seat 1's pack
      // Seat 1 picked A1 at pick 1, so seat 4 sees [A2]
      assert.strictEqual(pack1Picks[1].visibleCards.length, 1)
      assert.strictEqual(pack1Picks[1].pickedInstanceId, 'A2')
      assert.strictEqual(pack1Picks[1].visibleCards[0].instanceId, 'A2')
    })
  })

  describe('full reconstruction order', () => {
    it('returns leaders first, then packs 1-3 in order', () => {
      const allPacks = [
        [
          { cards: [card('P1')] },
          { cards: [card('P2')] },
          { cards: [card('P3')] },
        ],
        [
          { cards: [card('Q1')] },
          { cards: [card('Q2')] },
          { cards: [card('Q3')] },
        ],
      ]

      const players = [
        {
          seatNumber: 1,
          draftedCards: [
            draftedCard('P1', 1, 1, 1),
            draftedCard('P2', 2, 1, 2),
            draftedCard('P3', 3, 1, 3),
          ],
          draftedLeaders: [
            { ...card('L1'), ...draftedLeader('L1', 1) },
            { ...card('L2'), ...draftedLeader('L2', 2) },
          ],
        },
        {
          seatNumber: 2,
          draftedCards: [
            draftedCard('Q1', 1, 1, 1),
            draftedCard('Q2', 2, 1, 2),
            draftedCard('Q3', 3, 1, 3),
          ],
          draftedLeaders: [
            { ...card('L3'), ...draftedLeader('L3', 1) },
            { ...card('L4'), ...draftedLeader('L4', 2) },
          ],
        },
      ]

      const result = reconstructDraftLog({
        targetSeat: 1,
        totalSeats: 2,
        allPacks,
        players,
      })

      // First 2 picks should be leaders
      assert.strictEqual(result[0].type, 'leader')
      assert.strictEqual(result[1].type, 'leader')

      // Then card picks
      const cardPicks = result.filter(p => p.type === 'card')
      assert.strictEqual(cardPicks[0].packNumber, 1)
      assert.strictEqual(cardPicks[1].packNumber, 2)
      assert.strictEqual(cardPicks[2].packNumber, 3)
    })
  })
})
