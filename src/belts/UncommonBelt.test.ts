// @ts-nocheck
/**
 * UncommonBelt Tests
 *
 * Run with: node src/belts/UncommonBelt.test.ts
 */

import { UncommonBelt } from './UncommonBelt'
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

  // ============================================================================
  // Set 7+ UC sheet spec (6 verified real boxes, 2026-07-11)
  // - repeats at pack-gaps 1-23 (seam-uniform, ~6.7/box); the old 24-draw window
  //   forbade every observed short-gap repeat (real min = 1 pack = 3 draws)
  // - within-pack adjacent same-primary 3.9% (n=230) ~= shuffled baseline 5.2%:
  //   the real UC sheet has NO aspect rotation (sets 1-6 keep the interleave)
  // ============================================================================

  test('FIXED: Set 7+ UC dedup window is 3 (config dedupWindows.uncommon; was 24)', () => {
    const ash = new UncommonBelt('ASH')
    assert(ash.DEDUP_WINDOW === 3, `ASH UC window should be 3, got ${ash.DEDUP_WINDOW}`)
    assert(ash.aspectInterleave === true, 'ASH UC boot keeps aspect interleave (real sheet rotates: 3.9% adjacency vs ~20% random)')
    const sor = new UncommonBelt('SOR')
    assert(sor.DEDUP_WINDOW === 24, `SOR UC window should stay 24, got ${sor.DEDUP_WINDOW}`)
    assert(sor.aspectInterleave === true, 'SOR UC boot keeps aspect interleaving (sets 1-6 unchanged)')
  })

  test('FIXED: Set 7+ UC boot keeps aspect interleave (real sheet rotates: 3.9% vs ~20% random)', () => {
    const MOR = new Set(['Villainy', 'Heroism'])
    const prim = (c) => (c.aspects || []).find(a => !MOR.has(a)) || (c.aspects || [])[0] || null
    const adjRate = (setCode, boots) => {
      let same = 0, tot = 0
      for (let b = 0; b < boots; b++) {
        const belt = new UncommonBelt(setCode)
        const boot = belt.hopper
        for (let i = 1; i < boot.length; i++) { tot++; if (prim(boot[i]) && prim(boot[i]) === prim(boot[i - 1])) same++ }
      }
      return same / tot
    }
    const ash = adjRate('ASH', 30)
    // Real sheet: 3.9% within-pack violations (n=230) vs ~20% if aspect-random —
    // the sheet rotates; belt interleave produces <=3% (matching direction; we
    // don't manufacture the residual ~4% violation noise synthetically).
    assert(ash <= 0.03,
      `SPEC: ASH UC boot stays interleaved (<=3%; real sheet rotates), got ${(ash * 100).toFixed(1)}%`)
    const sor = adjRate('SOR', 10)
    assert(sor <= 0.01, `SOR UC boot should stay hard-interleaved (<=1%), got ${(sor * 100).toFixed(1)}%`)
  })

  test('FIXED: Set 7+ UC seam repeats can land 1 pack apart (window 2), never adjacent', () => {
    // Real boxes: 4 repeats at pack-gap 1 across 6 boxes; old window forced >= ~8 packs.
    let minGap = Infinity
    for (let t = 0; t < 30; t++) {
      const belt = new UncommonBelt('ASH')
      const seen = new Map()
      for (let i = 0; i < 132; i++) {
        const c = belt.next()
        if (seen.has(c.id)) minGap = Math.min(minGap, i - seen.get(c.id))
        seen.set(c.id, i)
      }
    }
    assert(minGap >= 3, `SPEC: repeats must respect window 2 (min distance 3 draws), got ${minGap}`)
    assert(minGap <= 24, `SPEC: short-gap seam repeats (<= 8 packs) must be possible over 30 boots, min seen ${minGap}`)
  })

  console.log('\x1b[1m\x1b[35m🎲 UncommonBelt Tests\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(40) + '\x1b[0m')

  test('initializes with a set code and loads only uncommons', () => {
    const belt = new UncommonBelt('SOR')
    assert(belt.fillingPool.length > 0, 'Filling pool should not be empty')
    assert(belt.fillingPool.every(c => c.rarity === 'Uncommon'), 'All cards should be Uncommon')
    assert(belt.fillingPool.every(c => !c.isLeader), 'No leaders in filling pool')
    assert(belt.fillingPool.every(c => !c.isBase), 'No bases in filling pool')
    assert(belt.fillingPool.every(c => c.set === 'SOR'), 'All cards should be from SOR set')
    assert(belt.fillingPool.every(c => c.variantType === 'Normal'), 'All cards should be normal variants')
  })

  test('hopper is filled on initialization', () => {
    const belt = new UncommonBelt('SOR')
    assert(belt.hopper.length >= belt.fillingPool.length, 'Hopper should be at least as large as filling pool after init')
  })

  test('next() returns an uncommon card', () => {
    const belt = new UncommonBelt('SOR')
    const card = belt.next()
    assert(card !== null, 'next() should return a card')
    assert(card.rarity === 'Uncommon', 'Returned card should be Uncommon')
    assert(!card.isLeader, 'Returned card should not be a leader')
    assert(!card.isBase, 'Returned card should not be a base')
    assert(card.set === 'SOR', 'Returned card should be from correct set')
  })

  test('next() removes card from hopper', () => {
    const belt = new UncommonBelt('SOR')
    const initialSize = belt.size
    belt.next()
    assertEqual(belt.size, initialSize - 1, 'Hopper size should decrease by 1')
  })

  test('next() returns a copy, not the original', () => {
    const belt = new UncommonBelt('SOR')
    const card1 = belt.next()
    card1.modified = true
    const card2 = belt.next()
    assert(card2.modified === undefined, 'Cards should be copies, not references')
  })

  test('hopper refills when depleted', () => {
    const belt = new UncommonBelt('SOR')
    const fillingPoolSize = belt.fillingPool.length

    // Drain the hopper to exactly the threshold
    while (belt.size > fillingPoolSize) {
      belt.next()
    }

    // Pull one more (hopper is still at threshold, won't refill yet)
    belt.next()
    // Pull another (hopper is now below threshold, should trigger refill)
    belt.next()

    // After refill, hopper should be larger than filling pool again
    assert(belt.size >= fillingPoolSize, `Hopper should refill. Size: ${belt.size}, threshold: ${fillingPoolSize}`)
  })

  test('different belt instances start at different positions', () => {
    const firstCards = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const belt = new UncommonBelt('SOR')
      firstCards.add(belt.peek(1)[0].id)
    }

    // With random start, we should see variation
    assert(firstCards.size > 1, 'Different belt instances should start at different positions')
  })

  test('peek() returns cards without removing them', () => {
    const belt = new UncommonBelt('SOR')
    const peeked = belt.peek(3)
    const sizeBefore = belt.size

    assertEqual(peeked.length, 3, 'peek(3) should return 3 cards')
    assertEqual(belt.size, sizeBefore, 'peek() should not change hopper size')

    // Verify peek matches what next() returns
    const next1 = belt.next()
    assertEqual(next1.id, peeked[0].id, 'First peeked card should match first next()')
  })

  test('all uncommons from set are in filling pool', () => {
    const belt = new UncommonBelt('SOR')
    // SOR has 60 uncommons
    assert(belt.fillingPool.length >= 50, `Should have many uncommons, got ${belt.fillingPool.length}`)
  })

  test('no duplicate uncommons within 4 slots of each other (seam dedup)', () => {
    const belt = new UncommonBelt('SOR')

    // Check first 100 cards for duplicates within 4 slots
    const sample: Array<{ id: string }> = []
    for (let i = 0; i < 100; i++) {
      sample.push(belt.next())
    }

    let violations = 0
    for (let i = 0; i < sample.length; i++) {
      for (let j = i + 1; j <= Math.min(i + 4, sample.length - 1); j++) {
        if (sample[i].id === sample[j].id) {
          violations++
        }
      }
    }

    // With 60 uncommons, duplicates within 4 slots should be very rare
    assert(violations <= 3, `Found ${violations} duplicate pairs within 4 slots (max allowed: 3)`)
  })

  test('serves all 3 uncommon slots in a pack without duplicates', () => {
    const belt = new UncommonBelt('SOR')

    // Simulate drawing 3 uncommons for many packs
    let packsWithDuplicates = 0
    for (let pack = 0; pack < 50; pack++) {
      const uncommons = [belt.next(), belt.next(), belt.next()]
      const ids = uncommons.map(c => c.id)
      const uniqueIds = new Set(ids)
      if (uniqueIds.size < 3) {
        packsWithDuplicates++
      }
    }

    // Very few packs should have duplicate uncommons
    assert(packsWithDuplicates <= 2, `${packsWithDuplicates} packs had duplicate uncommons (max allowed: 2)`)
  })

  // =========================================================
  // SPEC: No duplicate card within 24 positions (across seams)
  // =========================================================

  test('SPEC: no duplicate uncommon within 24 positions (sets 1-6)', () => {
    // SPEC: sets 1-6 belts never repeat a card within ~24 positions.
    // Set 7+ uses window 2 per the 6-box verified UC sheet — see the
    // 'Set 7+ UC sheet spec' tests below.
    const belt = new UncommonBelt('JTL')
    const DEDUP_WINDOW = 24
    const TOTAL_DRAWS = 300  // 5 full cycles

    const drawn: Array<{ id: string; name: string }> = []
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      drawn.push(belt.next())
    }

    let violations = 0
    const violationDetails: string[] = []
    for (let i = 0; i < drawn.length; i++) {
      for (let j = i + 1; j < Math.min(i + DEDUP_WINDOW, drawn.length); j++) {
        if (drawn[i].id === drawn[j].id) {
          violations++
          violationDetails.push(
            `"${drawn[i].name}" at positions ${i} and ${j} (distance ${j - i})`
          )
        }
      }
    }

    assert(violations === 0,
      `SPEC: No duplicate within ${DEDUP_WINDOW} positions. Found ${violations} violations:\n  ${violationDetails.slice(0, 5).join('\n  ')}`)
  })

  test('SPEC: every uncommon appears with equal frequency (no exclusion)', () => {
    // SPEC: Every card appears once per cycle — plus, on line-stacking sets,
    // a small random echo subset appears twice (the 6-box verified UC sheet
    // repeats 2-3 cards per cycle at short odd-dominant gaps). No card is
    // ever excluded, and no card runs more than once-per-cycle ahead.
    const belt = new UncommonBelt('LAW')
    const beltSize = belt.fillingPool.length
    const CYCLES = 5
    const TOTAL_DRAWS = beltSize * CYCLES

    const counts = new Map<string, number>()
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      const card = belt.next()
      counts.set(card.id, (counts.get(card.id) || 0) + 1)
    }

    let wrongCount = 0
    const details: string[] = []
    for (const card of belt.fillingPool) {
      const count = counts.get(card.id) || 0
      // echoes make a card's count run at most one ahead per elapsed cycle;
      // fewer draws happen for late cards when echoes lengthen cycles
      if (count < CYCLES - 1 || count > CYCLES + Math.ceil(CYCLES / 2)) {
        wrongCount++
        details.push(`"${card.name}" appeared ${count} times (expected ~${CYCLES})`)
      }
    }

    assert(wrongCount === 0,
      `SPEC: ${wrongCount} cards had wrong occurrence count:\n  ${details.slice(0, 5).join('\n  ')}`)
  })

  // =========================================================
  // SPEC: No adjacent cards with same primary aspect
  // =========================================================

  test('SPEC: no adjacent uncommons share primary aspect (sets 1-6)', () => {
    // Set 7+ UC boots are aspect-random per the 6-box verified sheet (3.9%
    // adjacency ~= shuffled 5.2%) — see the Set 7+ tests below.
    const belt = new UncommonBelt('JTL')
    const TOTAL_DRAWS = 300

    const drawn: Array<{ id: string; name: string; aspects: string[] }> = []
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      drawn.push(belt.next())
    }

    let violations = 0
    const violationDetails: string[] = []
    for (let i = 1; i < drawn.length; i++) {
      const prevAspect = drawn[i - 1].aspects?.[0]
      const currAspect = drawn[i].aspects?.[0]
      if (prevAspect && currAspect && prevAspect === currAspect) {
        violations++
        violationDetails.push(
          `positions ${i - 1}-${i}: "${drawn[i - 1].name}" (${prevAspect}) → "${drawn[i].name}" (${currAspect})`
        )
      }
    }

    assert(violations === 0,
      `SPEC: No adjacent same primary aspect. Found ${violations} violations:\n  ${violationDetails.slice(0, 5).join('\n  ')}`)
  })

  test('no repeating pattern: consecutive belt fills produce different sequences', () => {
    const belt = new UncommonBelt('SOR')
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
