// @ts-nocheck
/**
 * RareLegendaryBelt Tests
 *
 * Run with: node src/belts/RareLegendaryBelt.test.ts
 */

import { RareLegendaryBelt } from './RareLegendaryBelt'
import { initializeCardCache } from '../utils/cardCache'

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
  console.log('\x1b[1m\x1b[35m💎 RareLegendaryBelt Tests\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(40) + '\x1b[0m')

  test('initializes with a set code and loads rares and legendaries', () => {
    const belt = new RareLegendaryBelt('SOR')
    assert(belt.fillingPool.length > 0, 'Filling pool should not be empty')
    assert(belt.rares.length > 0, 'Should have rares')
    assert(belt.legendaries.length > 0, 'Should have legendaries')
    assert(belt.fillingPool.every(c => !c.isLeader), 'No leaders in filling pool')
    assert(belt.fillingPool.every(c => c.set === 'SOR'), 'All cards should be from SOR set')
    assert(belt.fillingPool.every(c => c.variantType === 'Normal'), 'All cards should be normal variants')
  })

  test('all sets include rare bases in filling pool (rare bases go in rare slot)', () => {
    for (const setCode of ['SOR', 'LAW']) {
      const belt = new RareLegendaryBelt(setCode)
      const rareBases = belt.rares.filter(c => c.isBase)
      assert(rareBases.length > 0, `${setCode} should have rare bases in the rare slot`)
      assert(rareBases.every(c => c.rarity === 'Rare'), 'All rare bases should be Rare rarity')
    }
  })

  test('filling pool contains only Rare and Legendary rarities', () => {
    const belt = new RareLegendaryBelt('SOR')
    assert(
      belt.fillingPool.every(c => c.rarity === 'Rare' || c.rarity === 'Legendary'),
      'All cards should be Rare or Legendary'
    )
  })

  test('sets 1-3 use 7:1 ratio (1 in 8 legendary)', () => {
    for (const setCode of ['SOR', 'SHD', 'TWI']) {
      const belt = new RareLegendaryBelt(setCode)
      assertEqual(belt.ratio, 7, `${setCode} should use 7:1 ratio`)
    }
  })

  test('FIXED: sets 4+ use 4:1 ratio (1 in 5 legendary — FFG advertised rate, JTL onward)', () => {
    // SPEC source: official starwarsunlimited.com "Updates and Rotations":
    // "Legendary cards will appear... around 1 in every 5 packs" starting with Jump to
    // Lightspeed (JTL, set 4) and going forward — up from the original 1 in 8. So JTL/LOF/SEC
    // match LAW/ASH at 4:1. 11 real ASH boxes observe 56L/264 packs = 21.2% rare-slot
    // legendaries ~= the advertised 20%; the advertised rate CANNOT include HS/HSF/Prestige
    // legendaries (the rare slot alone already hits ~21%).
    for (const setCode of ['JTL', 'LOF', 'SEC', 'LAW', 'ASH']) {
      const belt = new RareLegendaryBelt(setCode)
      assertEqual(belt.ratio, 4, `${setCode} should use 4:1 ratio (1 in 5)`)
    }
  })

  test('hopper is filled on initialization', () => {
    const belt = new RareLegendaryBelt('SOR')
    assert(belt.hopper.length > belt.fillingPool.length, 'Hopper should be at least as large as filling pool after init')
  })

  test('next() returns a rare or legendary card', () => {
    const belt = new RareLegendaryBelt('SOR')
    const card = belt.next()
    assert(card !== null, 'next() should return a card')
    assert(card.rarity === 'Rare' || card.rarity === 'Legendary', 'Returned card should be Rare or Legendary')
    assert(!card.isLeader, 'Returned card should not be a leader')
    assert(card.set === 'SOR', 'Returned card should be from correct set')
  })

  test('next() removes card from hopper', () => {
    const belt = new RareLegendaryBelt('SOR')
    const initialSize = belt.size
    belt.next()
    assertEqual(belt.size, initialSize - 1, 'Hopper size should decrease by 1')
  })

  test('next() returns a copy, not the original', () => {
    const belt = new RareLegendaryBelt('SOR')
    const card1 = belt.next()
    card1.modified = true
    const card2 = belt.next()
    assert(card2.modified === undefined, 'Cards should be copies, not references')
  })

  test('hopper refills when depleted', () => {
    const belt = new RareLegendaryBelt('SOR')
    const fillingPoolSize = belt.fillingPool.length

    // Drain the hopper to exactly the threshold
    while (belt.size > fillingPoolSize) {
      belt.next()
    }

    // Pull one more (hopper is still at threshold, won't refill yet)
    belt.next()
    // Pull another (hopper is now below threshold, should trigger refill)
    belt.next()
    belt.next()

    // After refill, hopper should be larger than filling pool again
    assert(belt.size >= fillingPoolSize, `Hopper should refill. Size: ${belt.size}, threshold: ${fillingPoolSize}`)
  })

  test('rares appear more frequently than legendaries (matching spec ratio)', () => {
    // SPEC: Sets 1-3 should have 7:1 rare:legendary ratio (1 in 8 = 12.5% legendary)
    // SPEC: Sets 4+ (JTL onward) should have 4:1 rare:legendary ratio (1 in 5 = 20% legendary)
    const belt = new RareLegendaryBelt('SOR')

    // Sample many cards for statistical significance
    const counts: Record<string, number> = { Rare: 0, Legendary: 0 }
    for (let i = 0; i < 800; i++) {
      const card = belt.next()
      counts[card.rarity] = (counts[card.rarity] || 0) + 1
    }

    // Calculate observed legendary rate
    const total = counts.Rare + counts.Legendary
    const legendaryRate = counts.Legendary / total

    // SPEC: SOR (Set 1) should have ~12.5% legendary rate (1 in 8)
    const expectedRate = 1 / 8  // 12.5%
    const tolerance = 0.04  // Allow 4% variance for statistical noise

    assert(Math.abs(legendaryRate - expectedRate) < tolerance,
      `Legendary rate should be ~${(expectedRate * 100).toFixed(1)}% (1 in 8), ` +
      `got ${(legendaryRate * 100).toFixed(1)}% (${counts.Legendary}/${total})`)
  })

  test('no duplicate cards within 6 slots of each other (seam dedup)', () => {
    const belt = new RareLegendaryBelt('SOR')

    // Check first 100 cards for adjacent duplicates
    const sample: Array<{ id: string }> = []
    for (let i = 0; i < 100; i++) {
      sample.push(belt.next())
    }

    let violations = 0
    for (let i = 0; i < sample.length; i++) {
      for (let j = i + 1; j <= Math.min(i + 6, sample.length - 1); j++) {
        if (sample[i].id === sample[j].id) {
          violations++
        }
      }
    }

    // Allow some violations since dedup isn't perfect with card pool size
    assert(violations <= 5, `Found ${violations} duplicate pairs within 6 slots (max allowed: 5)`)
  })

  test('different belt instances start at different positions', () => {
    const firstCards = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const belt = new RareLegendaryBelt('SOR')
      firstCards.add(belt.peek(1)[0].id)
    }

    // With random start, we should see variation
    assert(firstCards.size > 1, 'Different belt instances should start at different positions')
  })

  test('peek() returns cards without removing them', () => {
    const belt = new RareLegendaryBelt('SOR')
    const peeked = belt.peek(3)
    const sizeBefore = belt.size

    assertEqual(peeked.length, 3, 'peek(3) should return 3 cards')
    assertEqual(belt.size, sizeBefore, 'peek() should not change hopper size')

    // Verify peek matches what next() returns
    const next1 = belt.next()
    assertEqual(next1.id, peeked[0].id, 'First peeked card should match first next()')
  })

  test('FIXED: Set 7+ rare belt allows same-card repeats at distance 4 (real ASH box 001: #247 at line gap 4)', () => {
    // SPEC (LINE_STACKING_COLLATION_PLAN L4): Set 7+ (LAW/ASH) loosen the same-card
    // dedup window from 6 to 3, so same-rare repeats CAN occur inside the old
    // forbidden zone (distances 4-6; real ASH box 001: rare #247 repeated 4 packs
    // apart), while back-to-back (distance-1) repeats stay near zero. Rate-based:
    // over 6000 draws, repeats at distance 4-6 (impossible under the old window) must
    // be > 0; distance-1 repeats are held below a small ceiling (NOT a hard "never" —
    // the _seamDedup depth>10 bailout tolerates rare adjacents; see below).
    const belt = new RareLegendaryBelt('ASH')
    const seq: string[] = []
    for (let i = 0; i < 6000; i++) seq.push(belt.next().id)

    const last = new Map<string, number>()
    let shortZone = 0
    let backToBack = 0 // distance-1 (adjacent) same-card repeats
    for (let i = 0; i < seq.length; i++) {
      const prev = last.get(seq[i])
      if (prev !== undefined) {
        const d = i - prev
        if (d === 1) backToBack++
        if (d >= 4 && d <= 6) shortZone++
      }
      last.set(seq[i], i)
    }

    assert(shortZone > 0,
      `SPEC (Set 7+): ASH rare belt should produce same-card repeats at distance 4-6 ` +
      `(old window forbade <7; real ASH box 001 observed line gap 4), got 0 in 6000 draws`)
    // SPEC (Set 7+): back-to-back (distance-1) repeats should be effectively absent, but
    // the belt does NOT deterministically guarantee it: RareLegendaryBelt._seamDedup()
    // gives up after `depth > 10` recursions, so on unlucky RNG a single adjacent repeat
    // can survive the seam (documented in ASH_COLLATION_FINDINGS.md "Code gaps found").
    // A hard `minDist >= 2` / "never" assertion therefore FLAKES on seeded RNG. Per
    // .claude/rules/testing.md (rate bands, never hard ===/never over RNG samples — same
    // lesson as the zero-rare-leader draft-box assertion), assert a rate band instead:
    // measured back-to-back rate is ~1.2e-5/draw (0 repeats in 92.7% of 6000-draw boots;
    // max 3 in a single boot over 3000 boots). Ceiling 6 is ~2x the worst observed —
    // essentially never trips on the tolerated bailout, yet a real regression that removed
    // the never-back-to-back guard would produce dozens of adjacents in 6000 draws.
    assert(backToBack <= 6,
      `SPEC (Set 7+): ASH rare belt should keep back-to-back (distance-1) repeats near zero. ` +
      `The _seamDedup depth>10 bailout tolerates rare adjacents (~1.2e-5/draw; measured max 3/6000). ` +
      `Got ${backToBack} back-to-back repeats in 6000 draws (rate-band ceiling 6; a regression would show dozens)`)
  })

  test('sets 1-6 rare belt window unchanged: SOR same-card repeats stay >= 7 apart (window 6)', () => {
    // SPEC: Sets 1-6 keep the dedup window of 6, so same-card repeats within 4 draws
    // are effectively impossible. Distance-<=4 events are rare seam artifacts only;
    // pin them near zero to prove Set 7+ loosening did NOT touch old sets.
    const belt = new RareLegendaryBelt('SOR')
    const seq: string[] = []
    for (let i = 0; i < 2000; i++) seq.push(belt.next().id)

    const last = new Map<string, number>()
    let shortRepeats = 0
    for (let i = 0; i < seq.length; i++) {
      const prev = last.get(seq[i])
      if (prev !== undefined && i - prev <= 4) shortRepeats++
      last.set(seq[i], i)
    }

    assert(shortRepeats <= 3,
      `SPEC (Sets 1-6): SOR rare belt (window 6) should have ~0 same-card repeats within 4 draws ` +
      `over 2000 draws, got ${shortRepeats}`)
  })

  test('no repeating pattern: consecutive belt fills produce different sequences', () => {
    const belt = new RareLegendaryBelt('SOR')
    const fillSize = belt.fillingPool.length

    // Deploy entire first fill into an array
    const firstFill: string[] = []
    for (let i = 0; i < fillSize; i++) {
      firstFill.push(belt.next().id)
    }

    // Deploy second fill into an array
    const secondFill: string[] = []
    for (let i = 0; i < fillSize; i++) {
      secondFill.push(belt.next().id)
    }

    // Arrays should not be identical
    const areIdentical = firstFill.length === secondFill.length &&
      firstFill.every((id, idx) => id === secondFill[idx])

    assert(!areIdentical, 'Consecutive belt fills should not produce identical sequences')

    // Count how many positions are different
    let differences = 0
    for (let i = 0; i < Math.min(firstFill.length, secondFill.length); i++) {
      if (firstFill[i] !== secondFill[i]) differences++
    }

    // At least 50% of positions should be different (shuffled)
    const diffPercent = (differences / firstFill.length) * 100
    assert(diffPercent > 50, `At least 50% of positions should differ, got ${diffPercent.toFixed(1)}%`)
  })

  test('FIXED: LAW+ legendaries are sheet-cut spaced — ~5 per 24-pack box, never a coin-flip cluster', () => {
    // SPEC (11 real ASH boxes): rare-slot legendaries per box are welded to 5
    // (one box had 6) — sd ~0.3. The OLD pair-sheet spaced duplicate COPIES but
    // left rarity random, so legendaries/box was Binomial(24, 1/5) — sd ~1.9,
    // a box could hold 0 or 11. Rarity must be spaced on the sheet.
    const belt = new RareLegendaryBelt('ASH')
    const BOXES = 800
    const perBox: number[] = []
    for (let b = 0; b < BOXES; b++) {
      let legs = 0
      for (let p = 0; p < 24; p++) {
        if (belt.next()?.rarity === 'Legendary') legs++
      }
      perBox.push(legs)
    }
    const mean = perBox.reduce((a, v) => a + v, 0) / BOXES
    const sd = Math.sqrt(perBox.reduce((a, v) => a + (v - mean) ** 2, 0) / BOXES)
    const binomSd = Math.sqrt(24 * (mean / 24) * (1 - mean / 24)) // the coin-flip baseline (~1.9)
    const maxSeen = Math.max(...perBox)
    // SPEC: mean ~1-in-5 (4:1 ratio → ~4.8), and the spread FAR tighter than a
    // coin flip (the definitive signal). Continuous belt draws cross 125-segment
    // seams so the extreme tail is a touch wider than a fresh sealed-box cut
    // ([4-6]); the coin-flip a box must NEVER reach is 10-11.
    assert(mean > 4 && mean < 6, `SPEC: ~5 legendaries/box, got ${mean.toFixed(2)}`)
    assert(sd < binomSd * 0.55, `SPEC: legendary spread must be well below coin-flip — sd ${sd.toFixed(2)} vs binomial ${binomSd.toFixed(2)}`)
    assert(maxSeen <= 9, `SPEC: no box should reach the coin-flip extreme (10-11), saw max ${maxSeen}`)
  })

  test('UNBREAKABLE: every card occurs the same number of times as its rarity peers on the sheet', () => {
    // A sheet must give every card of a rarity the SAME copy count — no card
    // doubled ad hoc to fake the ratio. LCM sizing makes equal frequency and the
    // 4:1 ratio hold at once (ASH 50R/20L @ 4:1 → 8 per rare, 5 per legendary).
    for (const setCode of ['ASH', 'LAW']) {
      const belt = new RareLegendaryBelt(setCode)
      const size = belt.size
      const perCard = new Map<string, { rarity: string, n: number }>()
      for (let i = 0; i < size; i++) {
        const c = belt.next()
        if (!c) break
        const e = perCard.get(c.id) ?? { rarity: c.rarity, n: 0 }
        e.n++
        perCard.set(c.id, e)
      }
      const byRarity: Record<string, number[]> = {}
      for (const { rarity, n } of perCard.values()) (byRarity[rarity] ??= []).push(n)
      for (const [rarity, counts] of Object.entries(byRarity)) {
        const min = Math.min(...counts)
        const max = Math.max(...counts)
        assert(min === max, `SPEC (${setCode}): every ${rarity} must have equal copies on the sheet, got ${min}-${max}`)
      }
    }
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
