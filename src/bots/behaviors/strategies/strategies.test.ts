// @ts-nocheck
/**
 * Strategy Tests
 *
 * Tests for all 7 draft bot strategies and the base strategy system.
 * Run with: npx tsx src/bots/behaviors/strategies/strategies.test.ts
 */

import { TopPlayerStrategy } from './TopPlayerStrategy'
import { TournamentPlayerStrategy } from './TournamentPlayerStrategy'
import { AllPlayerStrategy } from './AllPlayerStrategy'
import { NemesisStrategy } from './NemesisStrategy'
import { DiversityStrategy } from './DiversityStrategy'
import { PrimaryColorCornerStrategy } from './PrimaryColorCornerStrategy'
import { SecondaryAspectCornerStrategy } from './SecondaryAspectCornerStrategy'
import { assignStrategies, createStrategy } from '../index'
import { MIXIN_A, MIXIN_B, MIXIN_C, ALL_MIXINS } from '../mixins'
import { STRATEGY_DISPLAY_NAMES, STRATEGY_DESCRIPTIONS, MIXIN_DISPLAY_NAMES, MIXIN_DESCRIPTIONS } from '../strategyDescriptions'
import type { SetDraftStats, CardPickStats, LeaderPickStats, DeckProfile, SegmentedLeaderStats, PerLeaderCardStats } from '../../data/draftStats'
import type { MixinModifier } from '../mixins'

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
  return { id: `${set}-${name}`, name, set, aspects, isLeader: true, type: 'Leader', text: '' }
}

function mockCard(name: string, opts: {
  type?: string, rarity?: string, aspects?: string[], cost?: number,
  power?: number, hp?: number, set?: string, traits?: string[]
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
    traits: opts.traits || [],
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

function mockLeaderStat(name: string, timesPicked: number): [string, LeaderPickStats] {
  return [name, { leaderName: name, timesPicked, firstPickRate: 0.5 }]
}

function mockCardStat(cardName: string, avgPos: number): [string, CardPickStats] {
  return [cardName, { cardName, avgPickPosition: avgPos, timesPicked: 10, rarity: 'Common', cardType: 'Unit' }]
}

console.log('\n\x1b[1m\x1b[35m🤖 Draft Bot Strategy Tests\x1b[0m')
console.log('\x1b[35m=================================\x1b[0m\n')

// --- Strategy Assignment Tests ---
console.log('\x1b[36mStrategy Assignment\x1b[0m')

test('assigns 7 unique strategies in solo mode', () => {
  const botIds = ['bot1', 'bot2', 'bot3', 'bot4', 'bot5', 'bot6', 'bot7']
  const assignments = assignStrategies(botIds, true)

  assert(assignments.size === 7, `Should assign 7 strategies, got ${assignments.size}`)

  const strategyNames = new Set<string>()
  for (const [, strategy] of assignments) {
    strategyNames.add(strategy.strategyName)
  }
  assert(strategyNames.size === 7, `All 7 strategies should be unique, got ${strategyNames.size}: ${[...strategyNames].join(', ')}`)
  assert(strategyNames.has('nemesis'), 'Solo mode should include Nemesis')
})

test('assigns strategies without Nemesis in multiplayer mode', () => {
  const botIds = ['bot1', 'bot2', 'bot3', 'bot4', 'bot5', 'bot6']
  const assignments = assignStrategies(botIds, false)

  assert(assignments.size === 6, `Should assign 6 strategies, got ${assignments.size}`)

  for (const [, strategy] of assignments) {
    assert(strategy.strategyName !== 'nemesis', 'Multiplayer should not include Nemesis')
  }

  const strategyNames = new Set<string>()
  for (const [, strategy] of assignments) {
    strategyNames.add(strategy.strategyName)
  }
  assert(strategyNames.size === 6, `All 6 strategies should be unique, got ${strategyNames.size}`)
})

test('assigns strategies for fewer bots without duplicates', () => {
  const botIds = ['bot1', 'bot2', 'bot3']
  const assignments = assignStrategies(botIds, false)

  assert(assignments.size === 3, `Should assign 3 strategies, got ${assignments.size}`)

  const strategyNames = new Set<string>()
  for (const [, strategy] of assignments) {
    strategyNames.add(strategy.strategyName)
  }
  assert(strategyNames.size === 3, 'All 3 should be unique strategies')
})

test('all assigned strategies have a mixin', () => {
  const botIds = ['bot1', 'bot2', 'bot3']
  const assignments = assignStrategies(botIds, false)

  for (const [, strategy] of assignments) {
    assert(strategy.mixin !== null, `Strategy ${strategy.strategyName} should have a mixin`)
    assert(['highOptionality', 'highConviction', 'highGroupthink'].includes(strategy.mixin.name),
      `Invalid mixin: ${strategy.mixin.name}`)
  }
})

test('handles empty bot list', () => {
  const assignments = assignStrategies([], false)
  assert(assignments.size === 0, 'Empty bot list should return empty map')
})

// --- Base Strategy Behavior Tests ---
console.log('\n\x1b[36mBase Strategy Behavior\x1b[0m')

test('AllPlayerStrategy uses default card/leader stats', () => {
  const strategy = new AllPlayerStrategy(null)
  const stats = mockStats({
    leaderStats: new Map([
      mockLeaderStat('Leader A', 50),
      mockLeaderStat('Leader B', 100),
    ]),
  })

  const leaders = [
    mockLeader('Leader A', ['Aggression', 'Heroism']),
    mockLeader('Leader B', ['Cunning', 'Villainy']),
  ]

  const ranked = strategy.rankLeaders(leaders, { draftStats: stats, setCode: 'SOR' })
  assert(ranked[0].name === 'Leader B', `Most popular should be first, got ${ranked[0].name}`)
})

test('TopPlayerStrategy uses top player segment', () => {
  const strategy = new TopPlayerStrategy(null)
  const stats = mockStats({
    leaderStats: new Map([
      mockLeaderStat('Leader A', 100),  // Overall popular
      mockLeaderStat('Leader B', 50),
    ]),
    segmentedLeaderStats: {
      topPlayers: new Map([
        mockLeaderStat('Leader A', 10),   // Top players don't like A
        mockLeaderStat('Leader B', 80),   // Top players love B
      ]),
    },
  })

  const leaders = [
    mockLeader('Leader A', ['Aggression', 'Heroism']),
    mockLeader('Leader B', ['Cunning', 'Villainy']),
  ]

  const leaderPop = strategy.getLeaderPopularity(stats)
  assert(leaderPop !== null, 'Should return top player stats')

  const ranked = strategy.rankLeaders(leaders, { draftStats: stats, setCode: 'SOR' })
  assert(ranked[0].name === 'Leader B',
    `Top player favorite should be first, got ${ranked[0].name}`)
})

test('TournamentPlayerStrategy uses tournament segment', () => {
  const strategy = new TournamentPlayerStrategy(null)
  const stats = mockStats({
    leaderStats: new Map([
      mockLeaderStat('Leader A', 100),
    ]),
    segmentedLeaderStats: {
      tournamentPlayers: new Map([
        mockLeaderStat('Leader A', 5),
        mockLeaderStat('Leader B', 90),
      ]),
    },
  })

  const leaderPop = strategy.getLeaderPopularity(stats)
  assert(leaderPop !== null, 'Should return tournament stats')
  assert(leaderPop.get('Leader B')?.timesPicked === 90, 'Should use tournament data')
})

// --- Strategy-Specific Behavior Tests ---
console.log('\n\x1b[36mDiversity Strategy\x1b[0m')

test('DiversityStrategy maximizes aspect diversity in rounds 2-3', () => {
  const strategy = new DiversityStrategy(null)

  // Round 1: picks most popular
  const leaders = [
    mockLeader('Agg Leader', ['Aggression', 'Heroism']),
    mockLeader('Vig Leader', ['Vigilance', 'Villainy']),
    mockLeader('Cun Leader', ['Cunning', 'Heroism']),
  ]

  // Round 2: already have Aggression/Heroism, should prefer different aspects
  const ranked = strategy.rankLeaders(leaders, {
    setCode: 'SOR',
    leaderRound: 2,
    draftedLeaders: [mockLeader('Agg Leader', ['Aggression', 'Heroism'])],
  })

  // Vig Leader adds 2 new aspects (Vigilance, Villainy), Cun Leader adds 1 (Cunning)
  assert(ranked[0].name === 'Vig Leader',
    `Should pick leader with most new aspects, got ${ranked[0].name}`)
})

test('DiversityStrategy has late Y and X ranges', () => {
  const strategy = new DiversityStrategy(null)
  const [yMin, yMax] = strategy.getYRange()
  const [xMin, xMax] = strategy.getXRange()

  assert(yMin >= 8, `Y min should be >= 8, got ${yMin}`)
  assert(xMin >= 10, `X min should be >= 10, got ${xMin}`)
})

// --- Primary Color Corner Tests ---
console.log('\n\x1b[36mPrimary Color Corner Strategy\x1b[0m')

test('PrimaryColorCorner boosts primary color cards', () => {
  const strategy = new PrimaryColorCornerStrategy(null)
  strategy.committedLeader = mockLeader('Sabine', ['Aggression', 'Heroism'])

  const primaryCard = mockCard('Agg Card', { aspects: ['Aggression'] })
  const offCard = mockCard('Vig Card', { aspects: ['Vigilance'] })

  const primaryBonus = strategy.adjustCardScore(primaryCard, 50, { setCode: 'SOR' })
  const offPenalty = strategy.adjustCardScore(offCard, 50, { setCode: 'SOR' })

  assert(primaryBonus > 0, `Primary color should get bonus, got ${primaryBonus}`)
  assert(offPenalty < 0, `Off-color should get penalty, got ${offPenalty}`)
})

test('PrimaryColorCorner has early Y range', () => {
  const strategy = new PrimaryColorCornerStrategy(null)
  const [yMin, yMax] = strategy.getYRange()
  assert(yMax <= 3, `Y max should be <= 3, got ${yMax}`)
})

// --- Secondary Aspect Corner Tests ---
console.log('\n\x1b[36mSecondary Aspect Corner Strategy\x1b[0m')

test('SecondaryAspectCorner boosts same-alignment cards', () => {
  const strategy = new SecondaryAspectCornerStrategy(null)
  strategy.committedLeader = mockLeader('Sabine', ['Aggression', 'Heroism'])

  const heroismCard = mockCard('Hero Card', { aspects: ['Heroism', 'Vigilance'] })
  const villainyCard = mockCard('Villain Card', { aspects: ['Villainy', 'Aggression'] })
  const neutralCard = mockCard('Neutral Card', { aspects: ['Cunning'] })

  const heroBonus = strategy.adjustCardScore(heroismCard, 50, { setCode: 'SOR' })
  const villainPenalty = strategy.adjustCardScore(villainyCard, 50, { setCode: 'SOR' })
  const neutralDelta = strategy.adjustCardScore(neutralCard, 50, { setCode: 'SOR' })

  assert(heroBonus > 0, `Same alignment should get bonus, got ${heroBonus}`)
  assert(villainPenalty < 0, `Wrong alignment should get penalty, got ${villainPenalty}`)
  assert(neutralDelta === 0, `No alignment should get 0 delta, got ${neutralDelta}`)
})

// --- Nemesis Strategy Tests ---
console.log('\n\x1b[36mNemesis Strategy\x1b[0m')

test('NemesisStrategy uses per-user stats for leader ranking', () => {
  const strategy = new NemesisStrategy(null)

  const stats = mockStats({
    leaderStats: new Map([
      mockLeaderStat('Popular Leader', 100),
      mockLeaderStat('Niche Leader', 10),
    ]),
    segmentedLeaderStats: {
      specificUser: new Map([
        mockLeaderStat('Popular Leader', 2),    // User rarely picks popular
        mockLeaderStat('Niche Leader', 50),      // User loves niche
      ]),
    },
  })

  const leaders = [
    mockLeader('Popular Leader', ['Aggression', 'Heroism']),
    mockLeader('Niche Leader', ['Cunning', 'Villainy']),
  ]

  const ranked = strategy.rankLeaders(leaders, { draftStats: stats, setCode: 'SOR' })
  assert(ranked[0].name === 'Niche Leader',
    `Should deny user's favorite, got ${ranked[0].name}`)
})

test('NemesisStrategy commits immediately (Y=1, X=1)', () => {
  const strategy = new NemesisStrategy(null)
  const [yMin, yMax] = strategy.getYRange()
  const [xMin, xMax] = strategy.getXRange()

  assert(yMin === 1 && yMax === 1, `Y should be [1,1], got [${yMin},${yMax}]`)
  assert(xMin === 1 && xMax === 1, `X should be [1,1], got [${xMin},${xMax}]`)
})

// --- Mixin Tests ---
console.log('\n\x1b[36mMixin Modifiers\x1b[0m')

test('Mixin A (High Optionality) delays commitment', () => {
  const strategy = new AllPlayerStrategy(MIXIN_A)
  // Y range is [3,8] + offset 3 = [6,11]
  assert(strategy.mentalLeaderPickTurn >= 6, `Y should be >= 6, got ${strategy.mentalLeaderPickTurn}`)
  assert(strategy.mentalLeaderPickTurn <= 11, `Y should be <= 11, got ${strategy.mentalLeaderPickTurn}`)
})

test('Mixin B (High Conviction) accelerates commitment', () => {
  const strategy = new AllPlayerStrategy(MIXIN_B)
  // Y range is [3,8] + offset -3 = [1,5] (clamped to 1)
  assert(strategy.mentalLeaderPickTurn >= 1, `Y should be >= 1, got ${strategy.mentalLeaderPickTurn}`)
  assert(strategy.mentalLeaderPickTurn <= 5, `Y should be <= 5, got ${strategy.mentalLeaderPickTurn}`)
})

test('Mixin C (High Groupthink) has no commitment offset', () => {
  assert(MIXIN_C.commitmentOffset === 0, 'Groupthink should not change commitment timing')
  assert(MIXIN_C.qualityMultiplier > 0, 'Groupthink should increase quality weight')
})

// --- Card Selection Integration ---
console.log('\n\x1b[36mCard Selection Integration\x1b[0m')

test('strategy selects best card from pack', () => {
  const strategy = new AllPlayerStrategy(null)
  const leaders = [mockLeader('Sabine Wren', ['Aggression', 'Heroism'])]

  const pack = [
    mockCard('Off-Color', { aspects: ['Vigilance'], rarity: 'Common' }),
    mockCard('In-Color', { aspects: ['Aggression'], rarity: 'Common' }),
    mockCard('Neutral', { aspects: [], rarity: 'Common' }),
  ]

  const picked = strategy.selectCard(pack, {
    draftedLeaders: leaders,
    draftedCards: [],
    setCode: 'SOR',
  })

  assert(picked !== null, 'Should pick a card')
  assert(picked.name === 'In-Color', `Should prefer in-color, got ${picked.name}`)
})

test('strategy returns null for empty pack', () => {
  const strategy = new AllPlayerStrategy(null)
  assert(strategy.selectCard([]) === null, 'Empty pack should return null')
  assert(strategy.selectCard(null as any) === null, 'Null pack should return null')
})

test('strategy selects leader from available options', () => {
  const strategy = new AllPlayerStrategy(null)
  const leaders = [
    mockLeader('A', ['Aggression', 'Heroism']),
    mockLeader('B', ['Cunning', 'Villainy']),
  ]

  const picked = strategy.selectLeader(leaders, { setCode: 'SOR' })
  assert(picked !== null, 'Should pick a leader')
  assert(leaders.some(l => l.name === picked.name), 'Should pick from available leaders')
})

test('strategy handles empty leaders', () => {
  const strategy = new AllPlayerStrategy(null)
  assert(strategy.selectLeader([]) === null, 'Empty leaders should return null')
})

test('strategy reset clears state', () => {
  const strategy = new AllPlayerStrategy(null)
  strategy.committedLeader = mockLeader('Test', ['Aggression', 'Heroism'])
  strategy.committedBaseColor = 'Cunning'

  strategy.reset()

  assert(strategy.committedLeader === null, 'committedLeader should be null after reset')
  assert(strategy.committedBaseColor === null, 'committedBaseColor should be null after reset')
})

// --- LAW Splash Rule Tests ---
console.log('\n\x1b[36mLAW Splash Rule\x1b[0m')

test('LAW splash gives bonus to single-off-aspect bombs', () => {
  const strategy = new AllPlayerStrategy(null)
  strategy.committedLeader = mockLeader('Test Leader', ['Aggression', 'Heroism'])
  strategy.committedBaseColor = 'Cunning'

  // Card with exactly one primary color out of aspect (Vigilance not in our colors)
  const splashable = mockCard('Splash Bomb', {
    aspects: ['Vigilance'],
    rarity: 'Rare',
    set: 'LAW',
  })

  const bonus = strategy._calculateLAWSplashBonus(splashable, [], { setCode: 'LAW', pickInPack: 1 })
  assert(bonus > 0, `Splashable rare in LAW should get bonus, got ${bonus}`)
})

test('LAW splash rejects wrong alignment cards', () => {
  const strategy = new AllPlayerStrategy(null)
  strategy.committedLeader = mockLeader('Test Leader', ['Aggression', 'Heroism'])
  strategy.committedBaseColor = 'Cunning'

  const wrongAlignment = mockCard('Wrong Alignment', {
    aspects: ['Villainy', 'Vigilance'],  // Wrong alignment (Villainy) + out-of-color
    rarity: 'Rare',
    set: 'LAW',
  })

  const bonus = strategy._calculateLAWSplashBonus(wrongAlignment, [], { setCode: 'LAW' })
  assert(bonus === 0, `Wrong alignment card should get 0 splash bonus, got ${bonus}`)
})

test('LAW splash caps at 5 off-aspect cards', () => {
  const strategy = new AllPlayerStrategy(null)
  strategy.committedLeader = mockLeader('Test Leader', ['Aggression', 'Heroism'])
  strategy.committedBaseColor = 'Cunning'

  // Already have 5 off-aspect cards
  const existingOffAspect = Array.from({ length: 5 }, (_, i) =>
    mockCard(`Off${i}`, { aspects: ['Vigilance'], set: 'LAW' })
  )

  const newSplash = mockCard('Another Splash', {
    aspects: ['Vigilance'],
    rarity: 'Rare',
    set: 'LAW',
  })

  const bonus = strategy._calculateLAWSplashBonus(newSplash, existingOffAspect, { setCode: 'LAW' })
  assert(bonus === 0, `Should not splash more than 5, got bonus ${bonus}`)
})

test('non-LAW sets get no splash bonus', () => {
  const strategy = new AllPlayerStrategy(null)
  strategy.committedLeader = mockLeader('Test Leader', ['Aggression', 'Heroism'])

  const card = mockCard('Off-Color', { aspects: ['Vigilance'], rarity: 'Rare', set: 'SOR' })
  const bonus = strategy._calculateLAWSplashBonus(card, [], { setCode: 'SOR' })
  assert(bonus === 0, `Non-LAW should get 0 splash bonus, got ${bonus}`)
})

// --- Synergy Score Tests ---
console.log('\n\x1b[36mSynergy Scoring\x1b[0m')

test('leader trait synergy gives bonus', () => {
  const strategy = new AllPlayerStrategy(null)
  const leader = { ...mockLeader('Hera', ['Command', 'Heroism']), text: 'When you play a SPECTRE unit...' }

  const spectreCard = mockCard('Spectre Agent', { traits: ['SPECTRE'] })
  const normalCard = mockCard('Normal Unit', { traits: ['Trooper'] })

  const spectreBonus = strategy._checkLeaderTraitSynergy(spectreCard, leader)
  const normalBonus = strategy._checkLeaderTraitSynergy(normalCard, leader)

  assert(spectreBonus > 0, `SPECTRE card should get trait synergy bonus, got ${spectreBonus}`)
  assert(normalBonus === 0, `Non-matching trait should get 0, got ${normalBonus}`)
})

// --- Full Draft Simulation ---
console.log('\n\x1b[36mFull Draft Simulation\x1b[0m')

test('each strategy can complete a 42-pick draft without errors', () => {
  const strategies = [
    new TopPlayerStrategy(null),
    new TournamentPlayerStrategy(null),
    new AllPlayerStrategy(null),
    new NemesisStrategy(null),
    new DiversityStrategy(null),
    new PrimaryColorCornerStrategy(null),
    new SecondaryAspectCornerStrategy(null),
  ]

  for (const strategy of strategies) {
    const leaders = [
      mockLeader('Sabine Wren', ['Aggression', 'Heroism']),
      mockLeader('Boba Fett', ['Cunning', 'Villainy']),
      mockLeader('Yoda', ['Vigilance', 'Heroism']),
    ]

    // Simulate leader draft (3 rounds)
    for (let round = 1; round <= 3; round++) {
      const available = leaders.slice(round - 1, round + 1) // 2 options per round
      if (available.length === 0) continue
      strategy.selectLeader(available, {
        setCode: 'SOR',
        leaderRound: round,
        draftedLeaders: leaders.slice(0, round - 1),
      })
    }

    // Simulate card draft (42 picks across 3 packs of 14)
    const draftedCards: any[] = []
    const aspects = ['Aggression', 'Cunning', 'Vigilance', 'Command']

    for (let pick = 1; pick <= 42; pick++) {
      const packSize = Math.max(1, 15 - ((pick - 1) % 14))
      const pack: any[] = []
      for (let j = 0; j < packSize; j++) {
        const aspect = aspects[j % aspects.length]!
        const type = j < 8 ? 'Unit' : (j < 11 ? 'Event' : 'Upgrade')
        pack.push(mockCard(`Card_${pick}_${j}`, {
          type,
          aspects: [aspect],
          cost: (j % 6) + 1,
          rarity: j === 0 ? 'Rare' : 'Common',
        }))
      }

      const picked = strategy.selectCard(pack, {
        draftedLeaders: leaders,
        draftedCards: [...draftedCards],
        setCode: 'SOR',
        packNumber: Math.ceil(pick / 14),
        pickInPack: ((pick - 1) % 14) + 1,
      })

      assert(picked !== null, `${strategy.strategyName}: Pick ${pick} should not be null`)
      draftedCards.push(picked)
    }

    assert(draftedCards.length === 42,
      `${strategy.strategyName}: Should draft 42 cards, got ${draftedCards.length}`)

    // Should have committed to a leader
    assert(strategy.committedLeader !== null,
      `${strategy.strategyName}: Should have committed to a leader`)
  }
})

// --- createStrategy Round-Trip Tests ---
console.log('\n\x1b[36mcreateStrategy Round-Trip (for DB persistence)\x1b[0m')

test('createStrategy with name returns correct strategy type', () => {
  const pairs: [string, string][] = [
    ['topPlayer', 'topPlayer'],
    ['tournamentPlayer', 'tournamentPlayer'],
    ['allPlayer', 'allPlayer'],
    ['nemesis', 'nemesis'],
    ['diversity', 'diversity'],
    ['primaryColorCorner', 'primaryColorCorner'],
    ['secondaryAspectCorner', 'secondaryAspectCorner'],
  ]
  for (const [input, expected] of pairs) {
    const s = createStrategy(input, null)
    assert(s.strategyName === expected, `createStrategy('${input}') should have strategyName '${expected}', got '${s.strategyName}'`)
  }
})

test('createStrategy with mixin preserves mixin', () => {
  const s = createStrategy('topPlayer', MIXIN_A)
  assert(s.mixin === MIXIN_A, `Should preserve MIXIN_A, got ${s.mixin?.name}`)

  const s2 = createStrategy('allPlayer', MIXIN_B)
  assert(s2.mixin === MIXIN_B, `Should preserve MIXIN_B, got ${s2.mixin?.name}`)
})

test('createStrategy with unknown name falls back to allPlayer', () => {
  const s = createStrategy('nonExistent', null)
  assert(s.strategyName === 'allPlayer', `Unknown strategy should fall back to allPlayer, got ${s.strategyName}`)
})

test('mixin lookup by name works for all mixins', () => {
  const names = ['highOptionality', 'highConviction', 'highGroupthink']
  for (const name of names) {
    const found = ALL_MIXINS.find(m => m.name === name)
    assert(found !== undefined, `Should find mixin by name '${name}'`)
    assert(found.name === name, `Found mixin name should match`)
  }
})

// --- Strategy Descriptions Tests ---
console.log('\n\x1b[36mStrategy Descriptions\x1b[0m')

test('every strategy has a display name and description', () => {
  const strategyNames = ['topPlayer', 'tournamentPlayer', 'allPlayer', 'nemesis', 'diversity', 'primaryColorCorner', 'secondaryAspectCorner']
  for (const name of strategyNames) {
    assert(STRATEGY_DISPLAY_NAMES[name] !== undefined, `Missing display name for ${name}`)
    assert(STRATEGY_DESCRIPTIONS[name] !== undefined, `Missing description for ${name}`)
    assert(STRATEGY_DISPLAY_NAMES[name].length > 0, `Empty display name for ${name}`)
    assert(STRATEGY_DESCRIPTIONS[name].length > 0, `Empty description for ${name}`)
  }
})

test('every mixin has a display name and description', () => {
  const mixinNames = ['highOptionality', 'highConviction', 'highGroupthink']
  for (const name of mixinNames) {
    assert(MIXIN_DISPLAY_NAMES[name] !== undefined, `Missing display name for mixin ${name}`)
    assert(MIXIN_DESCRIPTIONS[name] !== undefined, `Missing description for mixin ${name}`)
  }
})

// --- Bot Deck Building Logic Tests ---
console.log('\n\x1b[36mBot Deck Building Logic\x1b[0m')

test('strategy scores 42 drafted cards and selects top 30', () => {
  const strategy = createStrategy('allPlayer', null)
  const leader = mockLeader('Sabine Wren', ['Aggression', 'Heroism'])
  strategy.committedLeader = leader
  strategy.committedBaseColor = 'Cunning'

  // Create 42 drafted cards
  const aspects = ['Aggression', 'Cunning', 'Vigilance', 'Command']
  const draftedCards = Array.from({ length: 42 }, (_, i) =>
    mockCard(`Card_${i}`, {
      aspects: [aspects[i % aspects.length]!],
      cost: (i % 6) + 1,
      rarity: i < 3 ? 'Rare' : 'Common',
    })
  )

  const scoredCards = draftedCards
    .map(card => ({
      card,
      score: strategy._scoreCard(card, [leader], draftedCards, 42, null, { setCode: 'SOR' })
    }))
    .sort((a, b) => b.score - a.score)

  const deckCards = scoredCards.slice(0, 30)
  const sideboardCards = scoredCards.slice(30)

  assert(deckCards.length === 30, `Deck should have 30 cards, got ${deckCards.length}`)
  assert(sideboardCards.length === 12, `Sideboard should have 12 cards, got ${sideboardCards.length}`)

  // Top scored cards should generally be in-color (Aggression)
  const inColorCount = deckCards.filter(s =>
    (s.card.aspects as string[]).includes('Aggression')
  ).length
  assert(inColorCount >= 8, `Deck should have many in-color cards, got ${inColorCount}/30`)
})

// Summary
console.log('\n\x1b[35m=================================\x1b[0m')
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
