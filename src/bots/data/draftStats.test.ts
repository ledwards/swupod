// @ts-nocheck
/**
 * Draft Stats Tests
 *
 * Tests for the stats cache module.
 * Run with: npx tsx src/bots/data/draftStats.test.ts
 */

import { hasEnoughData, clearStatsCache, aggregateDeckProfiles } from './draftStats'
import type { SetDraftStats } from './draftStats'

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

console.log('\n\x1b[1m\x1b[35m📊 Draft Stats Tests\x1b[0m')
console.log('\x1b[35m======================\x1b[0m\n')

// --- hasEnoughData tests ---
console.log('\x1b[36mhasEnoughData\x1b[0m')

test('returns false for null stats', () => {
  assert(hasEnoughData(null) === false, 'null stats should not have enough data')
})

test('returns false for stats with fewer than 5 drafts', () => {
  const stats: SetDraftStats = {
    cardStats: new Map(),
    leaderStats: new Map(),
    deckProfiles: new Map(),
    totalDrafts: 3,
    fetchedAt: Date.now(),
  }
  assert(hasEnoughData(stats) === false, '3 drafts should not be enough')
})

test('returns true for stats with exactly 5 drafts', () => {
  const stats: SetDraftStats = {
    cardStats: new Map(),
    leaderStats: new Map(),
    deckProfiles: new Map(),
    totalDrafts: 5,
    fetchedAt: Date.now(),
  }
  assert(hasEnoughData(stats) === true, '5 drafts should be enough')
})

test('returns true for stats with many drafts', () => {
  const stats: SetDraftStats = {
    cardStats: new Map(),
    leaderStats: new Map(),
    deckProfiles: new Map(),
    totalDrafts: 50,
    fetchedAt: Date.now(),
  }
  assert(hasEnoughData(stats) === true, '50 drafts should be enough')
})

// --- clearStatsCache tests ---
console.log('\n\x1b[36mclearStatsCache\x1b[0m')

test('clearStatsCache does not throw', () => {
  clearStatsCache()
  // Just verify it doesn't error
  assert(true, 'Should not throw')
})

// --- aggregateDeckProfiles tests ---
console.log('\n\x1b[36maggregateDeckProfiles\x1b[0m')

test('returns empty map for empty input', () => {
  const profiles = aggregateDeckProfiles([])
  assert(profiles.size === 0, 'Should return empty map')
})

test('aggregates single deck correctly', () => {
  const deckRows = [
    {
      leader: { name: 'Sabine Wren', aspects: ['Aggression', 'Heroism'] },
      base: { name: 'Test Base', aspects: ['Aggression', 'Cunning'] },
      deck: [
        { id: '1', name: 'Unit A', type: 'Unit', cost: 2, count: 1 },
        { id: '2', name: 'Unit B', type: 'Unit', cost: 3, count: 1 },
        { id: '3', name: 'Event A', type: 'Event', cost: 4, count: 1 },
        { id: '4', name: 'Upgrade A', type: 'Upgrade', cost: 1, count: 1 },
      ],
    },
  ]

  const profiles = aggregateDeckProfiles(deckRows)
  assert(profiles.size === 1, 'Should have 1 profile')

  const profile = profiles.get('Sabine Wren')
  assert(profile !== undefined, 'Should have Sabine Wren profile')
  assert(profile.sampleSize === 1, 'Sample size should be 1')
  assert(profile.avgUnits === 2, `Expected 2 units, got ${profile.avgUnits}`)
  assert(profile.avgEvents === 1, `Expected 1 event, got ${profile.avgEvents}`)
  assert(profile.avgUpgrades === 1, `Expected 1 upgrade, got ${profile.avgUpgrades}`)
})

test('aggregates multiple decks for same leader', () => {
  const deckRows = [
    {
      leader: { name: 'Sabine Wren', aspects: ['Aggression', 'Heroism'] },
      base: { name: 'Base 1', aspects: ['Aggression'] },
      deck: [
        { id: '1', name: 'Unit A', type: 'Unit', cost: 2, count: 1 },
        { id: '2', name: 'Unit B', type: 'Unit', cost: 3, count: 1 },
      ],
    },
    {
      leader: { name: 'Sabine Wren', aspects: ['Aggression', 'Heroism'] },
      base: { name: 'Base 2', aspects: ['Cunning'] },
      deck: [
        { id: '1', name: 'Unit A', type: 'Unit', cost: 2, count: 1 },
        { id: '3', name: 'Unit C', type: 'Unit', cost: 4, count: 1 },
        { id: '4', name: 'Event A', type: 'Event', cost: 5, count: 1 },
        { id: '5', name: 'Event B', type: 'Event', cost: 3, count: 1 },
      ],
    },
  ]

  const profiles = aggregateDeckProfiles(deckRows)
  const profile = profiles.get('Sabine Wren')!

  assert(profile.sampleSize === 2, 'Sample size should be 2')
  // Deck 1: 2 units, 0 events. Deck 2: 2 units, 2 events. Avg: (2+2)/2=2 units, (0+2)/2=1 event
  assert(profile.avgUnits === 2, `Expected avg 2 units ((2+2)/2), got ${profile.avgUnits}`)
  assert(profile.avgEvents === 1, `Expected avg 1 event ((0+2)/2), got ${profile.avgEvents}`)
})

test('tracks card frequency across decks', () => {
  const deckRows = [
    {
      leader: { name: 'Sabine Wren' },
      base: { name: 'Base 1', aspects: [] },
      deck: [
        { id: '1', name: 'Unit A', type: 'Unit', cost: 2, count: 1 },
        { id: '2', name: 'Unit B', type: 'Unit', cost: 3, count: 1 },
      ],
    },
    {
      leader: { name: 'Sabine Wren' },
      base: { name: 'Base 2', aspects: [] },
      deck: [
        { id: '1', name: 'Unit A', type: 'Unit', cost: 2, count: 1 },
        { id: '3', name: 'Unit C', type: 'Unit', cost: 4, count: 1 },
      ],
    },
  ]

  const profiles = aggregateDeckProfiles(deckRows)
  const profile = profiles.get('Sabine Wren')!

  // Unit A appears in both decks (2/2 = 1.0)
  assert(profile.cardFrequency.get('Unit A') === 1.0,
    `Unit A should appear in 100% of decks, got ${profile.cardFrequency.get('Unit A')}`)

  // Unit B appears in 1 deck (1/2 = 0.5)
  assert(profile.cardFrequency.get('Unit B') === 0.5,
    `Unit B should appear in 50% of decks, got ${profile.cardFrequency.get('Unit B')}`)

  // Unit C appears in 1 deck (1/2 = 0.5)
  assert(profile.cardFrequency.get('Unit C') === 0.5,
    `Unit C should appear in 50% of decks, got ${profile.cardFrequency.get('Unit C')}`)
})

test('tracks cost curve averages', () => {
  const deckRows = [
    {
      leader: { name: 'Sabine Wren' },
      base: { name: 'Base', aspects: [] },
      deck: [
        { id: '1', name: 'A', type: 'Unit', cost: 2, count: 1 },
        { id: '2', name: 'B', type: 'Unit', cost: 2, count: 1 },
        { id: '3', name: 'C', type: 'Unit', cost: 3, count: 1 },
      ],
    },
    {
      leader: { name: 'Sabine Wren' },
      base: { name: 'Base', aspects: [] },
      deck: [
        { id: '4', name: 'D', type: 'Unit', cost: 2, count: 1 },
        { id: '5', name: 'E', type: 'Unit', cost: 5, count: 1 },
      ],
    },
  ]

  const profiles = aggregateDeckProfiles(deckRows)
  const profile = profiles.get('Sabine Wren')!

  // Cost 2: deck1 has 2, deck2 has 1 -> avg 1.5
  assert(profile.avgCostCurve[2] === 1.5,
    `Cost 2 avg should be 1.5, got ${profile.avgCostCurve[2]}`)

  // Cost 3: deck1 has 1, deck2 has 0 -> avg 0.5
  assert(profile.avgCostCurve[3] === 0.5,
    `Cost 3 avg should be 0.5, got ${profile.avgCostCurve[3]}`)
})

test('tracks base aspects across decks', () => {
  const deckRows = [
    {
      leader: { name: 'Sabine Wren' },
      base: { name: 'Base 1', aspects: ['Aggression', 'Cunning'] },
      deck: [{ id: '1', name: 'A', type: 'Unit', cost: 2, count: 1 }],
    },
    {
      leader: { name: 'Sabine Wren' },
      base: { name: 'Base 2', aspects: ['Aggression', 'Vigilance'] },
      deck: [{ id: '2', name: 'B', type: 'Unit', cost: 2, count: 1 }],
    },
    {
      leader: { name: 'Sabine Wren' },
      base: { name: 'Base 3', aspects: ['Cunning', 'Command'] },
      deck: [{ id: '3', name: 'C', type: 'Unit', cost: 2, count: 1 }],
    },
  ]

  const profiles = aggregateDeckProfiles(deckRows)
  const profile = profiles.get('Sabine Wren')!

  assert(profile.baseAspects['Aggression'] === 2,
    `Aggression should appear in 2 bases, got ${profile.baseAspects['Aggression']}`)
  assert(profile.baseAspects['Cunning'] === 2,
    `Cunning should appear in 2 bases, got ${profile.baseAspects['Cunning']}`)
  assert(profile.baseAspects['Vigilance'] === 1,
    `Vigilance should appear in 1 base, got ${profile.baseAspects['Vigilance']}`)
  assert(profile.baseAspects['Command'] === 1,
    `Command should appear in 1 base, got ${profile.baseAspects['Command']}`)
})

test('handles JSON string deck rows (as from DB)', () => {
  const deckRows = [
    {
      leader: JSON.stringify({ name: 'Boba Fett', aspects: ['Cunning', 'Villainy'] }),
      base: JSON.stringify({ name: 'Base', aspects: ['Cunning'] }),
      deck: JSON.stringify([
        { id: '1', name: 'Unit A', type: 'Unit', cost: 2, count: 1 },
      ]),
    },
  ]

  const profiles = aggregateDeckProfiles(deckRows)
  assert(profiles.size === 1, 'Should parse JSON strings')
  assert(profiles.has('Boba Fett'), 'Should have Boba Fett profile')
})

test('skips rows with missing leader name', () => {
  const deckRows = [
    {
      leader: { aspects: ['Aggression'] },  // No name
      base: { name: 'Base', aspects: [] },
      deck: [{ id: '1', name: 'A', type: 'Unit', cost: 2, count: 1 }],
    },
  ]

  const profiles = aggregateDeckProfiles(deckRows)
  assert(profiles.size === 0, 'Should skip rows without leader name')
})

test('separates profiles by leader', () => {
  const deckRows = [
    {
      leader: { name: 'Sabine Wren' },
      base: { name: 'Base', aspects: [] },
      deck: [{ id: '1', name: 'A', type: 'Unit', cost: 2, count: 1 }],
    },
    {
      leader: { name: 'Boba Fett' },
      base: { name: 'Base', aspects: [] },
      deck: [{ id: '2', name: 'B', type: 'Event', cost: 3, count: 1 }],
    },
  ]

  const profiles = aggregateDeckProfiles(deckRows)
  assert(profiles.size === 2, 'Should have 2 separate profiles')
  assert(profiles.get('Sabine Wren')!.avgUnits === 1, 'Sabine should have 1 unit')
  assert(profiles.get('Boba Fett')!.avgEvents === 1, 'Boba should have 1 event')
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
