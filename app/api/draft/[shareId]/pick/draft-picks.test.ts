/**
 * Tests for draft_picks record construction
 *
 * Verifies that the correct parameters are built for INSERT INTO draft_picks
 * when leaders and cards are picked during a draft.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'

// === Types matching the actual code ===

interface Card {
  id: string
  name: string
  set: string
  rarity: string
  type: string
  variantType?: string
  isLeader?: boolean
  pickNumber?: number
  leaderRound?: number
  packNumber?: number
  pickInPack?: number
}

// === Extracted logic: build the parameter arrays for INSERT ===
// These mirror exactly what the pick route and draftAdvance.ts pass to the query

function buildLeaderPickParams(
  podId: string,
  userId: string,
  pickedLeader: Card,
  leaderRound: number
): unknown[] {
  return [
    podId, userId,
    pickedLeader.id, pickedLeader.name, pickedLeader.set, pickedLeader.rarity,
    pickedLeader.type, pickedLeader.variantType || 'Normal',
    leaderRound, pickedLeader.pickNumber, leaderRound
  ]
}

function buildCardPickParams(
  podId: string,
  userId: string,
  pickedCard: Card,
  packNumber: number,
  pickInPack: number
): unknown[] {
  return [
    podId, userId,
    pickedCard.id, pickedCard.name, pickedCard.set, pickedCard.rarity,
    pickedCard.type, pickedCard.variantType || 'Normal',
    packNumber, pickInPack, pickedCard.pickNumber
  ]
}

// === Backfill logic: compute metadata from array position ===

function computeBackfillLeaderParams(leader: Card, index: number) {
  const leaderRound = leader.leaderRound || (index + 1)
  const pickNumber = leader.pickNumber || (index + 1)
  return { leaderRound, pickNumber, packNumber: 0, pickInPack: leaderRound }
}

function computeBackfillCardParams(card: Card, index: number, leaderCount: number) {
  const packNumber = card.packNumber || (Math.floor(index / 14) + 1)
  const pickInPack = card.pickInPack || ((index % 14) + 1)
  const pickNumber = card.pickNumber || (leaderCount + index + 1)
  return { packNumber, pickInPack, pickNumber }
}

// === Tests ===

describe('draft_picks record construction', () => {
  const podId = 'pod-uuid-123'
  const userId = 'user-uuid-456'

  describe('Leader pick params', () => {
    it('builds correct params for a normal leader pick', () => {
      const leader: Card = {
        id: 'SOR-005',
        name: 'Luke Skywalker',
        set: 'SOR',
        rarity: 'Rare',
        type: 'Leader',
        variantType: 'Normal',
        pickNumber: 1,
        leaderRound: 1
      }

      const params = buildLeaderPickParams(podId, userId, leader, 1)

      assert.deepStrictEqual(params, [
        'pod-uuid-123', 'user-uuid-456',
        'SOR-005', 'Luke Skywalker', 'SOR', 'Rare',
        'Leader', 'Normal',
        1, 1, 1  // leaderRound, pickNumber, leaderRound
      ])
    })

    it('defaults variantType to Normal when undefined', () => {
      const leader: Card = {
        id: 'SOR-005',
        name: 'Luke Skywalker',
        set: 'SOR',
        rarity: 'Rare',
        type: 'Leader',
        pickNumber: 2,
        leaderRound: 2
      }

      const params = buildLeaderPickParams(podId, userId, leader, 2)
      assert.strictEqual(params[7], 'Normal', 'variantType defaults to Normal')
    })

    it('handles Showcase variant leader', () => {
      const leader: Card = {
        id: 'SOR-005',
        name: 'Luke Skywalker',
        set: 'SOR',
        rarity: 'Rare',
        type: 'Leader',
        variantType: 'Showcase',
        pickNumber: 1,
        leaderRound: 1
      }

      const params = buildLeaderPickParams(podId, userId, leader, 1)
      assert.strictEqual(params[7], 'Showcase')
    })
  })

  describe('Card pick params', () => {
    it('builds correct params for a card pick', () => {
      const card: Card = {
        id: 'TWI-042',
        name: 'Clone Trooper',
        set: 'TWI',
        rarity: 'Common',
        type: 'Unit',
        variantType: 'Normal',
        pickNumber: 4,
        packNumber: 1,
        pickInPack: 1
      }

      const params = buildCardPickParams(podId, userId, card, 1, 1)

      assert.deepStrictEqual(params, [
        'pod-uuid-123', 'user-uuid-456',
        'TWI-042', 'Clone Trooper', 'TWI', 'Common',
        'Unit', 'Normal',
        1, 1, 4  // packNumber, pickInPack, pickNumber
      ])
    })

    it('defaults variantType to Normal when undefined', () => {
      const card: Card = {
        id: 'TWI-042',
        name: 'Clone Trooper',
        set: 'TWI',
        rarity: 'Common',
        type: 'Unit',
        pickNumber: 5
      }

      const params = buildCardPickParams(podId, userId, card, 1, 2)
      assert.strictEqual(params[7], 'Normal')
    })

    it('handles Hyperspace variant', () => {
      const card: Card = {
        id: 'TWI-042',
        name: 'Clone Trooper',
        set: 'TWI',
        rarity: 'Common',
        type: 'Unit',
        variantType: 'Hyperspace',
        pickNumber: 6
      }

      const params = buildCardPickParams(podId, userId, card, 2, 3)
      assert.strictEqual(params[7], 'Hyperspace')
    })
  })

  describe('Backfill metadata computation', () => {
    it('uses existing metadata when available', () => {
      const leader: Card = {
        id: 'SOR-005', name: 'Luke', set: 'SOR', rarity: 'Rare', type: 'Leader',
        leaderRound: 2, pickNumber: 2
      }

      const result = computeBackfillLeaderParams(leader, 1)
      assert.strictEqual(result.leaderRound, 2, 'uses existing leaderRound')
      assert.strictEqual(result.pickNumber, 2, 'uses existing pickNumber')
    })

    it('computes leader metadata from array index when missing', () => {
      const leader: Card = {
        id: 'SOR-005', name: 'Luke', set: 'SOR', rarity: 'Rare', type: 'Leader'
      }

      // First leader (index 0) → round 1, pick 1
      const result0 = computeBackfillLeaderParams(leader, 0)
      assert.strictEqual(result0.leaderRound, 1)
      assert.strictEqual(result0.pickNumber, 1)
      assert.strictEqual(result0.packNumber, 0)
      assert.strictEqual(result0.pickInPack, 1)

      // Third leader (index 2) → round 3, pick 3
      const result2 = computeBackfillLeaderParams(leader, 2)
      assert.strictEqual(result2.leaderRound, 3)
      assert.strictEqual(result2.pickNumber, 3)
    })

    it('uses existing card metadata when available', () => {
      const card: Card = {
        id: 'TWI-042', name: 'Trooper', set: 'TWI', rarity: 'Common', type: 'Unit',
        packNumber: 2, pickInPack: 5, pickNumber: 22
      }

      const result = computeBackfillCardParams(card, 18, 3)
      assert.strictEqual(result.packNumber, 2, 'uses existing packNumber')
      assert.strictEqual(result.pickInPack, 5, 'uses existing pickInPack')
      assert.strictEqual(result.pickNumber, 22, 'uses existing pickNumber')
    })

    it('computes card metadata from array index when missing (14 cards/pack)', () => {
      const card: Card = {
        id: 'TWI-042', name: 'Trooper', set: 'TWI', rarity: 'Common', type: 'Unit'
      }

      // First card in first pack (index 0, 3 leaders)
      const result0 = computeBackfillCardParams(card, 0, 3)
      assert.strictEqual(result0.packNumber, 1, 'pack 1')
      assert.strictEqual(result0.pickInPack, 1, 'pick 1 in pack')
      assert.strictEqual(result0.pickNumber, 4, 'overall pick 4 (after 3 leaders)')

      // Last card in first pack (index 13)
      const result13 = computeBackfillCardParams(card, 13, 3)
      assert.strictEqual(result13.packNumber, 1, 'still pack 1')
      assert.strictEqual(result13.pickInPack, 14, 'pick 14 in pack')
      assert.strictEqual(result13.pickNumber, 17, 'overall pick 17')

      // First card in second pack (index 14)
      const result14 = computeBackfillCardParams(card, 14, 3)
      assert.strictEqual(result14.packNumber, 2, 'pack 2')
      assert.strictEqual(result14.pickInPack, 1, 'pick 1 in pack 2')
      assert.strictEqual(result14.pickNumber, 18, 'overall pick 18')

      // First card in third pack (index 28)
      const result28 = computeBackfillCardParams(card, 28, 3)
      assert.strictEqual(result28.packNumber, 3, 'pack 3')
      assert.strictEqual(result28.pickInPack, 1, 'pick 1 in pack 3')
      assert.strictEqual(result28.pickNumber, 32, 'overall pick 32')
    })
  })
})
