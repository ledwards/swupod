// @ts-nocheck
/**
 * Tests for Shuffle Packs functionality
 *
 * Proves that:
 * 1. Shuffling changes which packs players receive
 * 2. Packs come from the correct indices in the box
 * 3. Fisher-Yates shuffle produces different orderings
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { processBoxPacksForDraft } from './draftLogic'

// Deterministic RNG so the "shuffling changes the distribution" assertions can't
// flake. Fisher-Yates with Math.random() leaves index 0 in place ~1/24 of runs,
// which intermittently reddened CI. A seeded mulberry32 PRNG (reset before each
// test) keeps the shuffles reproducible while still exercising the real logic.
const RNG_SEED = 0x1a2b3c4d
let rngState = RNG_SEED
function seededRandom(): number {
  rngState = (rngState + 0x6d2b79f5) | 0
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// Mock pack data - each pack has a unique identifier
function createMockBox(size = 24) {
  return Array.from({ length: size }, (_, i) => ({
    cards: [
      { id: `pack${i}-card1`, name: `Pack ${i} Card 1`, isLeader: true },
      { id: `pack${i}-card2`, name: `Pack ${i} Card 2`, isBase: true },
      { id: `pack${i}-card3`, name: `Pack ${i} Card 3` },
      { id: `pack${i}-card4`, name: `Pack ${i} Card 4` },
    ]
  }))
}

// Fisher-Yates shuffle (same as used in randomize-packs API)
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// Generate random indices (same as used in sealed randomize API)
function generateRandomIndices(count: number, max: number): number[] {
  const indices: number[] = []
  const available = Array.from({ length: max }, (_, i) => i)

  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(seededRandom() * available.length)
    indices.push(available[randomIndex])
    available.splice(randomIndex, 1)
  }

  return indices.sort((a, b) => a - b)
}

describe('Shuffle Packs', () => {
  // Reset the deterministic RNG before each test so shuffles are reproducible
  // and the distribution-difference assertions can't flake.
  beforeEach(() => {
    rngState = RNG_SEED
  })

  describe('processBoxPacksForDraft', () => {
    it('distributes packs from box in order: player 0 gets packs 0,1,2', () => {
      const box = createMockBox(24)
      const result = processBoxPacksForDraft(box, 4)

      // Player 0 should get packs 0, 1, 2
      // The cards should have IDs starting with pack0, pack1, pack2
      const player0Packs = result.packs[0]

      // Check original packs (before leader/base extraction)
      const player0Originals = result.originalPacks[0]
      assert.ok(player0Originals[0].some(c => c.id.startsWith('pack0-')),
        'Player 0 pack 1 should come from box index 0')
      assert.ok(player0Originals[1].some(c => c.id.startsWith('pack1-')),
        'Player 0 pack 2 should come from box index 1')
      assert.ok(player0Originals[2].some(c => c.id.startsWith('pack2-')),
        'Player 0 pack 3 should come from box index 2')
    })

    it('distributes packs from box in order: player 1 gets packs 3,4,5', () => {
      const box = createMockBox(24)
      const result = processBoxPacksForDraft(box, 4)

      const player1Originals = result.originalPacks[1]
      assert.ok(player1Originals[0].some(c => c.id.startsWith('pack3-')),
        'Player 1 pack 1 should come from box index 3')
      assert.ok(player1Originals[1].some(c => c.id.startsWith('pack4-')),
        'Player 1 pack 2 should come from box index 4')
      assert.ok(player1Originals[2].some(c => c.id.startsWith('pack5-')),
        'Player 1 pack 3 should come from box index 5')
    })

    it('shuffled box gives different packs to players', () => {
      const box = createMockBox(24)
      const shuffledBox = shuffleArray(box)

      const normalResult = processBoxPacksForDraft(box, 4)
      const shuffledResult = processBoxPacksForDraft(shuffledBox, 4)

      // Get first card ID from player 0's first pack in each case
      const normalFirstCard = normalResult.originalPacks[0][0][0].id
      const shuffledFirstCard = shuffledResult.originalPacks[0][0][0].id

      // After shuffling, the packs should be different
      // (statistically almost certain with 24! permutations)
      // We verify by checking that at least ONE player gets different packs
      let foundDifference = false
      for (let p = 0; p < 4; p++) {
        for (let pack = 0; pack < 3; pack++) {
          const normalId = normalResult.originalPacks[p][pack][0].id
          const shuffledId = shuffledResult.originalPacks[p][pack][0].id
          if (normalId !== shuffledId) {
            foundDifference = true
            break
          }
        }
        if (foundDifference) break
      }

      assert.ok(foundDifference,
        'Shuffling the box should change which packs players receive')
    })

    it('throws error if not enough packs in box', () => {
      const smallBox = createMockBox(6) // Only 6 packs

      assert.throws(() => {
        processBoxPacksForDraft(smallBox, 4) // Need 12 packs for 4 players
      }, /Not enough packs/)
    })
  })

  describe('Fisher-Yates shuffle', () => {
    it('produces a permutation of the original array', () => {
      const original = [1, 2, 3, 4, 5, 6, 7, 8]
      const shuffled = shuffleArray(original)

      // Same length
      assert.strictEqual(shuffled.length, original.length)

      // Same elements (sorted)
      assert.deepStrictEqual(
        [...shuffled].sort((a, b) => a - b),
        [...original].sort((a, b) => a - b)
      )
    })

    it('produces different orderings on multiple calls', () => {
      const original = Array.from({ length: 24 }, (_, i) => i)

      // Run shuffle 10 times and check we get at least 2 different results
      const results = new Set<string>()
      for (let i = 0; i < 10; i++) {
        const shuffled = shuffleArray(original)
        results.add(JSON.stringify(shuffled))
      }

      assert.ok(results.size > 1,
        'Shuffle should produce different orderings (got only 1 unique result in 10 tries)')
    })

    it('does not modify the original array', () => {
      const original = [1, 2, 3, 4, 5]
      const originalCopy = [...original]
      shuffleArray(original)

      assert.deepStrictEqual(original, originalCopy,
        'Original array should not be modified')
    })
  })

  describe('generateRandomIndices (sealed)', () => {
    it('returns the correct number of indices', () => {
      const indices = generateRandomIndices(6, 24)
      assert.strictEqual(indices.length, 6)
    })

    it('returns unique indices', () => {
      const indices = generateRandomIndices(6, 24)
      const uniqueIndices = new Set(indices)
      assert.strictEqual(uniqueIndices.size, 6, 'All indices should be unique')
    })

    it('returns indices within valid range', () => {
      const indices = generateRandomIndices(6, 24)
      assert.ok(indices.every(i => i >= 0 && i < 24),
        'All indices should be between 0 and 23')
    })

    it('returns sorted indices', () => {
      const indices = generateRandomIndices(6, 24)
      const sorted = [...indices].sort((a, b) => a - b)
      assert.deepStrictEqual(indices, sorted, 'Indices should be sorted')
    })

    it('produces different subsets on multiple calls', () => {
      const results = new Set<string>()
      for (let i = 0; i < 10; i++) {
        const indices = generateRandomIndices(6, 24)
        results.add(JSON.stringify(indices))
      }

      assert.ok(results.size > 1,
        'Should produce different index subsets (got only 1 unique result in 10 tries)')
    })
  })

  describe('End-to-end: shuffle changes packs', () => {
    it('sealed: different indices = different packs', () => {
      const box = createMockBox(24)

      // First 6 packs (indices 0-5)
      const indices1 = [0, 1, 2, 3, 4, 5]
      const packs1 = indices1.map(i => box[i])

      // Random 6 packs (e.g., indices 6, 10, 15, 18, 20, 23)
      const indices2 = [6, 10, 15, 18, 20, 23]
      const packs2 = indices2.map(i => box[i])

      // Verify they're different
      const pack1FirstCardId = packs1[0].cards[0].id
      const pack2FirstCardId = packs2[0].cards[0].id

      assert.notStrictEqual(pack1FirstCardId, pack2FirstCardId,
        'Different indices should give different packs')
    })

    it('draft: shuffled box = different pack distribution', () => {
      const box = createMockBox(24)

      // Without shuffle: player 0 gets packs 0,1,2
      const result1 = processBoxPacksForDraft(box, 8)
      const player0Pack0Card = result1.originalPacks[0][0][0].id

      // With shuffle: player 0 gets different packs
      const shuffledBox = shuffleArray(box)
      const result2 = processBoxPacksForDraft(shuffledBox, 8)
      const player0Pack0CardShuffled = result2.originalPacks[0][0][0].id

      // The first pack's first card should be different after shuffle
      // (with 24! permutations, collision is extremely unlikely)
      assert.notStrictEqual(player0Pack0Card, player0Pack0CardShuffled,
        'Shuffled box should give player 0 different first pack')
    })

    it('shuffling preserves all packs (no packs lost)', () => {
      const box = createMockBox(24)
      const shuffledBox = shuffleArray(box)

      // Collect all card IDs from both boxes
      const boxCardIds = new Set(box.flatMap(p => p.cards.map(c => c.id)))
      const shuffledCardIds = new Set(shuffledBox.flatMap(p => p.cards.map(c => c.id)))

      assert.strictEqual(boxCardIds.size, shuffledCardIds.size,
        'Shuffled box should have same number of unique cards')

      // Every card in original should be in shuffled
      for (const id of boxCardIds) {
        assert.ok(shuffledCardIds.has(id),
          `Card ${id} should exist in shuffled box`)
      }
    })
  })
})
