// @ts-nocheck
/**
 * BaseBelt Tests
 *
 * Run with: node src/belts/BaseBelt.test.ts
 */

import { BaseBelt } from './BaseBelt'
import { initializeCardCache, getCachedCards } from '../utils/cardCache'
import { generateSealedBox, clearBeltCache } from '../utils/boosterPack'

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

async function runTests(): Promise<void> {
  console.log('\x1b[36m🔄 Initializing card cache...\x1b[0m')
  await initializeCardCache()
  console.log('')
  console.log('\x1b[1m\x1b[35m🏛️ BaseBelt Tests\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(40) + '\x1b[0m')

  test('initializes with a set code and loads only common bases', () => {
    const belt = new BaseBelt('SOR')
    assert(belt.fillingPool.length > 0, 'Filling pool should not be empty')
    assert(belt.fillingPool.every(c => c.isBase), 'All cards in filling pool should be bases')
    assert(belt.fillingPool.every(c => c.rarity === 'Common'), 'All bases should be Common rarity')
    assert(belt.fillingPool.every(c => c.set === 'SOR'), 'All cards should be from SOR set')
    assert(belt.fillingPool.every(c => c.variantType === 'Normal'), 'All cards should be normal variants')
  })

  test('hopper is filled on initialization', () => {
    const belt = new BaseBelt('SOR')
    assert(belt.hopper.length >= belt.fillingPool.length, 'Hopper should be at least as large as filling pool after init')
  })

  test('next() returns a base card', () => {
    const belt = new BaseBelt('SOR')
    const card = belt.next()
    assert(card !== null, 'next() should return a card')
    assert(card.isBase, 'Returned card should be a base')
    assert(card.rarity === 'Common', 'Returned card should be Common rarity')
    assert(card.set === 'SOR', 'Returned card should be from correct set')
  })

  test('next() removes card from hopper when serving common', () => {
    // Use SHD which has no rare bases, so next() always serves from hopper
    const belt = new BaseBelt('SHD')
    const initialSize = belt.size
    belt.next()
    assertEqual(belt.size, initialSize - 1, 'Hopper size should decrease by 1')
  })

  test('next() returns a copy, not the original', () => {
    const belt = new BaseBelt('SOR')
    const card1 = belt.next()
    card1.modified = true
    // Get another card and check it doesn't have the modification
    const card2 = belt.next()
    assert(card2.modified === undefined, 'Cards should be copies, not references')
  })

  test('hopper refills when depleted', () => {
    const belt = new BaseBelt('SOR')
    const fillingPoolSize = belt.fillingPool.length

    // Drain the hopper to exactly the threshold
    while (belt.size > fillingPoolSize) {
      belt.next()
    }

    // Pull one more (hopper is still at threshold, won't refill yet)
    belt.next()
    // Pull another (hopper is now below threshold, should trigger refill)
    belt.next()

    // After refill, hopper should be at least as large as filling pool (with < instead of <=, it refills to exactly filling pool size)
    assert(belt.size >= fillingPoolSize, `Hopper should refill. Size: ${belt.size}, threshold: ${fillingPoolSize}`)
  })

  test('adjacent bases rarely have the same aspect (seam dedup)', () => {
    const belt = new BaseBelt('SOR')

    // Sample 50 cards and check for adjacent aspect matches
    const sample: Array<{ aspects?: string[] }> = []
    for (let i = 0; i < 50; i++) {
      sample.push(belt.next())
    }

    let adjacentMatches = 0
    for (let i = 1; i < sample.length; i++) {
      const prev = sample[i - 1]
      const curr = sample[i]
      if (prev.aspects && curr.aspects) {
        const hasOverlap = prev.aspects.some(a => curr.aspects!.includes(a))
        if (hasOverlap) {
          adjacentMatches++
        }
      }
    }

    // With 8 bases and aspect dedup, we should have few adjacent matches
    // Allow some since dedup isn't perfect
    assert(adjacentMatches <= 10, `Found ${adjacentMatches} adjacent aspect matches (max allowed: 10)`)
  })

  test('FIXED: Set 7+ base belt separates aspects on the LINE (real ASH box 001 line order: 1/21 adjacent same-aspect)', () => {
    const belt = new BaseBelt('ASH')
    const sample: Array<{ aspects?: string[] }> = []
    for (let i = 0; i < 400; i++) sample.push(belt.next())

    let adjacentMatches = 0
    for (let i = 1; i < sample.length; i++) {
      const prev = sample[i - 1], curr = sample[i]
      if (prev.aspects && curr.aspects && prev.aspects.some(a => curr.aspects!.includes(a))) {
        adjacentMatches++
      }
    }
    // SPEC: real ASH box 001 in LINE order shows the base sheet rotates aspects
    // (1/21 adjacent same-aspect pairs). The line-level belt must model this;
    // consumer-visible randomness comes from box stacking, not the belt.
    // Tolerant of best-effort swap failures (~<=10% of 399).
    assert(adjacentMatches <= 40,
      `Set 7+ base belt should separate aspects on the line: got ${adjacentMatches}/399 (real ASH line: 1/21 ≈ 5%)`)
  })

  test('FIXED: Set 7+ base belt never serves the same base back-to-back', () => {
    const belt = new BaseBelt('ASH')
    let prev = belt.next()
    for (let i = 0; i < 400; i++) {
      const curr = belt.next()
      assert(!(prev && curr && prev.name === curr.name && prev.subtitle === curr.subtitle),
        `Same base served back-to-back at draw ${i}: ${curr?.name}`)
      prev = curr
    }
  })

  test('sets 1-6 base belts keep aspect seam dedup (unchanged)', () => {
    const belt = new BaseBelt('JTL')
    const sample: Array<{ aspects?: string[] }> = []
    for (let i = 0; i < 50; i++) sample.push(belt.next())
    let adjacentMatches = 0
    for (let i = 1; i < sample.length; i++) {
      const prev = sample[i - 1], curr = sample[i]
      if (prev.aspects && curr.aspects && prev.aspects.some(a => curr.aspects!.includes(a))) {
        adjacentMatches++
      }
    }
    assert(adjacentMatches <= 10, `JTL should still dedup aspects: ${adjacentMatches} matches`)
  })

  test('Set 7+ consumer order shows ~random base aspect adjacency (stacking scrambles the line)', () => {
    // Generate real ASH boxes and inspect the 24 packs in returned (box/consumer)
    // order. The line separates aspects (~5%), but box stacking scrambles adjacency
    // back toward random. Real photo-order data: 5/21 ≈ 24%; pure random ≈ 25%;
    // line-separated WITHOUT stacking would be ~5% — so this also guards that
    // stacking is actually applied to sealed boxes.
    const numBoxes = 40
    let sameAspectPairs = 0
    let totalPairs = 0
    clearBeltCache()
    for (let b = 0; b < numBoxes; b++) {
      const box = generateSealedBox([], 'ASH', 24)
      const bases = box.map(pack => pack.cards.find(c => c.isBase))
      for (let i = 1; i < bases.length; i++) {
        const prev = bases[i - 1], curr = bases[i]
        if (prev?.aspects && curr?.aspects) {
          totalPairs++
          if (prev.aspects.some(a => curr.aspects!.includes(a))) sameAspectPairs++
        }
      }
    }
    const rate = sameAspectPairs / totalPairs
    assert(rate >= 0.10 && rate <= 0.40,
      `Set 7+ consumer-order base aspect adjacency should be ~random (real photo order: 5/21 ≈ 24%), got ${(rate * 100).toFixed(1)}% (${sameAspectPairs}/${totalPairs})`)
  })

  test('different belt instances start at different positions', () => {
    // Create multiple belts and check their first card varies
    const firstCards = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const belt = new BaseBelt('SOR')
      firstCards.add(belt.peek(1)[0].id)
    }

    // With random start, we should see variation
    assert(firstCards.size > 1, 'Different belt instances should start at different positions')
  })

  test('peek() returns cards without removing them', () => {
    const belt = new BaseBelt('SOR')
    const peeked = belt.peek(3)
    const sizeBefore = belt.size

    assertEqual(peeked.length, 3, 'peek(3) should return 3 cards')
    assertEqual(belt.size, sizeBefore, 'peek() should not change hopper size')

    // Verify peek matches what next() returns
    const next1 = belt.next()
    assertEqual(next1.id, peeked[0].id, 'First peeked card should match first next()')
  })

  test('all bases have aspects', () => {
    const belt = new BaseBelt('SOR')
    // Check filling pool has aspects
    assert(belt.fillingPool.every(c => c.aspects && c.aspects.length > 0), 'All bases should have aspects')
  })

  test('no set loads rare bases into the base slot (all use rare slot)', () => {
    // All sets (1-7) have rareBasesInRareSlot: true → rare bases go in RareLegendaryBelt
    for (const setCode of ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW']) {
      const belt = new BaseBelt(setCode)
      assertEqual(belt.rareBases.length, 0, `${setCode} should NOT have rare bases in base slot (they go in rare slot)`)
    }
  })

  test('base slot only serves common bases for all sets', () => {
    for (const setCode of ['SOR', 'LAW']) {
      const belt = new BaseBelt(setCode)
      for (let i = 0; i < 100; i++) {
        const card = belt.next()
        assert(card !== null, `${setCode} next() should return a card`)
        assertEqual(card.rarity, 'Common', `${setCode} base slot should only serve common bases, got ${card.rarity}`)
      }
    }
  })

  test('no repeating pattern: consecutive belt fills produce different sequences', () => {
    const belt = new BaseBelt('SOR')
    const fillSize = belt.fillingPool.length

    // First two fills should not be byte-for-byte identical (belt reshuffles each boot).
    const firstFill: string[] = []
    for (let i = 0; i < fillSize; i++) firstFill.push(belt.next().id)
    const secondFill: string[] = []
    for (let i = 0; i < fillSize; i++) secondFill.push(belt.next().id)
    const areIdentical = firstFill.every((id, idx) => id === secondFill[idx])
    assert(!areIdentical, 'Consecutive belt fills should not produce identical sequences')

    // Position-difference RATE, measured over a LARGE sample of consecutive fill-pairs.
    //
    // Comparing a single 8-position pair (as this test used to) is a tiny sample whose
    // per-run rate swings from 0% to 100% — it flaked ~0.5% of runs at a hard 50%
    // threshold (e.g. "got 37.5%" = 3/8). Per .claude/rules/testing.md, use a rate band
    // over a large sample instead of a hard threshold on a handful of positions.
    //
    // SPEC: _fill() Fisher-Yates-reshuffles the pool for every boot, so consecutive
    // fills are near-independent permutations of `fillSize` distinct bases. Expected
    // position-match probability ≈ 1/fillSize, so expected differ rate ≈ 1 - 1/8 = 87.5%.
    // Measured over 3000×500 fill-pairs: mean 87.4%, min 85.2% (aggregate rate per run
    // is tightly concentrated over ~4000 positions). Assert >= 70% — ~15pts of margin
    // below the observed floor so it never flakes, yet a belt that stopped reshuffling
    // (repeating sequences) would crater far below 70% and fail.
    let diff = 0, total = 0
    let prev = secondFill
    for (let p = 0; p < 500; p++) {
      const fill: string[] = []
      for (let i = 0; i < fillSize; i++) fill.push(belt.next().id)
      for (let i = 0; i < fillSize; i++) { total++; if (prev[i] !== fill[i]) diff++ }
      prev = fill
    }
    const diffPercent = (diff / total) * 100
    assert(diffPercent >= 70,
      `SPEC: consecutive belt fills should be well-shuffled — >= 70% of positions differ ` +
      `over a large sample (expected ~87.5%), got ${diffPercent.toFixed(1)}% over ${total} positions`)
  })

  console.log('')
  console.log('\x1b[35m' + '='.repeat(40) + '\x1b[0m')
  console.log(`\x1b[32m✅ Tests passed: ${passed}\x1b[0m`)
  if (failed > 0) {
    console.log(`\x1b[31m❌ Tests failed: ${failed}\x1b[0m`)
  } else {
    console.log(`\x1b[90m   Tests failed: ${failed}\x1b[0m`)
  }
  console.log('')

  if (failed > 0) {
    console.log('\x1b[31m\x1b[1m💥 TESTS FAILED\x1b[0m')
    process.exit(1)
  } else {
    console.log('\x1b[32m\x1b[1m🎉 ALL TESTS PASSED!\x1b[0m')
  }
}

runTests()
