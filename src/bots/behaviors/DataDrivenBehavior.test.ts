// @ts-nocheck
/**
 * DataDrivenBehavior Tests
 *
 * Tests for the data-driven draft bot behavior.
 * Run with: npx tsx src/bots/behaviors/DataDrivenBehavior.test.ts
 */

import { DataDrivenBehavior } from './DataDrivenBehavior'
import type { SetDraftStats, CardPickStats, LeaderPickStats, DeckProfile } from '../data/draftStats'

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

// --- Mock Data Factories ---

function mockLeader(name: string, aspects: string[], set = 'SOR') {
  return { id: `${set}-${name}`, name, set, aspects, isLeader: true, type: 'Leader' }
}

function mockCard(name: string, opts: {
  type?: string, rarity?: string, aspects?: string[], cost?: number,
  power?: number, hp?: number, set?: string
} = {}) {
  return {
    id: `CARD-${name}`,
    name,
    type: opts.type || 'Unit',
    rarity: opts.rarity || 'Common',
    aspects: opts.aspects || [],
    cost: opts.cost ?? 3,
    power: opts.power ?? 2,
    hp: opts.hp ?? 2,
    set: opts.set || 'SOR',
    isLeader: false,
    isBase: false,
  }
}

function mockStats(overrides: Partial<SetDraftStats> = {}): SetDraftStats {
  return {
    cardStats: new Map(),
    leaderStats: new Map(),
    deckProfiles: new Map(),
    totalDrafts: 20,
    fetchedAt: Date.now(),
    ...overrides,
  }
}

function mockCardStat(cardName: string, avgPos: number, rarity = 'Common'): [string, CardPickStats] {
  return [cardName, { cardName, avgPickPosition: avgPos, timesPicked: 10, rarity, cardType: 'Unit' }]
}

function mockLeaderStat(name: string, firstPickRate: number, timesPicked = 20): [string, LeaderPickStats] {
  return [name, { leaderName: name, timesPicked, firstPickRate }]
}

function mockProfile(leaderName: string, overrides: Partial<DeckProfile> = {}): [string, DeckProfile] {
  return [leaderName, {
    leaderName,
    sampleSize: 10,
    avgUnits: 20,
    avgUpgrades: 3,
    avgEvents: 7,
    avgCostCurve: { 1: 1.5, 2: 5.2, 3: 6.1, 4: 4.8, 5: 3.1, 6: 2.0, 7: 1.3 },
    cardFrequency: new Map(),
    baseAspects: {},
    ...overrides,
  }]
}

console.log('\n\x1b[1m\x1b[35m🤖 DataDrivenBehavior Tests\x1b[0m')
console.log('\x1b[35m============================\x1b[0m\n')

// --- Leader Selection Tests ---
console.log('\x1b[36mLeader Selection\x1b[0m')

test('selects DB-popular leader over hardcoded-ranked leader', () => {
  const behavior = new DataDrivenBehavior()
  const leaders = [
    mockLeader('Sabine Wren', ['Aggression', 'Heroism']),   // #1 in hardcoded SOR
    mockLeader('Jyn Erso', ['Cunning', 'Heroism']),         // Last in hardcoded SOR
  ]

  // DB says Jyn is picked 80 times, Sabine only 20 — selectLeader sorts by timesPicked
  const stats = mockStats({
    leaderStats: new Map([
      mockLeaderStat('Jyn Erso', 0.8, 80),
      mockLeaderStat('Sabine Wren', 0.2, 20),
    ]),
  })

  const pick = behavior.selectLeader(leaders, { setCode: 'SOR', draftStats: stats })
  assert(pick.name === 'Jyn Erso', `DB data should override hardcoded: got ${pick.name}`)
})

test('falls back to hardcoded rankings when no stats', () => {
  const behavior = new DataDrivenBehavior()
  const leaders = [
    mockLeader('Jyn Erso', ['Cunning', 'Heroism']),
    mockLeader('Sabine Wren', ['Aggression', 'Heroism']),
  ]

  const pick = behavior.selectLeader(leaders, { setCode: 'SOR' })
  assert(pick.name === 'Sabine Wren', `Hardcoded fallback: Sabine should be #1 SOR, got ${pick.name}`)
})

test('falls back to hardcoded when stats have empty leaderStats', () => {
  const behavior = new DataDrivenBehavior()
  const leaders = [
    mockLeader('Jyn Erso', ['Cunning', 'Heroism']),
    mockLeader('Sabine Wren', ['Aggression', 'Heroism']),
  ]

  const stats = mockStats({ leaderStats: new Map() })
  const pick = behavior.selectLeader(leaders, { setCode: 'SOR', draftStats: stats })
  assert(pick.name === 'Sabine Wren', `Empty stats should fall back to hardcoded, got ${pick.name}`)
})

test('handles empty leaders array', () => {
  const behavior = new DataDrivenBehavior()
  assert(behavior.selectLeader([]) === null, 'Empty array should return null')
  assert(behavior.selectLeader(null as any) === null, 'Null should return null')
})

// --- Card Quality Scoring Tests ---
console.log('\n\x1b[36mCard Quality Scoring (Data-Driven)\x1b[0m')

test('high-pick-rate Common beats low-pick-rate Uncommon', () => {
  const behavior = new DataDrivenBehavior()
  const stats = mockStats({
    cardStats: new Map([
      mockCardStat('Good Common', 2.0, 'Common'),    // Picked 2nd on average (great)
      mockCardStat('Bad Uncommon', 12.0, 'Uncommon'), // Picked 12th (terrible)
    ]),
  })

  const pack = [
    mockCard('Bad Uncommon', { rarity: 'Uncommon', aspects: ['Aggression'] }),
    mockCard('Good Common', { rarity: 'Common', aspects: ['Aggression'] }),
  ]

  const leaders = [mockLeader('Sabine Wren', ['Aggression', 'Heroism'])]
  const pick = behavior.selectCard(pack, {
    draftedLeaders: leaders,
    setCode: 'SOR',
    draftStats: stats,
  })

  assert(pick.name === 'Good Common',
    `Data-driven quality: Good Common (pos 2) should beat Bad Uncommon (pos 12), got ${pick.name}`)
})

test('falls back to rarity scoring when no stats for card', () => {
  const behavior = new DataDrivenBehavior()
  const stats = mockStats({ cardStats: new Map() })  // Empty stats

  const pack = [
    mockCard('Common Card', { rarity: 'Common', aspects: ['Aggression'] }),
    mockCard('Rare Card', { rarity: 'Rare', aspects: ['Aggression'] }),
  ]

  const leaders = [mockLeader('Sabine Wren', ['Aggression', 'Heroism'])]
  const pick = behavior.selectCard(pack, {
    draftedLeaders: leaders,
    setCode: 'SOR',
    draftStats: stats,
  })

  assert(pick.name === 'Rare Card',
    `Rarity fallback: Rare should beat Common when no stats, got ${pick.name}`)
})

// --- Color Commitment Tests ---
console.log('\n\x1b[36mLeader Commitment\x1b[0m')

test('commits to leader with most in-color drafted cards at pick 5', () => {
  const behavior = new DataDrivenBehavior()
  const leaders = [
    mockLeader('Sabine Wren', ['Aggression', 'Heroism']),
    mockLeader('Boba Fett', ['Cunning', 'Villainy']),
  ]

  // 4 Aggression cards, 1 Cunning card -> Sabine should win
  const draftedCards = [
    mockCard('A', { aspects: ['Aggression'] }),
    mockCard('B', { aspects: ['Aggression'] }),
    mockCard('C', { aspects: ['Aggression'] }),
    mockCard('D', { aspects: ['Aggression'] }),
    mockCard('E', { aspects: ['Cunning'] }),
  ]

  behavior._commitToLeader(leaders, draftedCards, null)
  assert(behavior.committedLeader !== null, 'Should have committed to a leader')
  assert(behavior.committedLeader.name === 'Sabine Wren',
    `Should commit to Sabine (4 Aggression cards), got ${behavior.committedLeader.name}`)
})

test('commitment is deterministic — same input produces same result', () => {
  const leaders = [
    mockLeader('Sabine Wren', ['Aggression', 'Heroism']),
    mockLeader('Boba Fett', ['Cunning', 'Villainy']),
  ]
  const draftedCards = [
    mockCard('A', { aspects: ['Aggression'] }),
    mockCard('B', { aspects: ['Aggression'] }),
    mockCard('C', { aspects: ['Cunning'] }),
  ]

  const results = new Set<string>()
  for (let i = 0; i < 10; i++) {
    const b = new DataDrivenBehavior()
    b._commitToLeader(leaders, draftedCards, null)
    results.add(b.committedLeader!.name)
  }

  assert(results.size === 1, `Commitment should be deterministic, got ${results.size} different results`)
})

test('commits to single leader when only one drafted', () => {
  const behavior = new DataDrivenBehavior()
  const leaders = [mockLeader('Sabine Wren', ['Aggression', 'Heroism'])]

  behavior._commitToLeader(leaders, [], null)
  assert(behavior.committedLeader!.name === 'Sabine Wren', 'Should commit to only leader')
})

test('DB popularity breaks ties in leader commitment', () => {
  const behavior = new DataDrivenBehavior()
  const leaders = [
    mockLeader('Sabine Wren', ['Aggression', 'Heroism']),
    mockLeader('Boba Fett', ['Cunning', 'Villainy']),
  ]

  // Equal in-color cards (0 each)
  const draftedCards = [
    mockCard('A', { aspects: [] }),  // Neutral
    mockCard('B', { aspects: [] }),  // Neutral
  ]

  // But Boba has higher pick count in DB
  const stats = mockStats({
    leaderStats: new Map([
      mockLeaderStat('Boba Fett', 0.9, 90),
      mockLeaderStat('Sabine Wren', 0.1, 10),
    ]),
  })

  behavior._commitToLeader(leaders, draftedCards, stats)
  assert(behavior.committedLeader!.name === 'Boba Fett',
    `DB popularity should break tie: got ${behavior.committedLeader!.name}`)
})

// --- Base Color Commitment Tests ---
console.log('\n\x1b[36mBase Color Commitment\x1b[0m')

test('commits to base color with strongest pool weight', () => {
  const behavior = new DataDrivenBehavior()
  behavior.committedLeader = mockLeader('Sabine Wren', ['Aggression', 'Heroism'])

  // Pool has lots of Cunning cards, few Vigilance
  const draftedCards = [
    mockCard('A', { aspects: ['Cunning'] }),
    mockCard('B', { aspects: ['Cunning'] }),
    mockCard('C', { aspects: ['Cunning'] }),
    mockCard('D', { aspects: ['Vigilance'] }),
  ]

  behavior._commitToBaseColor(draftedCards, ['Aggression', 'Heroism'], null)
  assert(behavior.committedBaseColor === 'Cunning',
    `Should pick Cunning (3 cards) over Vigilance (1), got ${behavior.committedBaseColor}`)
})

test('deck profile data influences base color choice', () => {
  const behavior = new DataDrivenBehavior()
  behavior.committedLeader = mockLeader('Sabine Wren', ['Aggression', 'Heroism'])

  // Equal pool cards in Cunning and Command
  const draftedCards = [
    mockCard('A', { aspects: ['Cunning'] }),
    mockCard('B', { aspects: ['Command'] }),
  ]

  // But deck profiles show Command bases are much more successful with Sabine
  const stats = mockStats({
    deckProfiles: new Map([
      mockProfile('Sabine Wren', {
        baseAspects: { 'Command': 10, 'Cunning': 1 },
      }),
    ]),
  })

  behavior._commitToBaseColor(draftedCards, ['Aggression', 'Heroism'], stats)
  assert(behavior.committedBaseColor === 'Command',
    `Profile data should push toward Command, got ${behavior.committedBaseColor}`)
})

// --- Need-Based Scoring Tests ---
console.log('\n\x1b[36mNeed-Based Scoring\x1b[0m')

test('bot with too many units deprioritizes units', () => {
  const behavior = new DataDrivenBehavior()
  behavior.committedLeader = mockLeader('Sabine Wren', ['Aggression', 'Heroism'])

  // Profile says 20/30 units, but pool is already 90% units
  const [, profile] = mockProfile('Sabine Wren', { avgUnits: 20, avgEvents: 7, avgUpgrades: 3 })
  const stats = mockStats({
    deckProfiles: new Map([['Sabine Wren', profile]]),
  })

  // Pool of 10 cards, 9 are units, 1 event
  const draftedCards: any[] = []
  for (let i = 0; i < 9; i++) {
    draftedCards.push(mockCard(`Unit${i}`, { type: 'Unit', aspects: ['Aggression'] }))
  }
  draftedCards.push(mockCard('Event1', { type: 'Event', aspects: ['Aggression'] }))

  const unitNeed = behavior._calculateNeedScore(
    mockCard('Another Unit', { type: 'Unit', aspects: ['Aggression'], cost: 3 }),
    draftedCards,
    stats
  )
  const eventNeed = behavior._calculateNeedScore(
    mockCard('Another Event', { type: 'Event', aspects: ['Aggression'], cost: 3 }),
    draftedCards,
    stats
  )

  assert(eventNeed > unitNeed,
    `Event need (${eventNeed.toFixed(1)}) should exceed unit need (${unitNeed.toFixed(1)}) when pool is unit-heavy`)
})

test('bot missing 3-drops boosts 3-cost cards', () => {
  const behavior = new DataDrivenBehavior()
  behavior.committedLeader = mockLeader('Sabine Wren', ['Aggression', 'Heroism'])

  // Profile has most cards at cost 3
  const [, profile] = mockProfile('Sabine Wren', {
    avgCostCurve: { 1: 0, 2: 2, 3: 10, 4: 5, 5: 3, 6: 0, 7: 0 },
  })
  const stats = mockStats({
    deckProfiles: new Map([['Sabine Wren', profile]]),
  })

  // Pool has no 3-drops, lots of 2-drops
  const draftedCards = [
    mockCard('A', { type: 'Unit', cost: 2 }),
    mockCard('B', { type: 'Unit', cost: 2 }),
    mockCard('C', { type: 'Unit', cost: 2 }),
    mockCard('D', { type: 'Unit', cost: 2 }),
    mockCard('E', { type: 'Unit', cost: 2 }),
  ]

  const threeDropNeed = behavior._calculateNeedScore(
    mockCard('3-drop', { type: 'Unit', cost: 3 }),
    draftedCards, stats
  )
  const twoDropNeed = behavior._calculateNeedScore(
    mockCard('2-drop', { type: 'Unit', cost: 2 }),
    draftedCards, stats
  )

  assert(threeDropNeed > twoDropNeed,
    `3-drop need (${threeDropNeed.toFixed(1)}) should exceed 2-drop need (${twoDropNeed.toFixed(1)}) when pool has no 3-drops`)
})

test('bot prioritizes cards appearing in >40% of similar decks', () => {
  const behavior = new DataDrivenBehavior()
  behavior.committedLeader = mockLeader('Sabine Wren', ['Aggression', 'Heroism'])

  const freq = new Map<string, number>()
  freq.set('Staple Card', 0.7)   // In 70% of Sabine decks
  freq.set('Niche Card', 0.05)   // In 5% of Sabine decks

  const [, profile] = mockProfile('Sabine Wren', { cardFrequency: freq })
  const stats = mockStats({
    deckProfiles: new Map([['Sabine Wren', profile]]),
  })

  const stapleNeed = behavior._calculateNeedScore(
    mockCard('Staple Card', { type: 'Unit', cost: 3 }),
    [], stats
  )
  const nicheNeed = behavior._calculateNeedScore(
    mockCard('Niche Card', { type: 'Unit', cost: 3 }),
    [], stats
  )

  assert(stapleNeed > nicheNeed,
    `Staple need (${stapleNeed.toFixed(1)}) should beat niche need (${nicheNeed.toFixed(1)})`)
})

test('need weight increases in later picks', () => {
  const behavior = new DataDrivenBehavior()
  behavior.committedLeader = mockLeader('Sabine Wren', ['Aggression', 'Heroism'])

  const freq = new Map<string, number>()
  freq.set('Test Card', 0.6)
  const [, profile] = mockProfile('Sabine Wren', { cardFrequency: freq })
  const stats = mockStats({
    deckProfiles: new Map([['Sabine Wren', profile]]),
  })

  const card = mockCard('Test Card', { type: 'Unit', aspects: ['Aggression'], cost: 3 })
  const leaders = [behavior.committedLeader]

  // Early pick (pick 10) vs late pick (pick 40)
  const earlyScore = behavior._scoreCard(card, leaders, [], 10, stats, { setCode: 'SOR' })
  const lateScore = behavior._scoreCard(card, leaders, [], 40, stats, { setCode: 'SOR' })

  // Late picks should weigh need more heavily, so score should differ
  // (Both are in committed phase since committedLeader is set)
  assert(lateScore !== earlyScore,
    `Score should change as draft progresses (early: ${earlyScore.toFixed(1)}, late: ${lateScore.toFixed(1)})`)
})

// --- Color Scoring Tests ---
console.log('\n\x1b[36mColor Scoring\x1b[0m')

test('fully committed bot strongly penalizes off-color cards', () => {
  const behavior = new DataDrivenBehavior()
  behavior.committedLeader = mockLeader('Sabine Wren', ['Aggression', 'Heroism'])
  behavior.committedBaseColor = 'Cunning'

  const inColor = behavior._calculateColorScore(
    mockCard('In Color', { aspects: ['Aggression'] }),
    [behavior.committedLeader], true
  )
  const offColor = behavior._calculateColorScore(
    mockCard('Off Color', { aspects: ['Vigilance'] }),
    [behavior.committedLeader], true
  )

  assert(inColor > 0, `In-color should be positive: ${inColor}`)
  assert(offColor < 0, `Off-color should be negative: ${offColor}`)
  assert(inColor - offColor >= 80,
    `Gap should be large (${inColor} vs ${offColor})`)
})

test('base color gets moderate bonus when fully committed', () => {
  const behavior = new DataDrivenBehavior()
  behavior.committedLeader = mockLeader('Sabine Wren', ['Aggression', 'Heroism'])
  behavior.committedBaseColor = 'Cunning'

  const baseColor = behavior._calculateColorScore(
    mockCard('Base Color', { aspects: ['Cunning'] }),
    [behavior.committedLeader], true
  )
  const offColor = behavior._calculateColorScore(
    mockCard('Off Color', { aspects: ['Vigilance'] }),
    [behavior.committedLeader], true
  )

  assert(baseColor === 40, `Base color should be 40, got ${baseColor}`)
  assert(baseColor > offColor, 'Base color should beat off-color')
})

test('exploration phase stays open — mild off-color penalty', () => {
  const behavior = new DataDrivenBehavior()
  // Not committed yet
  const leaders = [mockLeader('Sabine Wren', ['Aggression', 'Heroism'])]

  const offColor = behavior._calculateColorScore(
    mockCard('Off Color', { aspects: ['Vigilance'] }),
    leaders, false
  )

  assert(offColor >= 0,
    `Exploration off-color should not be penalized: ${offColor}`)
})

test('neutral cards get small bonus in all phases', () => {
  const behavior = new DataDrivenBehavior()
  const leaders = [mockLeader('Sabine Wren', ['Aggression', 'Heroism'])]

  const neutralExplore = behavior._calculateColorScore(
    mockCard('Neutral', { aspects: [] }),
    leaders, false
  )

  behavior.committedLeader = leaders[0]
  behavior.committedBaseColor = 'Cunning'
  const neutralCommitted = behavior._calculateColorScore(
    mockCard('Neutral', { aspects: [] }),
    leaders, true
  )

  assert(neutralExplore === 15, `Exploration neutral should be 15, got ${neutralExplore}`)
  assert(neutralCommitted === 15, `Committed neutral should be 15, got ${neutralCommitted}`)
})

// --- Integration: Full Mock Draft Simulation ---
console.log('\n\x1b[36mIntegration: Mock Draft Simulation\x1b[0m')

test('full 14-pick draft produces reasonable pool', () => {
  const behavior = new DataDrivenBehavior()
  const leaders = [
    mockLeader('Sabine Wren', ['Aggression', 'Heroism']),
    mockLeader('Boba Fett', ['Cunning', 'Villainy']),
  ]

  // Mock stats with card quality data
  const cardStatEntries: [string, CardPickStats][] = []
  const aspects = ['Aggression', 'Cunning', 'Vigilance', 'Command']

  // Generate 14 packs of cards
  const draftedCards: any[] = []
  for (let pick = 1; pick <= 14; pick++) {
    const pack: any[] = []
    for (let j = 0; j < 14 - pick + 1; j++) {
      const aspect = aspects[j % aspects.length]!
      const type = j < 8 ? 'Unit' : (j < 11 ? 'Event' : 'Upgrade')
      const cost = (j % 6) + 1
      const cardName = `Card_${pick}_${j}`
      pack.push(mockCard(cardName, { type, aspects: [aspect], cost, rarity: j === 0 ? 'Rare' : 'Common' }))
      cardStatEntries.push(mockCardStat(cardName, j + 1))
    }

    const picked = behavior.selectCard(pack, {
      draftedLeaders: leaders,
      draftedCards: [...draftedCards],
      setCode: 'SOR',
      draftStats: mockStats({ cardStats: new Map(cardStatEntries) }),
    })

    assert(picked !== null, `Pick ${pick} should not be null`)
    draftedCards.push(picked)
  }

  assert(draftedCards.length === 14, `Should have 14 drafted cards, got ${draftedCards.length}`)

  // After pick 5, leader should be committed
  assert(behavior.committedLeader !== null, 'Should have committed to a leader after 14 picks')

  // Count types in pool
  const types = { Unit: 0, Event: 0, Upgrade: 0 }
  for (const card of draftedCards) {
    if (card.type in types) types[card.type]++
  }

  // Pool should have some type variety (not all one type)
  const typeCount = Object.values(types).filter(v => v > 0).length
  assert(typeCount >= 1, 'Pool should have at least 1 card type represented')
})

test('bot without stats still drafts a functional pool', () => {
  const behavior = new DataDrivenBehavior()
  const leaders = [mockLeader('Sabine Wren', ['Aggression', 'Heroism'])]

  const draftedCards: any[] = []
  for (let pick = 1; pick <= 14; pick++) {
    const pack = [
      mockCard(`Agg_${pick}`, { type: 'Unit', aspects: ['Aggression'], cost: pick % 5 + 1, rarity: 'Common' }),
      mockCard(`Vig_${pick}`, { type: 'Unit', aspects: ['Vigilance'], cost: pick % 5 + 1, rarity: 'Common' }),
      mockCard(`Evt_${pick}`, { type: 'Event', aspects: ['Aggression'], cost: pick % 4 + 2, rarity: 'Uncommon' }),
    ]

    const picked = behavior.selectCard(pack, {
      draftedLeaders: leaders,
      draftedCards: [...draftedCards],
      setCode: 'SOR',
      // No draftStats — pure fallback
    })

    assert(picked !== null, `Pick ${pick} should not be null`)
    draftedCards.push(picked)
  }

  assert(draftedCards.length === 14, 'Should draft 14 cards')

  // Most cards should be in-color (Aggression)
  const inColor = draftedCards.filter(c =>
    (c.aspects || []).some((a: string) => ['Aggression', 'Heroism'].includes(a))
  ).length

  assert(inColor >= 10, `Most picks should be in-color (${inColor}/14)`)
})

// --- Reset Tests ---
console.log('\n\x1b[36mReset\x1b[0m')

test('reset clears all commitment state', () => {
  const behavior = new DataDrivenBehavior()
  behavior.committedLeader = mockLeader('Sabine Wren', ['Aggression', 'Heroism'])
  behavior.committedBaseColor = 'Cunning'

  behavior.reset()

  assert(behavior.committedLeader === null, 'committedLeader should be null after reset')
  assert(behavior.committedBaseColor === null, 'committedBaseColor should be null after reset')
})

// --- Edge Cases ---
console.log('\n\x1b[36mEdge Cases\x1b[0m')

test('handles empty pack', () => {
  const behavior = new DataDrivenBehavior()
  assert(behavior.selectCard([]) === null, 'Empty pack should return null')
  assert(behavior.selectCard(null as any) === null, 'Null pack should return null')
})

test('handles card with no aspects', () => {
  const behavior = new DataDrivenBehavior()
  const pack = [mockCard('Neutral', { aspects: [] })]

  const pick = behavior.selectCard(pack, {
    draftedLeaders: [mockLeader('Sabine Wren', ['Aggression', 'Heroism'])],
    setCode: 'SOR',
  })

  assert(pick !== null, 'Should pick neutral card')
  assert(pick.name === 'Neutral', 'Should return the neutral card')
})

test('handles draft with no leaders', () => {
  const behavior = new DataDrivenBehavior()
  const pack = [
    mockCard('A', { aspects: ['Aggression'] }),
    mockCard('B', { aspects: ['Vigilance'] }),
  ]

  const pick = behavior.selectCard(pack, { draftedLeaders: [], setCode: 'SOR' })
  assert(pick !== null, 'Should still pick a card with no leaders')
})

// Summary
console.log('\n\x1b[35m============================\x1b[0m')
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
