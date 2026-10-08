/**
 * Tests for leader pack visibility during draft
 *
 * Leader packs are visible to all players during leader draft phase.
 * This mirrors a physical table where you can see what leaders others are looking at.
 * Outside leader draft phase, leader packs are null.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'

interface Leader {
  name: string
  aspects: string[]
  imageUrl: string
  backImageUrl: string
}

interface PlayerData {
  user_id: string
  leaders: Leader[]
  drafted_leaders: Leader[]
}

/**
 * Leader pack visibility: show to all players during leader draft phase
 */
function formatPlayerLeaderPack(
  player: PlayerData,
  isLeaderDraftPhase: boolean,
): Leader[] | null {
  if (!isLeaderDraftPhase) return null
  return player.leaders.map(l => ({
    name: l.name,
    aspects: l.aspects || [],
    imageUrl: l.imageUrl,
    backImageUrl: l.backImageUrl,
  }))
}

const mockLeaders: Leader[] = [
  { name: 'Darth Vader', aspects: ['Villainy', 'Aggression'], imageUrl: '/vader.png', backImageUrl: '/vader-back.png' },
  { name: 'Luke Skywalker', aspects: ['Heroism', 'Vigilance'], imageUrl: '/luke.png', backImageUrl: '/luke-back.png' },
  { name: 'Boba Fett', aspects: ['Cunning', 'Villainy'], imageUrl: '/boba.png', backImageUrl: '/boba-back.png' },
]

const player1: PlayerData = { user_id: 'user-1', leaders: mockLeaders, drafted_leaders: [] }
const player2: PlayerData = { user_id: 'user-2', leaders: mockLeaders, drafted_leaders: [] }

describe('Leader pack visibility in draft state', () => {
  describe('during leader draft phase', () => {
    it('shows own leader pack', () => {
      const result = formatPlayerLeaderPack(player1, true)
      assert.notStrictEqual(result, null, 'Own leader pack should be visible')
      assert.strictEqual(result!.length, 3)
      assert.strictEqual(result![0].name, 'Darth Vader')
    })

    it('shows other players leader packs (visible at the table)', () => {
      const result = formatPlayerLeaderPack(player2, true)
      assert.notStrictEqual(result, null, 'Other players leader packs should be visible during leader draft')
      assert.strictEqual(result!.length, 3)
    })
  })

  describe('outside leader draft phase', () => {
    it('returns null during pack draft', () => {
      const result = formatPlayerLeaderPack(player1, false)
      assert.strictEqual(result, null, 'No leader pack outside leader draft phase')
    })
  })
})
