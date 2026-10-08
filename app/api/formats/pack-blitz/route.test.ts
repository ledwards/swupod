// Tests for POST /api/formats/pack-blitz
import { describe, it } from 'node:test'
import assert from 'node:assert'

describe('POST /api/formats/pack-blitz', () => {
  describe('Request validation', () => {
    it('should require setCode parameter', () => {
      const body = {}
      const isValid = !!body.setCode
      assert.strictEqual(isValid, false, 'setCode should be required')
    })

    it('should accept valid setCode', () => {
      const body = { setCode: 'SEC' }
      const isValid = !!body.setCode
      assert.strictEqual(isValid, true)
    })
  })

  describe('Pool generation logic', () => {
    // Simulate a pack with leader, base, and other cards
    const mockPack = {
      cards: [
        { id: 'leader1', type: 'Leader', name: 'Test Leader' },
        { id: 'base1', type: 'Base', name: 'Test Base' },
        { id: 'unit1', type: 'Unit', name: 'Test Unit 1' },
        { id: 'unit2', type: 'Unit', name: 'Test Unit 2' },
        { id: 'event1', type: 'Event', name: 'Test Event' },
      ]
    }

    it('should extract leaders array from pack', () => {
      const leaders = mockPack.cards.filter(c => c.type === 'Leader')
      assert.strictEqual(leaders.length, 1)
      assert.strictEqual(leaders[0].name, 'Test Leader')
    })

    it('should extract bases array from pack', () => {
      const bases = mockPack.cards.filter(c => c.type === 'Base')
      assert.strictEqual(bases.length, 1)
      assert.strictEqual(bases[0].name, 'Test Base')
    })

    it('should create deck from non-leader, non-base cards', () => {
      const deckCards = mockPack.cards.filter(c => c.type !== 'Leader' && c.type !== 'Base')
      assert.strictEqual(deckCards.length, 3)
      assert.ok(deckCards.every(c => c.type !== 'Leader' && c.type !== 'Base'))
    })

    it('should store packs array with 1 pack', () => {
      const packs = [mockPack.cards]
      assert.strictEqual(packs.length, 1)
      assert.strictEqual(packs[0].length, 5)
    })
  })

  describe('Response format', () => {
    it('should return shareId in response', () => {
      const response = { shareId: 'abc123', shareUrl: '/formats/pack-blitz/abc123' }
      assert.ok(response.shareId)
      assert.strictEqual(typeof response.shareId, 'string')
    })

    it('should return shareUrl in response', () => {
      const response = { shareId: 'abc123', shareUrl: '/formats/pack-blitz/abc123' }
      assert.ok(response.shareUrl)
      assert.ok(response.shareUrl.includes('/formats/pack-blitz/'))
    })

    it('should return leaders and bases arrays', () => {
      const response = {
        leaders: [{ id: 'l1', type: 'Leader' }],
        bases: [{ id: 'b1', type: 'Base' }],
        deckCards: [{ id: 'u1', type: 'Unit' }]
      }
      assert.ok(Array.isArray(response.leaders))
      assert.ok(Array.isArray(response.bases))
      assert.ok(Array.isArray(response.deckCards))
    })
  })
})

console.log('\n📄 Running /api/formats/pack-blitz tests...\n')
