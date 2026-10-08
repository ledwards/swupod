// @ts-nocheck
/**
 * Bot Behavior Tests
 *
 * Tests for the bot behavior system.
 * Run with: npx tsx src/bots/behaviors/behaviors.test.ts
 */

import { getBehavior, behaviors, DEFAULT_BEHAVIOR } from './index'
import { RandomBehavior } from './RandomBehavior'
import { PopularLeaderBehavior } from './PopularLeaderBehavior'

// Test utilities
let passed = 0
let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`\x1b[32m✅ ${name}\x1b[0m`)
    passed++
  } catch (e) {
    console.log(`\x1b[31m❌ ${name}\x1b[0m`)
    console.log(`   ${(e as Error).message}`)
    failed++
  }
}

function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) throw new Error(message || 'Assertion failed')
}

// Mock data
interface MockLeader {
  id: string
  name: string
  set: string
  aspects: string[]
}

interface MockCard {
  id: string
  name: string
  type: string
  rarity: string
  aspects: string[]
  cost: number
  power?: number
  hp?: number
}

const mockLeadersSOR: MockLeader[] = [
  { id: 'SOR-014', name: 'Sabine Wren', set: 'SOR', aspects: ['Aggression', 'Heroism'] },
  { id: 'SOR-015', name: 'Boba Fett', set: 'SOR', aspects: ['Cunning', 'Villainy'] },
  { id: 'SOR-017', name: 'Han Solo', set: 'SOR', aspects: ['Cunning', 'Heroism'] },
  { id: 'SOR-007', name: 'Grand Moff Tarkin', set: 'SOR', aspects: ['Command', 'Villainy'] },
]

const mockPack: MockCard[] = [
  { id: 'SOR-100', name: 'Stormtrooper', type: 'Unit', rarity: 'Common', aspects: ['Villainy'], cost: 2, power: 2, hp: 2 },
  { id: 'SOR-101', name: 'Vanquish', type: 'Event', rarity: 'Rare', aspects: ['Aggression'], cost: 5 },
  { id: 'SOR-102', name: 'Wing Leader', type: 'Unit', rarity: 'Uncommon', aspects: ['Aggression', 'Heroism'], cost: 3, power: 3, hp: 3 },
  { id: 'SOR-103', name: 'Random Event', type: 'Event', rarity: 'Common', aspects: ['Cunning'], cost: 2 },
  { id: 'SOR-104', name: 'Neutral Unit', type: 'Unit', rarity: 'Common', aspects: [], cost: 2, power: 2, hp: 2 },
]

console.log('\n\x1b[1m\x1b[35m🤖 Bot Behavior Tests\x1b[0m')
console.log('\x1b[35m======================\x1b[0m\n')

// Behavior Registry Tests
console.log('\x1b[36mBehavior Registry\x1b[0m')
test('getBehavior returns default behavior', () => {
  const behavior = getBehavior()
  assert(behavior !== null, 'Behavior should not be null')
  assert(behavior.name === DEFAULT_BEHAVIOR, `Should return ${DEFAULT_BEHAVIOR}`)
})

test('getBehavior returns random behavior by name', () => {
  const behavior = getBehavior('random')
  assert(behavior instanceof RandomBehavior, 'Should be RandomBehavior')
  assert(behavior.name === 'random', 'Name should be random')
})

test('getBehavior returns popularLeader behavior by name', () => {
  const behavior = getBehavior('popularLeader')
  assert(behavior instanceof PopularLeaderBehavior, 'Should be PopularLeaderBehavior')
  assert(behavior.name === 'popularLeader', 'Name should be popularLeader')
})

test('getBehavior falls back to random for unknown behavior', () => {
  const behavior = getBehavior('nonexistent')
  assert(behavior instanceof RandomBehavior, 'Should fall back to RandomBehavior')
})

// Random Behavior Tests
console.log('\n\x1b[36mRandom Behavior\x1b[0m')
test('RandomBehavior.selectLeader picks from available leaders', () => {
  const behavior = new RandomBehavior()
  const leader = behavior.selectLeader(mockLeadersSOR)
  assert(leader !== null, 'Should return a leader')
  assert(mockLeadersSOR.some(l => l.id === leader.id), 'Should be from available leaders')
})

test('RandomBehavior.selectCard prefers higher rarity', () => {
  const behavior = new RandomBehavior()
  const card = behavior.selectCard(mockPack)
  assert(card !== null, 'Should return a card')
  assert(card.rarity === 'Rare', 'Should pick the rare card (Vanquish)')
})

test('RandomBehavior handles empty arrays', () => {
  const behavior = new RandomBehavior()
  assert(behavior.selectLeader([]) === null, 'Empty leaders should return null')
  assert(behavior.selectCard([]) === null, 'Empty pack should return null')
})

// Popular Leader Behavior Tests
console.log('\n\x1b[36mPopular Leader Behavior\x1b[0m')
test('PopularLeaderBehavior.selectLeader picks highest ranked leader', () => {
  const behavior = new PopularLeaderBehavior()
  const leader = behavior.selectLeader(mockLeadersSOR, { setCode: 'SOR' })
  assert(leader !== null, 'Should return a leader')
  // Boba Fett is #1 for SOR in leaderRankings.ts
  assert(leader.name === 'Boba Fett', `Should pick Boba Fett (got ${leader.name})`)
})

test('PopularLeaderBehavior.selectLeader picks from remaining if top not available', () => {
  const behavior = new PopularLeaderBehavior()
  const limitedLeaders = mockLeadersSOR.filter(l => l.name !== 'Boba Fett')
  const leader = behavior.selectLeader(limitedLeaders, { setCode: 'SOR' })
  assert(leader !== null, 'Should return a leader')
  // Sabine Wren is #3 for SOR (after Boba Fett, IG-88 who isn't in the mock)
  assert(leader.name === 'Sabine Wren', `Should pick Sabine Wren (got ${leader.name})`)
})

test('PopularLeaderBehavior.selectCard favors in-color units', () => {
  const behavior = new PopularLeaderBehavior()
  // Give the bot Sabine (Aggression/Heroism)
  const context = {
    draftedLeaders: [{ name: 'Sabine Wren', aspects: ['Aggression', 'Heroism'] }],
    setCode: 'SOR'
  }
  const card = behavior.selectCard(mockPack, context)
  assert(card !== null, 'Should return a card')
  // Should pick Wing Leader (Uncommon, Aggression/Heroism unit, dual-aspect)
  // or Vanquish (Rare, Aggression, high-value) - both are good picks
  assert(
    card.name === 'Wing Leader' || card.name === 'Vanquish',
    `Should pick in-color card (got ${card.name})`
  )
})

test('PopularLeaderBehavior.selectCard prefers units over non-units', () => {
  const behavior = new PopularLeaderBehavior()
  // Create a pack with same rarity unit vs event
  const testPack = [
    { id: '1', name: 'Unit Card', type: 'Unit', rarity: 'Common', aspects: ['Aggression'], cost: 2, power: 2, hp: 2 },
    { id: '2', name: 'Event Card', type: 'Event', rarity: 'Common', aspects: ['Aggression'], cost: 2 },
  ]
  const context = {
    draftedLeaders: [{ name: 'Sabine Wren', aspects: ['Aggression', 'Heroism'] }],
    setCode: 'SOR'
  }
  const card = behavior.selectCard(testPack, context)
  assert(card.type === 'Unit', `Should prefer unit (got ${card.type})`)
})

test('PopularLeaderBehavior.selectCard gives bonus to dual-aspect cards', () => {
  const behavior = new PopularLeaderBehavior()
  // Create a pack with single vs dual aspect
  const testPack = [
    { id: '1', name: 'Single Aspect', type: 'Unit', rarity: 'Common', aspects: ['Aggression'], cost: 2, power: 2, hp: 2 },
    { id: '2', name: 'Dual Aspect', type: 'Unit', rarity: 'Common', aspects: ['Aggression', 'Heroism'], cost: 2, power: 2, hp: 2 },
  ]
  const context = {
    draftedLeaders: [{ name: 'Sabine Wren', aspects: ['Aggression', 'Heroism'] }],
    setCode: 'SOR'
  }
  const card = behavior.selectCard(testPack, context)
  assert(card.name === 'Dual Aspect', `Should prefer dual-aspect (got ${card.name})`)
})

test('PopularLeaderBehavior handles empty arrays', () => {
  const behavior = new PopularLeaderBehavior()
  assert(behavior.selectLeader([]) === null, 'Empty leaders should return null')
  assert(behavior.selectCard([]) === null, 'Empty pack should return null')
})

test('PopularLeaderBehavior can reset state', () => {
  const behavior = new PopularLeaderBehavior()
  behavior.secondaryColor = 'Command'
  behavior.reset()
  assert(behavior.secondaryColor === null, 'Reset should clear secondary color')
})

// Comprehensive leader ranking tests
console.log('\n\x1b[36mLeader Ranking Tests\x1b[0m')

test('SOR: Boba Fett is #1 pick when available', () => {
  const behavior = new PopularLeaderBehavior()
  const allSORLeaders = [
    { id: 'SOR-018', name: 'Jyn Erso', set: 'SOR', aspects: ['Cunning', 'Heroism'] },
    { id: 'SOR-014', name: 'Sabine Wren', set: 'SOR', aspects: ['Aggression', 'Heroism'] },
    { id: 'SOR-015', name: 'Boba Fett', set: 'SOR', aspects: ['Cunning', 'Villainy'] },
    { id: 'SOR-007', name: 'Grand Moff Tarkin', set: 'SOR', aspects: ['Command', 'Villainy'] },
    { id: 'SOR-010', name: 'Darth Vader', set: 'SOR', aspects: ['Aggression', 'Villainy'] },
  ]
  const leader = behavior.selectLeader(allSORLeaders, { setCode: 'SOR' })
  assert(leader.name === 'Boba Fett', `Expected Boba Fett, got ${leader.name}`)
})

test('SOR: Picks in ranking order (Boba > Sabine > Tarkin > Jyn > Darth Vader)', () => {
  const behavior = new PopularLeaderBehavior()

  // Simulate drafting - each pick removes the selected leader
  let available: MockLeader[] = [
    { id: 'SOR-018', name: 'Jyn Erso', set: 'SOR', aspects: ['Cunning', 'Heroism'] },
    { id: 'SOR-014', name: 'Sabine Wren', set: 'SOR', aspects: ['Aggression', 'Heroism'] },
    { id: 'SOR-015', name: 'Boba Fett', set: 'SOR', aspects: ['Cunning', 'Villainy'] },
    { id: 'SOR-007', name: 'Grand Moff Tarkin', set: 'SOR', aspects: ['Command', 'Villainy'] },
    { id: 'SOR-010', name: 'Darth Vader', set: 'SOR', aspects: ['Aggression', 'Villainy'] },
  ]

  // Expected order matches leaderRankings.ts: Boba Fett, Sabine Wren, Grand Moff Tarkin, Jyn Erso, Darth Vader
  const expectedOrder = ['Boba Fett', 'Sabine Wren', 'Grand Moff Tarkin', 'Jyn Erso', 'Darth Vader']
  const actualOrder: string[] = []

  for (let i = 0; i < 5; i++) {
    const pick = behavior.selectLeader(available, { setCode: 'SOR' })
    actualOrder.push(pick.name)
    available = available.filter(l => l.id !== pick.id)
  }

  assert(
    JSON.stringify(actualOrder) === JSON.stringify(expectedOrder),
    `Expected order ${expectedOrder.join(' > ')}, got ${actualOrder.join(' > ')}`
  )
})

test('SHD: Cad Bane is #1 pick when available (from ranking data)', () => {
  const behavior = new PopularLeaderBehavior()
  const shdLeaders = [
    { id: 'SHD-013', name: 'Han Solo', set: 'SHD', aspects: ['Aggression', 'Heroism'] },
    { id: 'SHD-008', name: 'Boba Fett', set: 'SHD', aspects: ['Command', 'Heroism'] },
    { id: 'SHD-014', name: 'Cad Bane', set: 'SHD', aspects: ['Cunning', 'Villainy'] },
  ]
  const leader = behavior.selectLeader(shdLeaders, { setCode: 'SHD' })
  assert(leader.name === 'Cad Bane', `Expected Cad Bane, got ${leader.name}`)
})

test('TWI: Anakin Skywalker is top pick from available (from ranking data)', () => {
  const behavior = new PopularLeaderBehavior()
  const twiLeaders = [
    { id: 'TWI-004', name: 'Yoda', set: 'TWI', aspects: ['Vigilance', 'Heroism'] },
    { id: 'TWI-012', name: 'Anakin Skywalker', set: 'TWI', aspects: ['Aggression', 'Heroism'] },
    { id: 'TWI-018', name: 'Quinlan Vos', set: 'TWI', aspects: ['Cunning', 'Heroism'] },
  ]
  const leader = behavior.selectLeader(twiLeaders, { setCode: 'TWI' })
  // Anakin is ranked #4 in TWI, Quinlan #7, Yoda #10
  assert(leader.name === 'Anakin Skywalker', `Expected Anakin Skywalker, got ${leader.name}`)
})

test('JTL: Darth Vader is top pick from available (from ranking data)', () => {
  const behavior = new PopularLeaderBehavior()
  const jtlLeaders = [
    { id: 'JTL-013', name: 'Poe Dameron', set: 'JTL', aspects: ['Aggression', 'Heroism'] },
    { id: 'JTL-006', name: 'Darth Vader', set: 'JTL', aspects: ['Command', 'Villainy'] },
    { id: 'JTL-017', name: 'Han Solo', set: 'JTL', aspects: ['Cunning', 'Heroism'] },
  ]
  const leader = behavior.selectLeader(jtlLeaders, { setCode: 'JTL' })
  // Darth Vader is ranked #5 in JTL, Poe #14, Han #15
  assert(leader.name === 'Darth Vader', `Expected Darth Vader, got ${leader.name}`)
})

test('LOF: Rey is #1 pick when available', () => {
  const behavior = new PopularLeaderBehavior()
  const lofLeaders = [
    { id: 'LOF-012', name: 'Rey', set: 'LOF', aspects: ['Aggression', 'Heroism'] },
    { id: 'LOF-009', name: 'Darth Maul', set: 'LOF', aspects: ['Aggression', 'Villainy'] },
    { id: 'LOF-003', name: 'Ahsoka Tano', set: 'LOF', aspects: ['Vigilance', 'Heroism'] },
  ]
  const leader = behavior.selectLeader(lofLeaders, { setCode: 'LOF' })
  assert(leader.name === 'Rey', `Expected Rey, got ${leader.name}`)
})

test('SEC: Leia Organa is #1 pick when available', () => {
  const behavior = new PopularLeaderBehavior()
  const secLeaders = [
    { id: 'SEC-004', name: 'Leia Organa', set: 'SEC', aspects: ['Vigilance', 'Heroism'] },
    { id: 'SEC-001', name: 'Chancellor Palpatine', set: 'SEC', aspects: ['Vigilance', 'Villainy'] },
    { id: 'SEC-012', name: 'Cassian Andor', set: 'SEC', aspects: ['Aggression', 'Heroism'] },
  ]
  const leader = behavior.selectLeader(secLeaders, { setCode: 'SEC' })
  assert(leader.name === 'Leia Organa', `Expected Leia Organa, got ${leader.name}`)
})

test('Unranked leaders fall to the end', () => {
  const behavior = new PopularLeaderBehavior()
  const mixedLeaders = [
    { id: 'FAKE-001', name: 'Fake Leader', set: 'SOR', aspects: ['Aggression', 'Heroism'] },
    { id: 'SOR-018', name: 'Jyn Erso', set: 'SOR', aspects: ['Cunning', 'Heroism'] },
  ]
  const leader = behavior.selectLeader(mixedLeaders, { setCode: 'SOR' })
  // Jyn Erso is ranked (last), Fake Leader is unranked
  assert(leader.name === 'Jyn Erso', `Expected ranked Jyn Erso over unranked, got ${leader.name}`)
})

// In-color picking tests
console.log('\n\x1b[36mIn-Color Card Selection Tests\x1b[0m')

test('Bot strongly prefers in-color cards over off-color cards', () => {
  const behavior = new PopularLeaderBehavior()
  // Sabine is Aggression/Heroism
  const context = {
    draftedLeaders: [{ name: 'Sabine Wren', aspects: ['Aggression', 'Heroism'] }],
    setCode: 'SOR'
  }

  // Off-color rare vs in-color common - should pick in-color
  // Use pure Villainy (alignment only) so it can't match any secondary color
  const pack = [
    { id: '1', name: 'Off-Color Rare', type: 'Unit', rarity: 'Rare', aspects: ['Villainy'], cost: 3, power: 4, hp: 4 },
    { id: '2', name: 'In-Color Common', type: 'Unit', rarity: 'Common', aspects: ['Aggression'], cost: 2, power: 2, hp: 2 },
  ]

  const card = behavior.selectCard(pack, context)
  assert(card.name === 'In-Color Common', `Should pick in-color common over off-color rare, got ${card.name}`)
})

test('Bot picks in-color over neutral when same rarity/type', () => {
  const behavior = new PopularLeaderBehavior()
  const context = {
    draftedLeaders: [{ name: 'Sabine Wren', aspects: ['Aggression', 'Heroism'] }],
    setCode: 'SOR'
  }

  const pack = [
    { id: '1', name: 'Neutral Unit', type: 'Unit', rarity: 'Common', aspects: [], cost: 2, power: 2, hp: 2 },
    { id: '2', name: 'Aggression Unit', type: 'Unit', rarity: 'Common', aspects: ['Aggression'], cost: 2, power: 2, hp: 2 },
  ]

  const card = behavior.selectCard(pack, context)
  assert(card.name === 'Aggression Unit', `Should pick in-color over neutral, got ${card.name}`)
})

test('Bot consistently picks cards matching leader aspects over 10 picks', () => {
  const behavior = new PopularLeaderBehavior()
  // Darth Vader is Aggression/Villainy
  const context = {
    draftedLeaders: [{ name: 'Darth Vader', aspects: ['Aggression', 'Villainy'] }],
    setCode: 'SOR'
  }

  let inColorPicks = 0
  const totalPicks = 10

  for (let i = 0; i < totalPicks; i++) {
    // Each pack has mix of in-color and off-color
    const pack = [
      { id: `off-${i}`, name: 'Off-Color Card', type: 'Unit', rarity: 'Common', aspects: ['Command', 'Heroism'], cost: 2, power: 2, hp: 2 },
      { id: `in-${i}`, name: 'In-Color Card', type: 'Unit', rarity: 'Common', aspects: ['Aggression'], cost: 2, power: 2, hp: 2 },
      { id: `neutral-${i}`, name: 'Neutral Card', type: 'Unit', rarity: 'Common', aspects: [], cost: 2, power: 2, hp: 2 },
    ]

    const card = behavior.selectCard(pack, context)
    if (card.aspects && card.aspects.some((a: string) => ['Aggression', 'Villainy'].includes(a))) {
      inColorPicks++
    }
  }

  // Should pick in-color at least 80% of the time
  const inColorRate = inColorPicks / totalPicks
  assert(inColorRate >= 0.8, `Should pick in-color 80%+ of time, got ${inColorRate * 100}%`)
})

test('Bot with multiple leaders uses combined aspects', () => {
  const behavior = new PopularLeaderBehavior()
  // Two leaders with different aspects
  const context = {
    draftedLeaders: [
      { name: 'Sabine Wren', aspects: ['Aggression', 'Heroism'] },
      { name: 'Boba Fett', aspects: ['Cunning', 'Villainy'] },
    ],
    setCode: 'SOR'
  }

  // Card that matches second leader but not first
  const pack = [
    { id: '1', name: 'Cunning Card', type: 'Unit', rarity: 'Common', aspects: ['Cunning'], cost: 2, power: 2, hp: 2 },
    { id: '2', name: 'Vigilance Card', type: 'Unit', rarity: 'Common', aspects: ['Vigilance'], cost: 2, power: 2, hp: 2 },
  ]

  const card = behavior.selectCard(pack, context)
  // Cunning matches Boba Fett, Vigilance matches neither
  assert(card.name === 'Cunning Card', `Should pick card matching any leader's aspect, got ${card.name}`)
})

// Summary
console.log('\n\x1b[35m======================\x1b[0m')
console.log(`\x1b[32m✅ Tests passed: ${passed}\x1b[0m`)
if (failed > 0) {
  console.log(`\x1b[31m❌ Tests failed: ${failed}\x1b[0m`)
}
console.log('')

if (failed > 0) {
  console.log('\x1b[31m\x1b[1m💥 TESTS FAILED\x1b[0m\n')
  process.exit(1)
} else {
  console.log('\x1b[32m\x1b[1m🎉 ALL TESTS PASSED!\x1b[0m\n')
}
