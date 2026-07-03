// @ts-nocheck
/**
 * LeaderBelt Tests
 *
 * Run with: node src/belts/LeaderBelt.test.ts
 */

import { LeaderBelt } from './LeaderBelt'
import { initializeCardCache, getCachedCards } from '../utils/cardCache'

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

function withMockedRandom<T>(value: number, fn: () => T): T {
  const originalRandom = Math.random
  Math.random = () => value
  try {
    return fn()
  } finally {
    Math.random = originalRandom
  }
}

async function runTests(): Promise<void> {
  console.log('\x1b[36m🔄 Initializing card cache...\x1b[0m')
  await initializeCardCache()
  console.log('')
  console.log('\x1b[1m\x1b[35m👑 LeaderBelt Tests\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(40) + '\x1b[0m')

  test('initializes with a set code and loads leaders', () => {
    const belt = new LeaderBelt('SOR')
    assert(belt.commonLeaders.length > 0, 'Should have common leaders')
    assert(belt.rareLeaders.length > 0, 'Should have rare leaders')
    assert(belt.commonLeaders.every(c => c.isLeader), 'All common leaders should be leaders')
    assert(belt.rareLeaders.every(c => c.isLeader), 'All rare leaders should be leaders')
    assert(belt.commonLeaders.every(c => c.set === 'SOR'), 'All common leaders should be from SOR set')
    assert(belt.commonLeaders.every(c => c.variantType === 'Normal'), 'All leaders should be normal variants')
  })

  test('separates leaders into common and rare', () => {
    const belt = new LeaderBelt('SOR')
    assert(belt.commonLeaders.length > 0, 'Should have common leaders')
    assert(belt.rareLeaders.length > 0, 'Should have rare leaders')
    assert(belt.commonLeaders.every(c => c.rarity === 'Common'), 'Common leaders should all be Common rarity')
    assert(belt.rareLeaders.every(c => c.rarity === 'Rare'), 'Rare leaders should all be Rare rarity')
  })

  test('hopper is initialized from a full leader sheet boot', () => {
    const belt = new LeaderBelt('SOR')
    assertEqual(belt.hopper.length, 56, 'SOR leader boot should have 56 cards: 8 commons x6 + 8 rares x1')
  })

  test('next() returns a leader card', () => {
    const belt = new LeaderBelt('SOR')
    const card = belt.next()
    assert(card !== null, 'next() should return a card')
    assert(card.isLeader, 'Returned card should be a leader')
    assert(card.set === 'SOR', 'Returned card should be from correct set')
  })

  test('next() advances through the leader sheet hopper', () => {
    const belt = new LeaderBelt('SOR')
    const upcoming = belt.peek(10).map(card => card.id)
    const drawn: string[] = []

    for (let i = 0; i < 10; i++) {
      drawn.push(belt.next().id)
    }

    assertEqual(drawn.join(','), upcoming.join(','), 'next() should serve cards sequentially from the leader sheet hopper')
  })

  test('next() returns a copy, not the original', () => {
    const belt = new LeaderBelt('SOR')
    const card1 = belt.next()
    card1.modified = true
    // Get another card and check it doesn't have the modification
    const card2 = belt.next()
    assert(card2.modified === undefined, 'Cards should be copies, not references')
  })

  test('hopper refills when exhausted', () => {
    const belt = new LeaderBelt('SOR')
    const bootSize = 56

    while (belt.size > bootSize) belt.next()
    belt.next()
    belt.next()

    assert(belt.size >= bootSize, `Hopper should refill to at least one full boot, got ${belt.size}`)
  })

  test('FIXED: leader sheet boot prints six of each common and one of each rare', () => {
    withMockedRandom(0, () => {
      const belt = new LeaderBelt('SOR')
      const sheet = Array.from({ length: 56 }, () => belt.next())
      const commonLeaders = sheet.filter(card => card.rarity === 'Common')
      const rareLeaders = sheet.filter(card => card.rarity === 'Rare')

      assertEqual(commonLeaders.length, 48, 'SOR leader sheet should print 48 common leader positions')
      assertEqual(rareLeaders.length, 8, 'SOR leader sheet should print 8 rare leader positions')

      const commonCounts = new Map<string, number>()
      for (const card of commonLeaders) {
        commonCounts.set(card.name, (commonCounts.get(card.name) || 0) + 1)
      }
      for (const [name, count] of commonCounts) {
        assertEqual(count, 6, `Common leader "${name}" should appear exactly 6 times per sheet`)
      }

      const rareCounts = new Map<string, number>()
      for (const card of rareLeaders) {
        rareCounts.set(card.name, (rareCounts.get(card.name) || 0) + 1)
      }
      for (const [name, count] of rareCounts) {
        assertEqual(count, 1, `Rare leader "${name}" should appear exactly once per sheet`)
      }
    })
  })

  test('FIXED: rare leaders do not repeat within a 24-position window across seams', () => {
    withMockedRandom(0, () => {
      const belt = new LeaderBelt('ASH')
      const leaders = Array.from({ length: 112 }, () => belt.next())

      for (let start = 0; start <= leaders.length - 24; start++) {
        const window = leaders.slice(start, start + 24)
        const rareCounts = new Map<string, number>()
        for (const leader of window) {
          if (leader.rarity === 'Rare') {
            rareCounts.set(leader.name, (rareCounts.get(leader.name) || 0) + 1)
          }
        }
        for (const [name, count] of rareCounts) {
          assertEqual(count, 1, `Rare leader "${name}" repeated ${count} times in 24-position window starting at ${start}`)
        }
      }
    })
  })

  test('no immediately adjacent duplicate leaders', () => {
    const belt = new LeaderBelt('SOR')

    // Check first 100 cards for immediately adjacent duplicates
    const sample: Array<{ name: string }> = []
    for (let i = 0; i < 100; i++) {
      sample.push(belt.next())
    }

    let violations = 0
    for (let i = 0; i < sample.length - 1; i++) {
      if (sample[i].name === sample[i + 1].name) {
        violations++
      }
    }

    // Should have zero immediate adjacencies (the new design prevents this)
    assertEqual(violations, 0, `Found ${violations} immediately adjacent duplicates (expected 0)`)
  })

  test('different belt instances start at different positions', () => {
    // Create multiple belts and check their first card varies
    const firstCards = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const belt = new LeaderBelt('SOR')
      firstCards.add(belt.next().name)
    }

    // With random shuffle start, we should see variation
    assert(firstCards.size > 1, 'Different belt instances should start at different positions')
  })

  test('FIXED: Set 7+ leader belt allows same-leader repeats at gap 3 (real ASH box 001: common leaders at gaps 3,4,5)', () => {
    // SPEC (LINE_STACKING_COLLATION_PLAN L3): Set 7+ (LAW/ASH) cap the per-card leader
    // dedup min gap at 3, so common-leader repeats CAN occur at line gap 3 (real ASH
    // box 001: common leaders repeat at gaps 3,4,5) but never back-to-back (gap 1-2).
    // Statistical: over ~1000 draws the minimum same-name repeat distance should be
    // <= 5 (a small gap becomes possible) AND >= 2 (never immediately adjacent).
    const belt = new LeaderBelt('ASH')
    const seq: string[] = []
    for (let i = 0; i < 1000; i++) seq.push(belt.next().name)

    const last = new Map<string, number>()
    let minDist = Infinity
    for (let i = 0; i < seq.length; i++) {
      const prev = last.get(seq[i])
      if (prev !== undefined) minDist = Math.min(minDist, i - prev)
      last.set(seq[i], i)
    }

    assert(minDist <= 5,
      `SPEC (Set 7+): ASH leader belt should allow a same-leader repeat at gap <= 5 ` +
      `(real ASH box 001: common leaders at gaps 3,4,5), got min distance ${minDist}`)
    assert(minDist >= 2,
      `SPEC (Set 7+): ASH leader belt must never repeat back-to-back (gap 1), got min distance ${minDist}`)
  })

  test('sets 1-6 leader belt spacing unchanged: SOR same-leader repeats stay >= 6 apart', () => {
    // SPEC: Sets 1-6 keep LEADER_DEDUP_WINDOW=24 behavior. Measured current SOR common
    // leader min repeat gap is 8 (stable across runs); pin a conservative band >= 6 so
    // the Set 7+ cap did NOT touch old sets.
    const belt = new LeaderBelt('SOR')
    const seq: string[] = []
    for (let i = 0; i < 1000; i++) seq.push(belt.next().name)

    const last = new Map<string, number>()
    let minDist = Infinity
    for (let i = 0; i < seq.length; i++) {
      const prev = last.get(seq[i])
      if (prev !== undefined) minDist = Math.min(minDist, i - prev)
      last.set(seq[i], i)
    }

    assert(minDist >= 6,
      `SPEC (Sets 1-6): SOR leader belt should keep same-leader repeats >= 6 apart ` +
      `(measured baseline 8, window 24), got min distance ${minDist}`)
  })

  test('common leader repeats are spaced by sheet placement rules', () => {
    const belt = new LeaderBelt('SOR')
    const leaders = Array.from({ length: 116 }, () => belt.next())
    const minGap = 8

    for (let i = 0; i < leaders.length; i++) {
      if (leaders[i].rarity !== 'Common') continue
      for (let j = i + 1; j < Math.min(leaders.length, i + minGap); j++) {
        if (leaders[j].name === leaders[i].name) {
          throw new Error(`Common leader "${leaders[i].name}" repeated after ${j - i} positions (minimum ${minGap})`)
        }
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
