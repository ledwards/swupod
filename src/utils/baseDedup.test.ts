// @ts-nocheck
/**
 * Base Deduplication Tests
 *
 * Tests the common base dedup logic used by chaos draft and chaos sealed.
 * Expected values are from the SPEC (card data), not derived from implementation.
 *
 * Run with: node src/utils/baseDedup.test.ts
 */

import { deduplicateCommonBases } from './baseDedup'
import { initializeCardCache, getCachedCards } from './cardCache'

let passed = 0
let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`\x1b[32m✅ ${name}\x1b[0m`)
    passed++
  } catch (e) {
    console.log(`\x1b[31m❌ ${name}\x1b[0m`)
    console.log(`\x1b[33m   ${(e as Error).message}\x1b[0m`)
    failed++
  }
}

function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) throw new Error(message || 'Assertion failed')
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`)
  }
}

async function runTests() {
  await initializeCardCache()

  // Load cards from all 6 sets (SOR through SEC)
  const allSets = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC']
  const allCards = allSets.flatMap(set => getCachedCards(set))

  // Sanity check: all 6 sets loaded
  test('loads cards from all 6 sets', () => {
    for (const set of allSets) {
      const setCards = getCachedCards(set)
      assert(setCards.length > 0, `No cards loaded for ${set}`)
    }
  })

  // SPEC: Each set has 4 aspects × multiple common bases per aspect.
  // Sets 1-4,6 have 30HP common bases. Set 5 (LOF) has 28HP common bases.
  // After dedup by aspect+HP across all 6 sets, we expect:
  //   - 4 bases at 30HP (Vigilance, Command, Aggression, Cunning)
  //   - 4 bases at 28HP (Vigilance, Command, Aggression, Cunning) — from LOF
  //   - Total: 8 unique common bases
  //   - 2 per color (one 30HP, one 28HP)

  const dedupedBases = deduplicateCommonBases(allCards)

  test('SPEC: chaos sealed/draft with sets 1-6 produces 8 unique common bases', () => {
    assertEqual(dedupedBases.length, 8,
      `Expected 8 unique common bases (4 aspects × 2 HP tiers), got ${dedupedBases.length}`)
  })

  test('SPEC: 4 common bases with 30 HP', () => {
    const bases30 = dedupedBases.filter(b => b.hp === 30)
    assertEqual(bases30.length, 4,
      `Expected 4 bases with 30 HP, got ${bases30.length}`)
  })

  test('SPEC: 4 common bases with 28 HP (from LOF)', () => {
    const bases28 = dedupedBases.filter(b => b.hp === 28)
    assertEqual(bases28.length, 4,
      `Expected 4 bases with 28 HP, got ${bases28.length}`)
  })

  test('SPEC: 2 bases per aspect color (one 30HP, one 28HP)', () => {
    const aspects = ['Vigilance', 'Command', 'Aggression', 'Cunning']
    for (const aspect of aspects) {
      const basesForAspect = dedupedBases.filter(b => (b.aspects || [])[0] === aspect)
      assertEqual(basesForAspect.length, 2,
        `Expected 2 ${aspect} bases, got ${basesForAspect.length}`)

      const hps = basesForAspect.map(b => b.hp).sort()
      assert(hps.includes(28), `Missing 28HP ${aspect} base`)
      assert(hps.includes(30), `Missing 30HP ${aspect} base`)
    }
  })

  test('SPEC: all deduped bases are common rarity', () => {
    for (const base of dedupedBases) {
      assertEqual(base.rarity, 'Common',
        `Expected Common rarity, got ${base.rarity} for ${base.name}`)
    }
  })

  test('SPEC: bases are sorted by aspect order (Vigilance, Command, Aggression, Cunning)', () => {
    const aspectOrder = ['Vigilance', 'Command', 'Aggression', 'Cunning']
    let lastAspectIndex = -1
    for (const base of dedupedBases) {
      const aspect = (base.aspects || [])[0]
      const idx = aspectOrder.indexOf(aspect)
      assert(idx >= lastAspectIndex,
        `Bases not sorted by aspect order: ${aspect} appeared after index ${lastAspectIndex}`)
      lastAspectIndex = idx
    }
  })

  // Test that rare bases in the input are excluded (dedup only operates on commons)
  test('rare bases in input are excluded from deduped output', () => {
    const cardsWithRareBases = [
      ...allCards,
      { name: 'Rare Base', type: 'Base', isBase: true, rarity: 'Rare', aspects: ['Vigilance'], hp: 25 },
      { name: 'Legendary Base', type: 'Base', isBase: true, rarity: 'Legendary', aspects: ['Command'], hp: 20 },
    ]
    const result = deduplicateCommonBases(cardsWithRareBases)
    const rares = result.filter(b => b.rarity !== 'Common')
    assertEqual(rares.length, 0, `Expected 0 non-common bases in output, got ${rares.length}`)
    // Should still be the same 8 common bases
    assertEqual(result.length, 8, `Expected 8 common bases, got ${result.length}`)
  })

  test('next-set 30HP common bases dedupe into existing aspect+HP cells', () => {
    const cards = [
      { name: 'SOR Blue 30', set: 'SOR', type: 'Base', isBase: true, rarity: 'Common', aspects: ['Vigilance'], hp: 30 },
      { name: 'ASH Blue 30', set: 'ASH', type: 'Base', isBase: true, rarity: 'Common', aspects: ['Vigilance'], hp: 30 },
      { name: 'ASH Yellow 30', set: 'ASH', type: 'Base', isBase: true, rarity: 'Common', aspects: ['Cunning'], hp: 30 },
    ]
    const result = deduplicateCommonBases(cards)

    assertEqual(result.length, 2,
      `Expected ASH Blue 30 to share SOR Blue 30's cell, got ${result.length} bases`)
    assertEqual(result.filter(b => (b.aspects || [])[0] === 'Vigilance' && b.hp === 30).length, 1)
    assertEqual(result.filter(b => (b.aspects || [])[0] === 'Cunning' && b.hp === 30).length, 1)
  })

  // Test single-set behavior (normal draft/sealed)
  test('single set (SOR) produces 4 common bases (one per aspect)', () => {
    const sorCards = getCachedCards('SOR')
    const result = deduplicateCommonBases(sorCards)
    assertEqual(result.length, 4,
      `Expected 4 common bases for single set, got ${result.length}`)
    // All should be 30HP
    for (const base of result) {
      assertEqual(base.hp, 30, `Expected 30HP for SOR base, got ${base.hp}`)
    }
  })

  test('single set (LOF) produces 4 common bases at 28HP', () => {
    const lofCards = getCachedCards('LOF')
    const result = deduplicateCommonBases(lofCards)
    assertEqual(result.length, 4,
      `Expected 4 common bases for LOF, got ${result.length}`)
    for (const base of result) {
      assertEqual(base.hp, 28, `Expected 28HP for LOF base, got ${base.hp}`)
    }
  })

  // Test 3-set chaos (e.g. SOR, JTL, LOF)
  test('3-set chaos (SOR, JTL, LOF) produces 8 common bases', () => {
    const threeSetCards = ['SOR', 'JTL', 'LOF'].flatMap(s => getCachedCards(s))
    const result = deduplicateCommonBases(threeSetCards)
    assertEqual(result.length, 8,
      `Expected 8 common bases (4×30HP + 4×28HP), got ${result.length}`)
  })

  // Test 3-set chaos without LOF (all same HP)
  test('3-set chaos without LOF (SOR, SHD, TWI) produces 4 common bases', () => {
    const threeSetCards = ['SOR', 'SHD', 'TWI'].flatMap(s => getCachedCards(s))
    const result = deduplicateCommonBases(threeSetCards)
    assertEqual(result.length, 4,
      `Expected 4 common bases (all 30HP, deduped across sets), got ${result.length}`)
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

runTests()
