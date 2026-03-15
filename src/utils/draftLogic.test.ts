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

  it('supports chaos drafts with more than 3 selected packs', async () => {
    const chaosSets = ['SHD', 'SHD', 'LAW', 'LAW']
    const { packs, leaders, originalPacks } = generateDraftPacks('SOR', {
      playerCount: 2,
      chaosSets
    })

    assert.strictEqual(packs.length, 2, 'should have 2 players')
    assert.strictEqual(packs[0].length, 4, 'player 1 should have 4 packs for 4 selected chaos sets')
    assert.strictEqual(packs[1].length, 4, 'player 2 should have 4 packs for 4 selected chaos sets')
    assert.strictEqual(leaders[0].length, 4, 'player 1 should have 4 leaders for 4 selected chaos sets')
    assert.strictEqual(leaders[1].length, 4, 'player 2 should have 4 leaders for 4 selected chaos sets')

    const playerOneSetCounts = originalPacks[0].reduce((acc, packCards) => {
      const setCode = packCards[0]?.set
      acc[setCode] = (acc[setCode] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    assert.strictEqual(playerOneSetCounts.SHD, 2, 'player 1 should receive two SHD packs')
    assert.strictEqual(playerOneSetCounts.LAW, 2, 'player 1 should receive two LAW packs')
  })

  it('processes pre-generated chaos box packs using the selected pack count', () => {
    const makePack = (setCode: string, index: number) => ({
      cards: [
        { id: `${setCode}-L${index}`, set: setCode, name: `${setCode} Leader ${index}`, isLeader: true },
        { id: `${setCode}-B${index}`, set: setCode, name: `${setCode} Base ${index}`, isBase: true },
        { id: `${setCode}-C${index}`, set: setCode, name: `${setCode} Card ${index}` }
      ]
    })

    const boxPacks = [
      makePack('SHD', 1),
      makePack('SHD', 2),
      makePack('LAW', 1),
      makePack('LAW', 2)
    ]

    const result = processBoxPacksForDraft(boxPacks as any, 1, 4)
    assert.strictEqual(result.packs[0].length, 4, 'single player should receive all 4 selected packs')
    assert.strictEqual(result.leaders[0].length, 4, 'single player should receive 4 leaders')

    const leaderSets = result.leaders[0].map(c => c.set)
    assert.deepStrictEqual(leaderSets, ['SHD', 'SHD', 'LAW', 'LAW'], 'leaders should preserve chaos set order')
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
