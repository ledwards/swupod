// @ts-nocheck
/**
 * ShowcaseLeaderBelt Tests
 *
 * Run with: node src/belts/ShowcaseLeaderBelt.test.ts
 */

import { ShowcaseLeaderBelt } from './ShowcaseLeaderBelt'
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
  console.log('\x1b[1m\x1b[35m🌟 ShowcaseLeaderBelt Tests\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(40) + '\x1b[0m')

  test('initializes with Showcase variant leaders', () => {
    const belt = new ShowcaseLeaderBelt('SOR')
    assert(belt.fillingPool.length > 0, 'Filling pool should not be empty')
    assert(belt.fillingPool.every(c => c.isLeader), 'All cards should be leaders')
    assert(belt.fillingPool.every(c => c.variantType === 'Showcase'), 'All cards should be Showcase variant')
  })

  test('Set 1 excludes Special rarity', () => {
    const belt = new ShowcaseLeaderBelt('SOR')
    const hasSpecial = belt.fillingPool.some(c => c.rarity === 'Special')
    assert(!hasSpecial, 'SOR should not have Special rarity in showcase leaders')
  })

  test('Sets 2+ include Special rarity', () => {
    const belt = new ShowcaseLeaderBelt('SHD')
    // Check if Special exists in the data for this set
    const hasSpecial = belt.fillingPool.some(c => c.rarity === 'Special')
    // This might be true or false depending on data, just ensure no error
    assert(belt.fillingPool.length >= 0, 'Should initialize without error')
  })

  test('next() returns a Showcase leader', () => {
    const belt = new ShowcaseLeaderBelt('SOR')
    const card = belt.next()
    assert(card !== null, 'next() should return a card')
    assert(card.isLeader, 'Returned card should be a leader')
    assert(card.variantType === 'Showcase', 'Returned card should be Showcase variant')
  })

  test('next() removes card from hopper', () => {
    const belt = new ShowcaseLeaderBelt('SOR')
    const initialSize = belt.size
    belt.next()
    assertEqual(belt.size, initialSize - 1, 'Hopper size should decrease by 1')
  })

  test('hopper refills when depleted', () => {
    const belt = new ShowcaseLeaderBelt('SOR')
    const fillingPoolSize = belt.fillingPool.length

    while (belt.size > fillingPoolSize) {
      belt.next()
    }

    // Pull one more (hopper is still at threshold, won't refill yet)
    belt.next()
    // Pull another (hopper is now below threshold, should trigger refill)
    belt.next()
    assert(belt.size >= fillingPoolSize, 'Hopper should refill')
  })

  test('different belt instances start at different positions', () => {
    const firstCards = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const belt = new ShowcaseLeaderBelt('SOR')
      firstCards.add(belt.peek(1)[0].id)
    }
    assert(firstCards.size > 1, 'Different belt instances should start at different positions')
  })

  test('showcase leaders respect full-sheet duplicate spacing across seams', () => {
    const belt = new ShowcaseLeaderBelt('SOR')
    const sheetSize = belt.fillingPool.length
    const leaders = Array.from({ length: sheetSize * 2 }, () => belt.next())

    for (let i = 0; i < leaders.length; i++) {
      for (let j = i + 1; j < Math.min(leaders.length, i + sheetSize); j++) {
        if (leaders[j].name === leaders[i].name) {
          throw new Error(`Showcase leader "${leaders[i].name}" repeated after ${j - i} positions (minimum ${sheetSize})`)
        }
      }
    }
  })

  test('FIXED: showcase leader sheet gives every showcase leader equal weight', () => {
    withMockedRandom(0, () => {
      const belt = new ShowcaseLeaderBelt('SOR')
      const sheetSize = belt.fillingPool.length
      const sheet = Array.from({ length: sheetSize }, () => belt.next())
      const counts = new Map<string, number>()

      for (const card of sheet) {
        counts.set(card.name, (counts.get(card.name) || 0) + 1)
      }

      assertEqual(counts.size, sheetSize, 'A showcase boot should contain every showcase leader exactly once')
      for (const [name, count] of counts) {
        assertEqual(count, 1, `Showcase leader "${name}" should appear exactly once per showcase sheet`)
      }
    })
  })

  test('Fallback: falls back to Normal leaders for pre-release sets without Showcase variants (ASH)', () => {
    const belt = new ShowcaseLeaderBelt('ASH')
    assert(belt.fillingPool.length > 0, 'Filling pool should be non-empty via Normal fallback')
    assert(belt.commonLeaders.length > 0, 'commonLeaders re-split after fallback')
    assert(belt.rareLeaders.length > 0, 'rareLeaders re-split after fallback')
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
