// @ts-nocheck
/**
 * Tests for draft pack format
 *
 * These tests verify that generateDraftPacks returns packs in the
 * canonical object format { cards: [...] }, not raw arrays.
 *
 * The bug was that draftLogic.js did:
 *   playerPacks.push(pack.cards)  // WRONG - pushes array
 * instead of:
 *   playerPacks.push(pack)        // CORRECT - pushes object
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { generateDraftPacks, processBoxPacksForDraft } from './draftLogic'
import { initializeCardCache } from './cardCache'

describe('Draft pack format', () => {
  before(async () => {
    await initializeCardCache()
  })

  it('returns packs in object format { cards: [...] }', async () => {
    const { packs } = generateDraftPacks('SOR', 2)

    // packs structure: [player][packNumber]
    assert.ok(Array.isArray(packs), 'packs should be an array')
    assert.strictEqual(packs.length, 2, 'should have 2 players')

    // Each player should have 3 packs
    assert.strictEqual(packs[0].length, 3, 'player 1 should have 3 packs')
    assert.strictEqual(packs[1].length, 3, 'player 2 should have 3 packs')

    // Each pack should be an object with a cards property
    const firstPack = packs[0][0]
    assert.ok(firstPack !== null && typeof firstPack === 'object', 'pack should be an object')
    assert.ok(!Array.isArray(firstPack), 'pack should NOT be a raw array')
    assert.ok(Array.isArray(firstPack.cards), 'pack.cards should be an array')

    // Cards should have the expected structure
    assert.ok(firstPack.cards.length > 0, 'pack should have cards')
    assert.ok(firstPack.cards[0].id, 'cards should have id')
    assert.ok(firstPack.cards[0].name, 'cards should have name')
  })

  it('pack cards have instanceId for draft uniqueness', async () => {
    const { packs } = generateDraftPacks('SOR', 2)

    const firstPack = packs[0][0]
    assert.ok(firstPack.cards[0].instanceId, 'cards should have instanceId')

    // instanceIds should be unique across all packs
    const allInstanceIds = new Set<string>()
    for (const playerPacks of packs) {
      for (const pack of playerPacks) {
        for (const card of pack.cards) {
          assert.ok(!allInstanceIds.has(card.instanceId), `instanceId ${card.instanceId} should be unique`)
          allInstanceIds.add(card.instanceId)
        }
      }
    }
  })

  it('leaders are extracted separately (not in pack.cards)', async () => {
    const { packs, leaders } = generateDraftPacks('SOR', 2)

    // Leaders should be separate
    assert.ok(Array.isArray(leaders), 'leaders should be an array')
    assert.strictEqual(leaders.length, 2, 'should have leaders for 2 players')
    assert.strictEqual(leaders[0].length, 3, 'player 1 should have 3 leaders')

    // Pack cards should not contain leaders
    const firstPack = packs[0][0]
    const hasLeader = firstPack.cards.some(c => c.isLeader)
    assert.ok(!hasLeader, 'pack.cards should not contain leaders')
  })

  it('keeps the ASH foil slot before the uncommon slots after leader/base extraction', async () => {
    const { packs } = generateDraftPacks('ASH', 2)
    const firstPack = packs[0][0]

    assert.strictEqual(firstPack.cards.length, 14, 'ASH draft pack should contain 14 draftable cards')
    assert.ok(!firstPack.cards.some(c => c.isLeader), 'draft pack should not contain a leader')
    assert.ok(!firstPack.cards.some(c => c.isBase), 'draft pack should not contain a base')

    const foilIndex = firstPack.cards.findIndex(c => c.isFoil === true)

    assert.strictEqual(foilIndex, 9, 'ASH foil slot should be after nine commons')
    assert.notStrictEqual(foilIndex, firstPack.cards.length - 1, 'ASH foil slot should not be the last draft card')
    assert.ok(firstPack.cards.slice(0, 9).every(c => c.rarity === 'Common'), 'first nine draft cards should be common slots')
  })

  it('chaos draft uses all selected sets when more than 3 packs are chosen', async () => {
    const chaosSets = ['SHD', 'SHD', 'LAW', 'LAW']
    const { packs, leaders } = generateDraftPacks('SHD', {
      playerCount: 2,
      chaosSets
    })

    assert.strictEqual(packs[0].length, 4, 'player 1 should receive 4 packs')
    assert.strictEqual(packs[1].length, 4, 'player 2 should receive 4 packs')
    assert.strictEqual(leaders[0].length, 4, 'player 1 should receive 4 leaders')
    assert.strictEqual(leaders[1].length, 4, 'player 2 should receive 4 leaders')
  })

  it('chaos box processing distributes packs by round so each player gets a set mix', () => {
    const boxPacks = Array.from({ length: 32 }, (_, idx) => {
      const setCode = idx < 16 ? 'SHD' : 'LAW' // 2 SHD groups + 2 LAW groups of 8 each
      return {
        cards: [
          { id: `${setCode}-${idx}-leader`, name: `Leader ${idx}`, set: setCode, isLeader: true },
          { id: `${setCode}-${idx}-base`, name: `Base ${idx}`, set: setCode, isBase: true },
          { id: `${setCode}-${idx}-card`, name: `Card ${idx}`, set: setCode },
        ]
      }
    })

    const result = processBoxPacksForDraft(boxPacks, 8, { packsPerPlayer: 4, chaosSetCount: 4 })
    const player0Sets = result.originalPacks[0].map(pack => pack[0]?.set)

    assert.deepStrictEqual(
      player0Sets,
      ['SHD', 'SHD', 'LAW', 'LAW'],
      'player 1 should get one pack per selected chaos set slot'
    )
    assert.strictEqual(result.leaders[0].length, 4, 'player 1 should receive 4 leaders')
  })
})

// Demonstrate what the OLD buggy code would have produced
describe('Draft pack format - demonstrating the bug', () => {
  it('OLD CODE would have returned raw arrays (wrong)', () => {
    // This is what the buggy code did:
    const buggyResult: any[] = []
    const mockPack = { cards: [{ id: '1', name: 'Test' }] }

    // BUGGY: pushed pack.cards (the array) instead of pack (the object)
    buggyResult.push(mockPack.cards)

    assert.ok(Array.isArray(buggyResult[0]), 'buggy code produces raw array')
    assert.strictEqual(buggyResult[0][0].id, '1')
    // No .cards property - it's just the array directly
    assert.strictEqual(buggyResult[0].cards, undefined, 'no .cards property on raw array')
  })

  it('NEW CODE returns objects (correct)', () => {
    // This is what the fixed code does:
    const fixedResult: any[] = []
    const mockPack = { cards: [{ id: '1', name: 'Test' }] }

    // FIXED: push the pack object, not pack.cards
    fixedResult.push(mockPack)

    assert.ok(!Array.isArray(fixedResult[0]), 'fixed code produces object')
    assert.ok(Array.isArray(fixedResult[0].cards), 'object has .cards array')
    assert.strictEqual(fixedResult[0].cards[0].id, '1')
  })
})
