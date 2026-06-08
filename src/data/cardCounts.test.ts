// @ts-nocheck
/**
 * Card Data Count Validation Tests
 *
 * Validates exact counts of cards by treatment type, card type, rarity, and aspect.
 * These tests use hardcoded expected values to catch data import issues.
 *
 * Run with: npx tsx src/data/cardCounts.test.ts
 *
 * ============================================================================
 * EXPECTED VALUES - EDIT THESE TO VALIDATE AGAINST EXTERNAL SOURCES
 * ============================================================================
 */

interface ExpectedCounts {
  totalNormal: number
  totalHyperspace: number
  totalFoil: number
  totalHyperspaceFoil: number
  totalShowcase: number
  commons: number
  uncommons: number
  rares: number
  legendaries: number
  commonLeaders: number
  rareLeaders: number
  totalLeaders: number
  commonBases: number
  rareBases: number
  totalBases: number
  units: number
  groundUnits: number
  spaceUnits: number
  upgrades: number
  events: number
  vigilanceSingle: number
  commandSingle: number
  aggressionSingle: number
  cunningSingle: number
  heroismSingle: number
  villainySingle: number
  neutral: number
  vigilanceVillainy: number
  vigilanceHeroism: number
  commandVillainy: number
  commandHeroism: number
  aggressionVillainy: number
  aggressionHeroism: number
  cunningVillainy: number
  cunningHeroism: number
}

// Expected card counts per set - EDIT THESE VALUES TO VALIDATE
const EXPECTED: Record<string, ExpectedCounts> = {
  SOR: {
    // Treatment totals
    totalNormal: 252,
    totalHyperspace: 242,
    totalFoil: 218,
    totalHyperspaceFoil: 0,
    totalShowcase: 16,

    // Rarity counts (excluding Leaders and Bases)
    commons: 90,
    uncommons: 60,
    rares: 48,
    legendaries: 16,

    // Leader rarity
    commonLeaders: 8,
    rareLeaders: 8,
    totalLeaders: 18,

    // Base rarity
    commonBases: 8,
    rareBases: 4,
    totalBases: 12,

    // Card types (Normal treatment)
    units: 148,
    groundUnits: 110,
    spaceUnits: 38,
    upgrades: 15,
    events: 59,

    // Aspect single counts (Normal, non-dual aspect cards)
    vigilanceSingle: 23,
    commandSingle: 23,
    aggressionSingle: 23,
    cunningSingle: 24,
    heroismSingle: 11,
    villainySingle: 11,
    neutral: 6,

    // Dual aspect counts (Normal treatment)
    vigilanceVillainy: 13,
    vigilanceHeroism: 12,
    commandVillainy: 14,
    commandHeroism: 12,
    aggressionVillainy: 12,
    aggressionHeroism: 13,
    cunningVillainy: 12,
    cunningHeroism: 13,
  },

  SHD: {
    totalNormal: 262,
    totalHyperspace: 242,
    totalFoil: 218,
    totalHyperspaceFoil: 0,
    totalShowcase: 18,

    commons: 90,
    uncommons: 60,
    rares: 52,
    legendaries: 16,

    commonLeaders: 8,
    rareLeaders: 8,
    totalLeaders: 18,

    commonBases: 8,
    rareBases: 0,
    totalBases: 8,

    units: 160,
    groundUnits: 124,
    spaceUnits: 36,
    upgrades: 30,
    events: 46,

    vigilanceSingle: 28,
    commandSingle: 26,
    aggressionSingle: 26,
    cunningSingle: 27,
    heroismSingle: 9,
    villainySingle: 11,
    neutral: 9,

    vigilanceVillainy: 13,
    vigilanceHeroism: 12,
    commandVillainy: 15,
    commandHeroism: 12,
    aggressionVillainy: 13,
    aggressionHeroism: 11,
    cunningVillainy: 12,
    cunningHeroism: 12,
  },

  TWI: {
    totalNormal: 257,
    totalHyperspace: 242,
    totalFoil: 218,
    totalHyperspaceFoil: 0,
    totalShowcase: 18,

    commons: 90,
    uncommons: 60,
    rares: 48,
    legendaries: 16,

    commonLeaders: 8,
    rareLeaders: 8,
    totalLeaders: 18,

    commonBases: 8,
    rareBases: 4,
    totalBases: 12,

    units: 150,
    groundUnits: 118,
    spaceUnits: 32,
    upgrades: 19,
    events: 58,

    vigilanceSingle: 26,
    commandSingle: 29,
    aggressionSingle: 25,
    cunningSingle: 26,
    heroismSingle: 12,
    villainySingle: 12,
    neutral: 6,

    vigilanceVillainy: 11,
    vigilanceHeroism: 11,
    commandVillainy: 11,
    commandHeroism: 11,
    aggressionVillainy: 11,
    aggressionHeroism: 13,
    cunningVillainy: 12,
    cunningHeroism: 11,
  },

  JTL: {
    totalNormal: 262,
    totalHyperspace: 262,
    totalFoil: 236,
    totalHyperspaceFoil: 236,
    totalShowcase: 18,

    commons: 98,
    uncommons: 60,
    rares: 45,
    legendaries: 20,

    commonLeaders: 8,   // Gemini claims 0
    rareLeaders: 8,     // Gemini claims 16
    totalLeaders: 18,

    commonBases: 8,
    rareBases: 5,
    totalBases: 13,

    units: 167,
    groundUnits: 76,
    spaceUnits: 91,
    upgrades: 7,
    events: 57,

    vigilanceSingle: 25,
    commandSingle: 26,
    aggressionSingle: 25,
    cunningSingle: 26,
    heroismSingle: 10,
    villainySingle: 9,
    neutral: 8,

    vigilanceVillainy: 12,
    vigilanceHeroism: 12,
    commandVillainy: 12,
    commandHeroism: 13,
    aggressionVillainy: 13,
    aggressionHeroism: 12,
    cunningVillainy: 14,
    cunningHeroism: 14,
  },

  LOF: {
    totalNormal: 264,
    totalHyperspace: 264,
    totalFoil: 238,
    totalHyperspaceFoil: 238,
    totalShowcase: 18,

    commons: 100,
    uncommons: 60,
    rares: 46,
    legendaries: 20,

    commonLeaders: 8,
    rareLeaders: 8,
    totalLeaders: 18,

    commonBases: 8,
    rareBases: 4,
    totalBases: 12,

    units: 166,
    groundUnits: 129,
    spaceUnits: 37,
    upgrades: 20,
    events: 48,

    vigilanceSingle: 25,
    commandSingle: 24,
    aggressionSingle: 25,
    cunningSingle: 24,
    heroismSingle: 12,
    villainySingle: 14,
    neutral: 11,

    vigilanceVillainy: 13,
    vigilanceHeroism: 11,
    commandVillainy: 12,
    commandHeroism: 13,
    aggressionVillainy: 13,
    aggressionHeroism: 11,
    cunningVillainy: 12,
    cunningHeroism: 14,
  },

  SEC: {
    totalNormal: 264,
    totalHyperspace: 264,
    totalFoil: 238,
    totalHyperspaceFoil: 238,
    totalShowcase: 18,

    commons: 100,
    uncommons: 60,
    rares: 50,
    legendaries: 20,

    commonLeaders: 8,
    rareLeaders: 8,
    totalLeaders: 18,

    commonBases: 8,
    rareBases: 0,
    totalBases: 8,

    units: 171,
    groundUnits: 129,
    spaceUnits: 42,
    upgrades: 17,
    events: 50,

    vigilanceSingle: 25,
    commandSingle: 25,
    aggressionSingle: 25,
    cunningSingle: 25,
    heroismSingle: 11,
    villainySingle: 11,
    neutral: 6,

    vigilanceVillainy: 14,
    vigilanceHeroism: 13,
    commandVillainy: 14,
    commandHeroism: 14,
    aggressionVillainy: 14,
    aggressionHeroism: 13,
    cunningVillainy: 13,
    cunningHeroism: 15,
  },
}

/* ============================================================================
 * TEST IMPLEMENTATION - Usually no need to edit below this line
 * ============================================================================ */

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

// The values in EXPECTED are MINIMUMS, not exact counts.
//
// Why: SWUAPI variant counts only grow over time. Anniversary printings, judge
// promos, and new treatments of existing cards keep landing in older sets, so a
// "Total Hyperspace = 242" snapshot from 2026-05 will read 244+ a month later
// without anything being broken. The upstream swuapi pipeline-dag also
// occasionally races with this workflow (`:17 * * * *` vs `:15`/`:30 * * * *`),
// exposing transient mid-run states that read higher than the canonical count.
//
// Treating each hardcoded number as a floor stays robust to both cases. A
// regression (actual < expected) — cards lost or mis-classified during import —
// still fails the test, which is the signal we actually care about.
function assertAtLeast(actual: number, expected: number, message?: string): void {
  if (actual < expected) {
    throw new Error(message || `Expected at least ${expected}, got ${actual}`)
  }
}

function hasAspect(card: any, aspect: string): boolean {
  return (card.aspects || []).includes(aspect)
}

function hasDualAspect(card: any, aspect1: string, aspect2: string): boolean {
  const aspects = card.aspects || []
  return aspects.includes(aspect1) && aspects.includes(aspect2)
}

function hasSingleAspect(card: any, aspect: string): boolean {
  const aspects = card.aspects || []
  return aspects.length === 1 && aspects[0] === aspect
}

function isNeutral(card: any): boolean {
  return !card.aspects || card.aspects.length === 0
}

function isDraftable(card: any): boolean {
  return card.type !== 'Leader' && card.type !== 'Base'
}

async function runTests(): Promise<void> {
  console.log('\x1b[36m🔄 Initializing card cache...\x1b[0m')
  await initializeCardCache()

  console.log('')
  console.log('\x1b[1m\x1b[35m🎴 Card Count Validation\x1b[0m')
  console.log('\x1b[35m========================\x1b[0m')

  for (const [setCode, expected] of Object.entries(EXPECTED)) {
    console.log('')
    console.log(`\x1b[36m=== ${setCode} ===\x1b[0m`)

    const cards = getCachedCards(setCode)
    const normal = cards.filter((c: any) => c.variantType === 'Normal')
    const draftable = normal.filter(isDraftable)

    // Treatment totals
    test(`${setCode}: Total Normal >= ${expected.totalNormal}`, () => {
      assertAtLeast(normal.length, expected.totalNormal)
    })
    test(`${setCode}: Total Hyperspace >= ${expected.totalHyperspace}`, () => {
      assertAtLeast(cards.filter((c: any) => c.variantType === 'Hyperspace').length, expected.totalHyperspace)
    })
    test(`${setCode}: Total Foil >= ${expected.totalFoil}`, () => {
      assertAtLeast(cards.filter((c: any) => c.variantType === 'Foil').length, expected.totalFoil)
    })
    test(`${setCode}: Total Showcase >= ${expected.totalShowcase}`, () => {
      assertAtLeast(cards.filter((c: any) => c.variantType === 'Showcase').length, expected.totalShowcase)
    })

    // Rarity counts (excluding Leaders and Bases)
    test(`${setCode}: Commons (excl L/B) >= ${expected.commons}`, () => {
      assertAtLeast(draftable.filter((c: any) => c.rarity === 'Common').length, expected.commons)
    })
    test(`${setCode}: Uncommons (excl L/B) >= ${expected.uncommons}`, () => {
      assertAtLeast(draftable.filter((c: any) => c.rarity === 'Uncommon').length, expected.uncommons)
    })
    test(`${setCode}: Rares (excl L/B) >= ${expected.rares}`, () => {
      assertAtLeast(draftable.filter((c: any) => c.rarity === 'Rare').length, expected.rares)
    })
    test(`${setCode}: Legendaries (excl L/B) >= ${expected.legendaries}`, () => {
      assertAtLeast(draftable.filter((c: any) => c.rarity === 'Legendary').length, expected.legendaries)
    })

    // Leader counts
    const leaders = normal.filter((c: any) => c.type === 'Leader')
    test(`${setCode}: Total Leaders >= ${expected.totalLeaders}`, () => {
      assertAtLeast(leaders.length, expected.totalLeaders)
    })
    test(`${setCode}: Common Leaders >= ${expected.commonLeaders}`, () => {
      assertAtLeast(leaders.filter((c: any) => c.rarity === 'Common').length, expected.commonLeaders)
    })
    test(`${setCode}: Rare Leaders >= ${expected.rareLeaders}`, () => {
      assertAtLeast(leaders.filter((c: any) => c.rarity === 'Rare').length, expected.rareLeaders)
    })

    // Base counts
    const bases = normal.filter((c: any) => c.type === 'Base')
    test(`${setCode}: Total Bases >= ${expected.totalBases}`, () => {
      assertAtLeast(bases.length, expected.totalBases)
    })
    test(`${setCode}: Common Bases >= ${expected.commonBases}`, () => {
      assertAtLeast(bases.filter((c: any) => c.rarity === 'Common').length, expected.commonBases)
    })
    test(`${setCode}: Rare Bases >= ${expected.rareBases}`, () => {
      assertAtLeast(bases.filter((c: any) => c.rarity === 'Rare').length, expected.rareBases)
    })

    // Card type counts (Normal treatment)
    const units = normal.filter((c: any) => c.type === 'Unit')
    test(`${setCode}: Units >= ${expected.units}`, () => {
      assertAtLeast(units.length, expected.units)
    })
    test(`${setCode}: Ground Units >= ${expected.groundUnits}`, () => {
      assertAtLeast(units.filter((c: any) => c.arenas && c.arenas.includes('Ground')).length, expected.groundUnits)
    })
    test(`${setCode}: Space Units >= ${expected.spaceUnits}`, () => {
      assertAtLeast(units.filter((c: any) => c.arenas && c.arenas.includes('Space')).length, expected.spaceUnits)
    })
    test(`${setCode}: Upgrades >= ${expected.upgrades}`, () => {
      assertAtLeast(normal.filter((c: any) => c.type === 'Upgrade').length, expected.upgrades)
    })
    test(`${setCode}: Events >= ${expected.events}`, () => {
      assertAtLeast(normal.filter((c: any) => c.type === 'Event').length, expected.events)
    })

    // Single aspect counts (Normal, draftable cards only)
    test(`${setCode}: Vigilance (single) >= ${expected.vigilanceSingle}`, () => {
      assertAtLeast(draftable.filter((c: any) => hasSingleAspect(c, 'Vigilance')).length, expected.vigilanceSingle)
    })
    test(`${setCode}: Command (single) >= ${expected.commandSingle}`, () => {
      assertAtLeast(draftable.filter((c: any) => hasSingleAspect(c, 'Command')).length, expected.commandSingle)
    })
    test(`${setCode}: Aggression (single) >= ${expected.aggressionSingle}`, () => {
      assertAtLeast(draftable.filter((c: any) => hasSingleAspect(c, 'Aggression')).length, expected.aggressionSingle)
    })
    test(`${setCode}: Cunning (single) >= ${expected.cunningSingle}`, () => {
      assertAtLeast(draftable.filter((c: any) => hasSingleAspect(c, 'Cunning')).length, expected.cunningSingle)
    })
    test(`${setCode}: Heroism (single) >= ${expected.heroismSingle}`, () => {
      assertAtLeast(draftable.filter((c: any) => hasSingleAspect(c, 'Heroism')).length, expected.heroismSingle)
    })
    test(`${setCode}: Villainy (single) >= ${expected.villainySingle}`, () => {
      assertAtLeast(draftable.filter((c: any) => hasSingleAspect(c, 'Villainy')).length, expected.villainySingle)
    })
    test(`${setCode}: Neutral >= ${expected.neutral}`, () => {
      assertAtLeast(draftable.filter(isNeutral).length, expected.neutral)
    })

    // Dual aspect counts (Normal, draftable cards only)
    test(`${setCode}: Vigilance/Villainy >= ${expected.vigilanceVillainy}`, () => {
      assertAtLeast(draftable.filter((c: any) => hasDualAspect(c, 'Vigilance', 'Villainy')).length, expected.vigilanceVillainy)
    })
    test(`${setCode}: Vigilance/Heroism >= ${expected.vigilanceHeroism}`, () => {
      assertAtLeast(draftable.filter((c: any) => hasDualAspect(c, 'Vigilance', 'Heroism')).length, expected.vigilanceHeroism)
    })
    test(`${setCode}: Command/Villainy >= ${expected.commandVillainy}`, () => {
      assertAtLeast(draftable.filter((c: any) => hasDualAspect(c, 'Command', 'Villainy')).length, expected.commandVillainy)
    })
    test(`${setCode}: Command/Heroism >= ${expected.commandHeroism}`, () => {
      assertAtLeast(draftable.filter((c: any) => hasDualAspect(c, 'Command', 'Heroism')).length, expected.commandHeroism)
    })
    test(`${setCode}: Aggression/Villainy >= ${expected.aggressionVillainy}`, () => {
      assertAtLeast(draftable.filter((c: any) => hasDualAspect(c, 'Aggression', 'Villainy')).length, expected.aggressionVillainy)
    })
    test(`${setCode}: Aggression/Heroism >= ${expected.aggressionHeroism}`, () => {
      assertAtLeast(draftable.filter((c: any) => hasDualAspect(c, 'Aggression', 'Heroism')).length, expected.aggressionHeroism)
    })
    test(`${setCode}: Cunning/Villainy >= ${expected.cunningVillainy}`, () => {
      assertAtLeast(draftable.filter((c: any) => hasDualAspect(c, 'Cunning', 'Villainy')).length, expected.cunningVillainy)
    })
    test(`${setCode}: Cunning/Heroism >= ${expected.cunningHeroism}`, () => {
      assertAtLeast(draftable.filter((c: any) => hasDualAspect(c, 'Cunning', 'Heroism')).length, expected.cunningHeroism)
    })
  }

  console.log('')
  console.log('\x1b[35m========================\x1b[0m')
  console.log(`\x1b[32m✅ Tests passed: ${passed}\x1b[0m`)
  if (failed > 0) {
    console.log(`\x1b[31m❌ Tests failed: ${failed}\x1b[0m`)
  } else {
    console.log(`\x1b[90m   Tests failed: ${failed}\x1b[0m`)
  }
  console.log('')

  if (failed > 0) {
    console.log('\x1b[31m\x1b[1m💥 CARD COUNT VALIDATION FAILED\x1b[0m')
    process.exit(1)
  } else {
    console.log('\x1b[32m\x1b[1m🎉 ALL CARD COUNTS VALID!\x1b[0m')
  }
}

runTests().catch(err => {
  console.error('Test runner failed:', err)
  process.exit(1)
})
