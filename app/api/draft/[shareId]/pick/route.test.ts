/**
 * Tests for draft pick showcase tracking
 *
 * Bug: When a draft starts, all cards are tracked with the HOST's user_id.
 * Showcase leaders should be tracked with the PLAYER's user_id when they
 * actually draft the leader.
 *
 * Fix: Track showcase leaders at pick time, attributed to the picking player.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'

// Simulate the tracking logic
// This extracts the core logic for testing

interface Card {
  id: string
  name: string
  type?: string
  isLeader?: boolean
  isShowcase?: boolean
  variantType?: string
}

interface TrackingRecord {
  cardId: string
  cardName: string
  isShowcase?: boolean
  isLeader?: boolean
  userId: string
  sourceShareId?: string
  trackedAt: string
}

/**
 * BUGGY: Track at draft start with host's ID
 * All cards get the host's user_id regardless of who drafts them
 */
function trackAtDraftStartBuggy(allCards: Card[], hostUserId: string): TrackingRecord[] {
  return allCards.map(card => ({
    cardId: card.id,
    cardName: card.name,
    isShowcase: card.isShowcase,
    isLeader: card.isLeader,
    userId: hostUserId,  // BUG: Always the host!
    trackedAt: 'draft_start'
  }))
}

/**
 * FIXED: Track showcase leaders at pick time with picker's ID
 */
function trackShowcaseLeaderAtPick(
  pickedLeader: Card,
  pickerUserId: string,
  sourceShareId: string
): TrackingRecord | null {
  if (!pickedLeader.isShowcase || !pickedLeader.isLeader) {
    return null  // Only track showcase leaders
  }

  return {
    cardId: pickedLeader.id,
    cardName: pickedLeader.name,
    isShowcase: true,
    isLeader: true,
    userId: pickerUserId,  // FIXED: The player who picked it
    sourceShareId,
    trackedAt: 'pick_time'
  }
}

describe('Draft showcase leader tracking', () => {
  // Test data
  const hostUserId = 'host-user-123'
  const player1UserId = 'player1-user-456'
  const player2UserId = 'player2-user-789'

  const showcaseLeader: Card = {
    id: '1359',
    name: 'Director Krennic',
    type: 'Leader',
    isLeader: true,
    isShowcase: true,
    variantType: 'Showcase'
  }

  const normalLeader: Card = {
    id: '100',
    name: 'Luke Skywalker',
    type: 'Leader',
    isLeader: true,
    isShowcase: false,
    variantType: 'Normal'
  }

  describe('BUGGY: Track at draft start', () => {
    it('attributes ALL cards to host, even showcase leaders other players will draft', () => {
      // Host starts draft, all leaders for all players get tracked
      const allLeaders = [showcaseLeader, normalLeader]
      const trackingRecords = trackAtDraftStartBuggy(allLeaders, hostUserId)

      // The showcase leader is tracked...
      const showcaseRecord = trackingRecords.find(r => r.isShowcase)
      assert.ok(showcaseRecord, 'Showcase leader is tracked')

      // ...but with the HOST's user_id, not the player who will draft it!
      assert.strictEqual(
        showcaseRecord!.userId,
        hostUserId,
        'BUG: Showcase attributed to host, not the drafter'
      )
    })

    it('player who drafts showcase sees nothing in their collection', () => {
      // Simulate: Host starts draft, Player 1 drafts the showcase leader
      const trackingRecords = trackAtDraftStartBuggy([showcaseLeader], hostUserId)

      // Query: "Show me Player 1's showcase leaders"
      const player1Showcases = trackingRecords.filter(
        r => r.userId === player1UserId && r.isShowcase && r.isLeader
      )

      assert.strictEqual(
        player1Showcases.length,
        0,
        'BUG: Player 1 drafted the showcase but has 0 in their collection!'
      )
    })
  })

  describe('FIXED: Track at pick time', () => {
    it('attributes showcase leader to the player who drafts it', () => {
      // Player 1 picks the showcase leader
      const record = trackShowcaseLeaderAtPick(showcaseLeader, player1UserId, 'draft-123')

      assert.ok(record, 'Showcase leader is tracked')
      assert.strictEqual(
        record!.userId,
        player1UserId,
        'Showcase attributed to Player 1 who drafted it'
      )
    })

    it('does not track normal leaders (only showcases)', () => {
      // Player picks a normal leader - no tracking needed
      const record = trackShowcaseLeaderAtPick(normalLeader, player1UserId, 'draft-123')

      assert.strictEqual(record, null, 'Normal leaders are not tracked at pick time')
    })

    it('player who drafts showcase sees it in their collection', () => {
      // Player 1 drafts the showcase
      const record = trackShowcaseLeaderAtPick(showcaseLeader, player1UserId, 'draft-123')

      // Query: "Show me Player 1's showcase leaders"
      const player1Showcases = [record].filter(
        r => r && r.userId === player1UserId && r.isShowcase && r.isLeader
      )

      assert.strictEqual(
        player1Showcases.length,
        1,
        'Player 1 has 1 showcase leader in their collection'
      )
      assert.strictEqual(
        player1Showcases[0]!.cardName,
        'Director Krennic',
        'It is the leader they drafted'
      )
    })
  })

  describe('End-to-end scenario', () => {
    it('different players drafting showcases each get credit', () => {
      const showcaseLeader2: Card = {
        id: '2000',
        name: 'Darth Vader',
        type: 'Leader',
        isLeader: true,
        isShowcase: true,
        variantType: 'Showcase'
      }

      // Player 1 drafts Director Krennic
      const record1 = trackShowcaseLeaderAtPick(showcaseLeader, player1UserId, 'draft-123')
      // Player 2 drafts Darth Vader
      const record2 = trackShowcaseLeaderAtPick(showcaseLeader2, player2UserId, 'draft-123')

      const allRecords = [record1, record2].filter((r): r is TrackingRecord => r !== null)

      // Player 1's collection
      const player1Collection = allRecords.filter(r => r.userId === player1UserId)
      assert.strictEqual(player1Collection.length, 1)
      assert.strictEqual(player1Collection[0].cardName, 'Director Krennic')

      // Player 2's collection
      const player2Collection = allRecords.filter(r => r.userId === player2UserId)
      assert.strictEqual(player2Collection.length, 1)
      assert.strictEqual(player2Collection[0].cardName, 'Darth Vader')
    })
  })
})
