// @ts-nocheck
/**
 * Carbonite Booster Pack Tests
 *
 * Run with: node src/utils/carboniteBoosterPack.test.ts
 *
 * Tests validate:
 * - Pack structure (16 cards per pack)
 * - Leader is always HS or Showcase
 * - Pre-LAW rarity-specific foil block:
 *   [1-4] Common Foil x4, [5-6] UC Foil x2, [7] R/L Foil
 * - [8] Prestige card in every pack
 * - Pre-LAW rarity-specific HS block:
 *   [9-11] Common HS x3, [12] UC HS, [13] R/L HS
 * - [14-15] HSF x2
 * - LAW has no foils, uses weighted mixed-rarity HS
 * - No Normal variant cards in Carbonite packs
 * - Composite code parsing
 * - Showcase rate
 */

import { generateCarboniteBoosterPack, clearCarboniteBeltCache } from './carboniteBoosterPack'
import { initializeCardCache } from './cardCache'

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
  console.log('\x1b[1m\x1b[35m🧊 Carbonite Booster Pack Tests\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(50) + '\x1b[0m')

  // ======================
  // Pre-LAW tests (JTL)
  // ======================
  console.log('')
  console.log('\x1b[1m\x1b[35mPre-LAW Carbonite (JTL)\x1b[0m')

  test('JTL-CB: pack has 16 cards', () => {
    clearCarboniteBeltCache()
    const pack = generateCarboniteBoosterPack('JTL-CB')
    assertEqual(pack.cards.length, 16, `Expected 16 cards, got ${pack.cards.length}`)
  })

  test('JTL-CB: slot 0 — leader is Hyperspace or Showcase', () => {
    clearCarboniteBeltCache()
    const pack = generateCarboniteBoosterPack('JTL-CB')
    const leader = pack.cards[0]
    assert(leader.isLeader, 'First card should be a leader')
    assert(
      leader.isHyperspace || leader.isShowcase,
      `Leader should be HS or Showcase, got variantType=${leader.variantType}`
    )
  })

  test('JTL-CB: slots 1-4 are Common Foils', () => {
    clearCarboniteBeltCache()
    for (let p = 0; p < 10; p++) {
      const pack = generateCarboniteBoosterPack('JTL-CB')
      for (let i = 1; i <= 4; i++) {
        const card = pack.cards[i]
        assert(card.isFoil === true, `Pack ${p}, slot ${i}: should be foil`)
        assertEqual(card.rarity, 'Common',
          `Pack ${p}, slot ${i}: should be Common, got ${card.rarity}`)
      }
    }
  })

  test('JTL-CB: slots 5-6 are Uncommon Foils', () => {
    clearCarboniteBeltCache()
    for (let p = 0; p < 10; p++) {
      const pack = generateCarboniteBoosterPack('JTL-CB')
      for (let i = 5; i <= 6; i++) {
        const card = pack.cards[i]
        assert(card.isFoil === true, `Pack ${p}, slot ${i}: should be foil`)
        assertEqual(card.rarity, 'Uncommon',
          `Pack ${p}, slot ${i}: should be Uncommon, got ${card.rarity}`)
      }
    }
  })

  test('JTL-CB: slot 7 is R/L/S Foil', () => {
    clearCarboniteBeltCache()
    for (let p = 0; p < 20; p++) {
      const pack = generateCarboniteBoosterPack('JTL-CB')
      const rlFoil = pack.cards[7]
      assert(rlFoil.isFoil === true, `Pack ${p}: slot 7 should be foil`)
      assert(
        rlFoil.rarity === 'Rare' || rlFoil.rarity === 'Legendary' || rlFoil.rarity === 'Special',
        `Pack ${p}: slot 7 should be R/L/S, got ${rlFoil.rarity}`
      )
    }
  })

  test('JTL-CB: slot 8 is Prestige', () => {
    clearCarboniteBeltCache()
    const pack = generateCarboniteBoosterPack('JTL-CB')
    const prestige = pack.cards[8]
    const prestigeVariants = ['Standard Prestige', 'Foil Prestige', 'Serialized Prestige']
    assert(prestigeVariants.includes(prestige.variantType), `Slot 8 should be Prestige, got ${prestige.variantType}`)
    assert(prestige.isPrestige === true, 'Slot 8 should have isPrestige flag')
  })

  test('JTL-CB: slots 9-11 are Common Hyperspace', () => {
    clearCarboniteBeltCache()
    for (let p = 0; p < 10; p++) {
      const pack = generateCarboniteBoosterPack('JTL-CB')
      for (let i = 9; i <= 11; i++) {
        const card = pack.cards[i]
        assert(card.isHyperspace === true, `Pack ${p}, slot ${i}: should be hyperspace`)
        assert(!card.isFoil, `Pack ${p}, slot ${i}: should NOT be foil`)
        assertEqual(card.rarity, 'Common',
          `Pack ${p}, slot ${i}: should be Common, got ${card.rarity}`)
      }
    }
  })

  test('JTL-CB: slot 12 is Uncommon Hyperspace', () => {
    clearCarboniteBeltCache()
    for (let p = 0; p < 10; p++) {
      const pack = generateCarboniteBoosterPack('JTL-CB')
      const card = pack.cards[12]
      assert(card.isHyperspace === true, `Pack ${p}: slot 12 should be hyperspace`)
      assert(!card.isFoil, `Pack ${p}: slot 12 should NOT be foil`)
      assertEqual(card.rarity, 'Uncommon',
        `Pack ${p}: slot 12 should be Uncommon, got ${card.rarity}`)
    }
  })

  test('JTL-CB: slot 13 is R/L/S Hyperspace', () => {
    clearCarboniteBeltCache()
    for (let p = 0; p < 20; p++) {
      const pack = generateCarboniteBoosterPack('JTL-CB')
      const card = pack.cards[13]
      assert(card.isHyperspace === true, `Pack ${p}: slot 13 should be hyperspace`)
      assert(!card.isFoil, `Pack ${p}: slot 13 should NOT be foil`)
      assert(
        card.rarity === 'Rare' || card.rarity === 'Legendary' || card.rarity === 'Special',
        `Pack ${p}: slot 13 should be R/L/S, got ${card.rarity}`
      )
    }
  })

  test('JTL-CB: slots 14-15 are Hyperspace Foil', () => {
    clearCarboniteBeltCache()
    const pack = generateCarboniteBoosterPack('JTL-CB')
    for (let i = 14; i <= 15; i++) {
      assert(pack.cards[i].isFoil === true, `Slot ${i} should be foil`)
      assert(pack.cards[i].isHyperspace === true, `Slot ${i} should be hyperspace`)
    }
  })

  test('JTL-CB: no Normal variant cards in pack', () => {
    clearCarboniteBeltCache()
    for (let i = 0; i < 10; i++) {
      const pack = generateCarboniteBoosterPack('JTL-CB')
      for (let j = 0; j < pack.cards.length; j++) {
        const card = pack.cards[j]
        assert(
          card.variantType !== 'Normal' || card.isHyperspace || card.isFoil || card.isPrestige || card.isShowcase,
          `Pack ${i}, slot ${j}: card "${card.name}" should be a variant, got variantType=${card.variantType}, flags: HS=${card.isHyperspace}, foil=${card.isFoil}`
        )
      }
    }
  })

  // ======================
  // LAW tests
  // ======================
  console.log('')
  console.log('\x1b[1m\x1b[35mLAW+ Carbonite\x1b[0m')

  test('LAW-CB: pack has 16 cards', () => {
    clearCarboniteBeltCache()
    const pack = generateCarboniteBoosterPack('LAW-CB')
    assertEqual(pack.cards.length, 16, `Expected 16 cards, got ${pack.cards.length}`)
  })

  test('LAW-CB: leader is Hyperspace or Showcase', () => {
    clearCarboniteBeltCache()
    const pack = generateCarboniteBoosterPack('LAW-CB')
    const leader = pack.cards[0]
    assert(leader.isLeader, 'First card should be a leader')
    assert(
      leader.isHyperspace || leader.isShowcase,
      `Leader should be HS or Showcase`
    )
  })

  test('LAW-CB: slot 1 is Prestige', () => {
    clearCarboniteBeltCache()
    const pack = generateCarboniteBoosterPack('LAW-CB')
    const prestige = pack.cards[1]
    const prestigeVariants = ['Standard Prestige', 'Foil Prestige', 'Serialized Prestige']
    assert(prestigeVariants.includes(prestige.variantType), `Slot 1 should be Prestige, got ${prestige.variantType}`)
    assert(prestige.isPrestige === true, 'Slot 1 should have isPrestige flag')
  })

  test('LAW-CB: slots 2-5 are Common HS (fixed)', () => {
    clearCarboniteBeltCache()
    for (let p = 0; p < 10; p++) {
      const pack = generateCarboniteBoosterPack('LAW-CB')
      for (let i = 2; i <= 5; i++) {
        assert(pack.cards[i].isHyperspace === true, `Pack ${p}, slot ${i} should be hyperspace`)
        assert(!pack.cards[i].isFoil, `Pack ${p}, slot ${i} should NOT be foil`)
        assertEqual(pack.cards[i].rarity, 'Common',
          `Pack ${p}, slot ${i}: should be Common, got ${pack.cards[i].rarity}`)
      }
    }
  })

  test('LAW-CB: slots 6-8 are HS flex (any rarity)', () => {
    clearCarboniteBeltCache()
    for (let p = 0; p < 10; p++) {
      const pack = generateCarboniteBoosterPack('LAW-CB')
      for (let i = 6; i <= 8; i++) {
        assert(pack.cards[i].isHyperspace === true, `Pack ${p}, slot ${i} should be hyperspace`)
        assert(!pack.cards[i].isFoil, `Pack ${p}, slot ${i} should NOT be foil`)
      }
    }
  })

  test('LAW-CB: slot 9 is R/S/L HS (top slot)', () => {
    clearCarboniteBeltCache()
    for (let p = 0; p < 20; p++) {
      const pack = generateCarboniteBoosterPack('LAW-CB')
      const card = pack.cards[9]
      assert(card.isHyperspace === true, `Pack ${p}: slot 9 should be hyperspace`)
      assert(!card.isFoil, `Pack ${p}: slot 9 should NOT be foil`)
      assert(
        card.rarity === 'Rare' || card.rarity === 'Legendary' || card.rarity === 'Special',
        `Pack ${p}: slot 9 should be R/S/L, got ${card.rarity}`
      )
    }
  })

  test('LAW-CB: slots 10-13 are HSF flex (any rarity)', () => {
    clearCarboniteBeltCache()
    for (let p = 0; p < 10; p++) {
      const pack = generateCarboniteBoosterPack('LAW-CB')
      for (let i = 10; i <= 13; i++) {
        assert(pack.cards[i].isFoil === true, `Pack ${p}, slot ${i} should be foil`)
        assert(pack.cards[i].isHyperspace === true, `Pack ${p}, slot ${i} should be hyperspace`)
      }
    }
  })

  test('LAW-CB: slots 14-15 are Common HSF (fixed)', () => {
    clearCarboniteBeltCache()
    for (let p = 0; p < 10; p++) {
      const pack = generateCarboniteBoosterPack('LAW-CB')
      for (let i = 14; i <= 15; i++) {
        assert(pack.cards[i].isFoil === true, `Pack ${p}, slot ${i} should be foil`)
        assert(pack.cards[i].isHyperspace === true, `Pack ${p}, slot ${i} should be hyperspace`)
        assertEqual(pack.cards[i].rarity, 'Common',
          `Pack ${p}, slot ${i}: should be Common, got ${pack.cards[i].rarity}`)
      }
    }
  })

  test('LAW-CB: no traditional foils (isFoil without isHyperspace or isPrestige)', () => {
    clearCarboniteBeltCache()
    for (let i = 0; i < 10; i++) {
      const pack = generateCarboniteBoosterPack('LAW-CB')
      for (const card of pack.cards) {
        if (card.isFoil) {
          assert(card.isHyperspace === true || card.isPrestige === true,
            `LAW-CB should have no traditional foils, found foil "${card.name}" without HS or Prestige flag`)
        }
      }
    }
  })

  // ======================
  // ASH tests — bespoke calibrated layout (real 48-pack case)
  // Structure: [0] leader HS · [1-8] HS ascending (R/L top at 8) · [9] prestige (pos 10)
  //            · [10-15] HSF (≥U top at 10, then descending)
  // ======================
  console.log('')
  console.log('\x1b[1m\x1b[35mASH Carbonite (calibrated layout)\x1b[0m')

  const RANK: Record<string, number> = { Common: 0, Uncommon: 1, Special: 2, Rare: 3, Legendary: 4 }

  test('ASH-CB: pack has 16 cards', () => {
    clearCarboniteBeltCache()
    const pack = generateCarboniteBoosterPack('ASH-CB')
    assertEqual(pack.cards.length, 16, `Expected 16 cards, got ${pack.cards.length}`)
  })

  test('ASH-CB: leader is Hyperspace or Showcase', () => {
    clearCarboniteBeltCache()
    const leader = generateCarboniteBoosterPack('ASH-CB').cards[0]
    assert(leader.isLeader, 'First card should be a leader')
    assert(leader.isHyperspace || leader.isShowcase, `Leader should be HS or Showcase`)
  })

  test('ASH-CB: prestige at pos 10 (index 9), after the HS run', () => {
    // SPEC: real 48-pack case — prestige at pos 10 in 48/48 (generator used to emit at pos 2)
    clearCarboniteBeltCache()
    for (let p = 0; p < 10; p++) {
      const pack = generateCarboniteBoosterPack('ASH-CB')
      const prestige = pack.cards[9]
      assert(['Standard Prestige', 'Foil Prestige', 'Serialized Prestige'].includes(prestige.variantType),
        `Pack ${p}: index 9 should be Prestige, got ${prestige.variantType}`)
      assert(prestige.isPrestige === true, `Pack ${p}: index 9 should have isPrestige`)
      assert(!pack.cards[1].isPrestige, `Pack ${p}: index 1 should NOT be prestige anymore`)
    }
  })

  test('ASH-CB: HS run (1-8) is all HS non-foil, ascending by rarity', () => {
    // SPEC: real case — HS run ascends 48/48 (commons → R/L top)
    clearCarboniteBeltCache()
    for (let p = 0; p < 30; p++) {
      const hs = generateCarboniteBoosterPack('ASH-CB').cards.slice(1, 9)
      for (const c of hs) {
        assert(c.isHyperspace === true && !c.isFoil, `Pack ${p}: HS run must be Hyperspace non-foil`)
      }
      const ranks = hs.map(c => RANK[c.rarity])
      assert(ranks.every((v, i) => i === 0 || v >= ranks[i - 1]),
        `Pack ${p}: HS run must be ascending by rarity, got ${hs.map(c => c.rarity).join(',')}`)
    }
  })

  test('ASH-CB: HS top (pos 9 / index 8) is R/L only — never Special', () => {
    // SPEC: real case — top R 38 / L 10 / S 0 over 48
    clearCarboniteBeltCache()
    for (let p = 0; p < 40; p++) {
      const c = generateCarboniteBoosterPack('ASH-CB').cards[8]
      assert(c.isHyperspace === true && !c.isFoil, `Pack ${p}: HS top must be Hyperspace non-foil`)
      assert(c.rarity === 'Rare' || c.rarity === 'Legendary', `Pack ${p}: HS top must be R/L, got ${c.rarity}`)
    }
  })

  test('ASH-CB: HSF run (10-15) is all HSF; top (pos 11) never Common', () => {
    // SPEC: real case — HSF pos 11 is U 24 / R 19 / L 5, never Common (guaranteed ≥U slot)
    clearCarboniteBeltCache()
    for (let p = 0; p < 30; p++) {
      const hsf = generateCarboniteBoosterPack('ASH-CB').cards.slice(10, 16)
      for (const c of hsf) {
        assert(c.isFoil === true && c.isHyperspace === true, `Pack ${p}: HSF run must be foil+hyperspace`)
      }
      assert(hsf[0].rarity !== 'Common', `Pack ${p}: HSF top (pos 11) must be ≥Uncommon, got ${hsf[0].rarity}`)
      // the remaining 5 (pos 12-16) descend by rarity
      const restRanks = hsf.slice(1).map(c => RANK[c.rarity])
      assert(restRanks.every((v, i) => i === 0 || v <= restRanks[i - 1]),
        `Pack ${p}: HSF pos 12-16 must descend, got ${hsf.slice(1).map(c => c.rarity).join(',')}`)
    }
  })

  test('ASH-CB: HS non-common count is 3 or 4 (real case never 2 or ≥5)', () => {
    // SPEC: real case — non-common count 3 (38pk) / 4 (10pk) over 48
    clearCarboniteBeltCache()
    for (let p = 0; p < 200; p++) {
      const hs = generateCarboniteBoosterPack('ASH-CB').cards.slice(1, 9)
      const nc = hs.filter(c => c.rarity !== 'Common').length
      assert(nc === 3 || nc === 4, `Pack ${p}: HS non-common count should be 3 or 4, got ${nc}`)
    }
  })

  test('ASH-CB: no Normal-only cards (every card has a variant flag)', () => {
    clearCarboniteBeltCache()
    for (let i = 0; i < 10; i++) {
      for (const card of generateCarboniteBoosterPack('ASH-CB').cards) {
        assert(card.isFoil || card.isHyperspace || card.isShowcase || card.isPrestige,
          `ASH-CB should have no Normal-only cards, found "${card.name}" with no variant flag`)
      }
    }
  })

  // ======================
  // All sets tests
  // ======================
  console.log('')
  console.log('\x1b[1m\x1b[35mAll Supported Sets\x1b[0m')

  test('all supported sets produce 16-card packs', () => {
    for (const setCode of ['JTL-CB', 'LOF-CB', 'SEC-CB', 'LAW-CB', 'ASH-CB']) {
      clearCarboniteBeltCache()
      const pack = generateCarboniteBoosterPack(setCode)
      assertEqual(pack.cards.length, 16, `${setCode} should have 16 cards, got ${pack.cards.length}`)
    }
  })

  test('all packs have exactly 1 Prestige card', () => {
    for (const setCode of ['JTL-CB', 'LOF-CB', 'SEC-CB', 'LAW-CB', 'ASH-CB']) {
      clearCarboniteBeltCache()
      for (let i = 0; i < 5; i++) {
        const pack = generateCarboniteBoosterPack(setCode)
        const prestigeCount = pack.cards.filter(c => c.isPrestige).length
        assertEqual(prestigeCount, 1, `${setCode} pack ${i}: expected 1 prestige, got ${prestigeCount}`)
      }
    }
  })

  test('composite code parsing: JTL-CB uses JTL card pool', () => {
    clearCarboniteBeltCache()
    const pack = generateCarboniteBoosterPack('JTL-CB')
    for (const card of pack.cards) {
      assertEqual(card.set, 'JTL', `Card "${card.name}" should be from JTL, got ${card.set}`)
    }
  })

  test('composite code parsing: LOF-CB uses LOF card pool', () => {
    clearCarboniteBeltCache()
    const pack = generateCarboniteBoosterPack('LOF-CB')
    for (const card of pack.cards) {
      assertEqual(card.set, 'LOF', `Card "${card.name}" should be from LOF, got ${card.set}`)
    }
  })

  test('unsupported set throws error', () => {
    let threw = false
    try {
      generateCarboniteBoosterPack('SOR-CB')
    } catch (e) {
      threw = true
      assert(e.message.includes('not available'), `Error should mention "not available", got: ${e.message}`)
    }
    assert(threw, 'Should throw for unsupported set SOR-CB')
  })

  // ======================
  // Pre-LAW rarity counts
  // ======================
  console.log('')
  console.log('\x1b[1m\x1b[35mPre-LAW Rarity Breakdown\x1b[0m')

  test('JTL-CB: pack rarity breakdown matches spec', () => {
    // SPEC: 4C foil + 2UC foil + 1 R/L foil + 1 prestige + 3C HS + 1UC HS + 1 R/L HS + 2 HSF
    clearCarboniteBeltCache()
    const pack = generateCarboniteBoosterPack('JTL-CB')

    // Count foil commons (slots 1-4)
    const foilCommons = pack.cards.slice(1, 5).filter(c => c.isFoil && c.rarity === 'Common')
    assertEqual(foilCommons.length, 4, `Expected 4 foil commons, got ${foilCommons.length}`)

    // Count foil uncommons (slots 5-6)
    const foilUC = pack.cards.slice(5, 7).filter(c => c.isFoil && c.rarity === 'Uncommon')
    assertEqual(foilUC.length, 2, `Expected 2 foil uncommons, got ${foilUC.length}`)

    // R/L foil (slot 7)
    const rlFoil = pack.cards[7]
    assert(rlFoil.isFoil === true, 'Slot 7 should be foil')

    // Prestige (slot 8)
    assert(pack.cards[8].isPrestige === true, 'Slot 8 should be prestige')

    // HS commons (slots 9-11)
    const hsCommons = pack.cards.slice(9, 12).filter(c => c.isHyperspace && c.rarity === 'Common')
    assertEqual(hsCommons.length, 3, `Expected 3 HS commons, got ${hsCommons.length}`)

    // HS uncommon (slot 12)
    assertEqual(pack.cards[12].rarity, 'Uncommon', `Slot 12 should be Uncommon`)

    // HSF (slots 14-15)
    const hsf = pack.cards.slice(14, 16).filter(c => c.isFoil && c.isHyperspace)
    assertEqual(hsf.length, 2, `Expected 2 HSF cards, got ${hsf.length}`)
  })

  // ======================
  // Statistical tests
  // ======================
  console.log('')
  console.log('\x1b[1m\x1b[35mStatistical Tests\x1b[0m')

  test('showcase leader rate: ~5% for pre-LAW (over 500 packs)', () => {
    // SPEC: ~1/20 = 5%
    clearCarboniteBeltCache()
    let showcaseCount = 0
    const sampleSize = 500
    for (let i = 0; i < sampleSize; i++) {
      const pack = generateCarboniteBoosterPack('JTL-CB')
      if (pack.cards[0].isShowcase) {
        showcaseCount++
      }
    }

    const showcasePct = (showcaseCount / sampleSize) * 100
    // 5% target, allow 1-15% range
    assert(showcasePct > 1 && showcasePct < 15,
      `Showcase rate should be ~5%, got ${showcasePct.toFixed(1)}% (${showcaseCount}/${sampleSize})`)
  })

  test('prestige tier distribution over 500 packs', () => {
    // SPEC: tier1 80%, tier2 18%, serialized 2%
    clearCarboniteBeltCache()
    const counts = { tier1: 0, tier2: 0, serialized: 0 }
    const sampleSize = 500
    for (let i = 0; i < sampleSize; i++) {
      const pack = generateCarboniteBoosterPack('JTL-CB')
      const prestige = pack.cards[8] // Prestige is at slot 8 for pre-LAW
      if (prestige.prestigeTier) {
        counts[prestige.prestigeTier]++
      }
    }

    const total = counts.tier1 + counts.tier2 + counts.serialized
    const tier1Pct = (counts.tier1 / total) * 100

    assert(tier1Pct > 60, `Tier1 should be majority (~80%), got ${tier1Pct.toFixed(1)}%`)
    assert(counts.tier2 > 0, 'Should have at least 1 tier2 prestige')
  })

  test('R/L foil slot: Rare is most common over 200 packs', () => {
    // SPEC: 70% Rare, 20% Special, 10% Legendary
    clearCarboniteBeltCache()
    const counts: Record<string, number> = { Rare: 0, Special: 0, Legendary: 0 }
    for (let i = 0; i < 200; i++) {
      const pack = generateCarboniteBoosterPack('JTL-CB')
      const rlFoil = pack.cards[7]
      counts[rlFoil.rarity] = (counts[rlFoil.rarity] || 0) + 1
    }
    assert(counts.Rare > counts.Special,
      `Rare (${counts.Rare}) should exceed Special (${counts.Special})`)
    assert(counts.Rare > 100,
      `Rare should be majority (>50%), got ${counts.Rare}/200`)
  })

  test('R/L HS slot: Rare is most common over 200 packs', () => {
    // SPEC: 70% Rare, 20% Special, 10% Legendary
    clearCarboniteBeltCache()
    const counts: Record<string, number> = { Rare: 0, Special: 0, Legendary: 0 }
    for (let i = 0; i < 200; i++) {
      const pack = generateCarboniteBoosterPack('JTL-CB')
      const rlHS = pack.cards[13]
      counts[rlHS.rarity] = (counts[rlHS.rarity] || 0) + 1
    }
    assert(counts.Rare > counts.Special,
      `Rare (${counts.Rare}) should exceed Special (${counts.Special})`)
    assert(counts.Rare > 100,
      `Rare should be majority (>50%), got ${counts.Rare}/200`)
  })

  test('LAW-CB HS rarity distribution over 500 packs', () => {
    // SPEC: 4 fixed C + 3 flex (C:32,UC:63,R:3,S:1,L:1) + 1 top (R:60,S:20,L:20)
    // Expected overall per 8 cards: ~62% C, ~24% UC, ~9% R, ~3% S, ~3% L
    clearCarboniteBeltCache()
    const counts: Record<string, number> = {}
    const sampleSize = 500
    let totalCards = 0
    for (let i = 0; i < sampleSize; i++) {
      const pack = generateCarboniteBoosterPack('LAW-CB')
      for (let j = 2; j <= 9; j++) {
        const card = pack.cards[j]
        counts[card.rarity] = (counts[card.rarity] || 0) + 1
        totalCards++
      }
    }
    const cPct = ((counts.Common || 0) / totalCards) * 100
    const ucPct = ((counts.Uncommon || 0) / totalCards) * 100
    const rPct = ((counts.Rare || 0) / totalCards) * 100

    // Common should be majority (~62%), allow 50-75%
    assert(cPct > 50 && cPct < 75,
      `HS Common should be ~62%, got ${cPct.toFixed(1)}%`)
    // UC should be significant (~24%), allow 15-35%
    assert(ucPct > 15 && ucPct < 35,
      `HS Uncommon should be ~24%, got ${ucPct.toFixed(1)}%`)
    // Rare should be present (~9%), allow 3-18%
    assert(rPct > 3 && rPct < 18,
      `HS Rare should be ~9%, got ${rPct.toFixed(1)}%`)
  })

  test('LAW-CB HSF rarity distribution over 500 packs', () => {
    // SPEC: 4 flex (C:43,UC:44,R:10,S:1.5,L:1.5) + 2 fixed C
    // Expected overall per 6 cards: ~62% C, ~29% UC, ~7% R, ~1% S, ~1% L
    clearCarboniteBeltCache()
    const counts: Record<string, number> = {}
    const sampleSize = 500
    let totalCards = 0
    for (let i = 0; i < sampleSize; i++) {
      const pack = generateCarboniteBoosterPack('LAW-CB')
      for (let j = 10; j <= 15; j++) {
        const card = pack.cards[j]
        counts[card.rarity] = (counts[card.rarity] || 0) + 1
        totalCards++
      }
    }
    const cPct = ((counts.Common || 0) / totalCards) * 100
    const ucPct = ((counts.Uncommon || 0) / totalCards) * 100

    // Common should be majority (~62%), allow 50-75%
    assert(cPct > 50 && cPct < 75,
      `HSF Common should be ~62%, got ${cPct.toFixed(1)}%`)
    // UC should be significant (~29%), allow 18-40%
    assert(ucPct > 18 && ucPct < 40,
      `HSF Uncommon should be ~29%, got ${ucPct.toFixed(1)}%`)
  })

  test('LAW-CB: HS top slot (9) is always R/S/L over 200 packs', () => {
    clearCarboniteBeltCache()
    for (let i = 0; i < 200; i++) {
      const pack = generateCarboniteBoosterPack('LAW-CB')
      const card = pack.cards[9]
      assert(
        card.rarity === 'Rare' || card.rarity === 'Legendary' || card.rarity === 'Special',
        `Pack ${i}: slot 9 should always be R/S/L, got ${card.rarity}`
      )
    }
  })

  // ======================
  // Per-set ASH calibration (real 48-pack case: data/real-boxes/ash-carbonite-box-00{1..4})
  // ASH overrides LAW; LAW behavior must stay unchanged.
  // ======================
  console.log('')
  console.log('\x1b[1m\x1b[35mASH Per-Set Calibration (48-pack case)\x1b[0m')

  const prestigeTierOf = (v: string): string =>
    v === 'Standard Prestige' ? 'tier1' : v === 'Foil Prestige' ? 'tier2' : v === 'Serialized Prestige' ? 'serialized' : '?'

  function prestigeTierPcts(setCode: string, n: number): Record<string, number> {
    clearCarboniteBeltCache()
    const counts: Record<string, number> = { tier1: 0, tier2: 0, serialized: 0 }
    for (let i = 0; i < n; i++) {
      const prestige = generateCarboniteBoosterPack(setCode).cards.find(c => c.isPrestige)
      const t = prestigeTierOf(prestige?.variantType)
      if (counts[t] !== undefined) counts[t]++
    }
    const tot = counts.tier1 + counts.tier2 + counts.serialized
    return { tier1: counts.tier1 / tot * 100, tier2: counts.tier2 / tot * 100, serialized: counts.serialized / tot * 100 }
  }

  // HS top slot index differs by set: ASH's calibrated layout puts it at index 8 (pos 9);
  // LAW's flat layout at index 9.
  function hsTopRarityPcts(setCode: string, n: number): Record<string, number> {
    clearCarboniteBeltCache()
    const topIdx = setCode === 'ASH-CB' ? 8 : 9
    const counts: Record<string, number> = {}
    for (let i = 0; i < n; i++) {
      const card = generateCarboniteBoosterPack(setCode).cards[topIdx]
      counts[card.rarity] = (counts[card.rarity] || 0) + 1
    }
    const out: Record<string, number> = {}
    for (const k of Object.keys(counts)) out[k] = counts[k] / n * 100
    return out
  }

  test('FIXED: ASH prestige tiers ~67/31/2 (real 48-pack case), not 80/18/2', () => {
    // SPEC: data/real-boxes/ash-carbonite-box-00{1..4}.csv — Std 32 / Foil 15 / Ser 1
    const p = prestigeTierPcts('ASH-CB', 5000)
    assert(p.tier1 > 61 && p.tier1 < 73, `ASH tier1 should be ~67%, got ${p.tier1.toFixed(1)}%`)
    assert(p.tier2 > 25 && p.tier2 < 37, `ASH tier2 (Foil) should be ~31%, got ${p.tier2.toFixed(1)}%`)
    assert(p.serialized > 0.5 && p.serialized < 4, `ASH serialized should be ~2%, got ${p.serialized.toFixed(1)}%`)
  })

  test('FIXED: ASH HS top slot is R/L only — 0 Special (real 48/48)', () => {
    // SPEC: real case pos-9 top = R 38 / L 10 / S 0 -> hsTopWeights {Rare:79, Legendary:21}
    const r = hsTopRarityPcts('ASH-CB', 4000)
    assertEqual(r.Special || 0, 0, `ASH HS top must have 0 Special, got ${(r.Special || 0).toFixed(1)}%`)
    assert((r.Rare || 0) > 72 && (r.Rare || 0) < 86, `ASH HS top Rare should be ~79%, got ${(r.Rare || 0).toFixed(1)}%`)
    assert((r.Legendary || 0) > 13 && (r.Legendary || 0) < 29, `ASH HS top Legendary should be ~21%, got ${(r.Legendary || 0).toFixed(1)}%`)
  })

  test('LAW carbonite UNCHANGED: prestige tiers still ~80/18/2 (per-set isolation)', () => {
    // SPEC: ASH override must NOT touch LAW — LAW keeps CARBONITE_CONSTANTS (80/18/2)
    const p = prestigeTierPcts('LAW-CB', 5000)
    assert(p.tier1 > 74 && p.tier1 < 86, `LAW tier1 should stay ~80%, got ${p.tier1.toFixed(1)}%`)
  })

  test('LAW carbonite UNCHANGED: HS top still includes Special (per-set isolation)', () => {
    // SPEC: LAW hsTopWeights R60/S20/L20 — Special present; only ASH drops it
    const r = hsTopRarityPcts('LAW-CB', 4000)
    assert((r.Special || 0) > 10, `LAW HS top should still have ~20% Special, got ${(r.Special || 0).toFixed(1)}%`)
  })

  // ======================
  // Within-pack duplicate invariant (FIX-1)
  // ======================
  console.log('')
  console.log('\x1b[1m\x1b[35mWithin-Pack Duplicate Invariant\x1b[0m')

  // Treatment key: two cards are the SAME physical printing iff same underlying
  // card AND same treatment. Cross-treatment pairs (a card's HS + its HSF, or a
  // Normal-foil + its HS) are DIFFERENT keys and remain allowed — matching the
  // real-box rule (ASH_COLLATION_FINDINGS.md: real within-pack dups are all
  // cross-treatment, zero same-treatment). isFoil/isHyperspace distinguish the
  // HS vs HSF blocks, which the LAW+ generator synthesizes from the same
  // Hyperspace source (shared id/number).
  const treatmentKey = (c: any): string =>
    `${c.id ?? `${c.name}|${c.number}`}|${c.variantType}|${c.isFoil ? 1 : 0}|${c.isHyperspace ? 1 : 0}`
  const isDeckCard = (c: any): boolean => !c.isLeader && !c.isPrestige

  test('FIXED: no identical-treatment duplicate within a pack (all sets)', () => {
    // SPEC: belt-system.md "Only same-belt duplicates indicate a bug"; real packs
    // (ASH_COLLATION_FINDINGS.md) show ZERO same-treatment within-pack dups. A
    // premium carbonite pack must never contain the identical printing twice.
    // Structural guarantee (deterministic), so === 0 is correct here — not a rate.
    for (const setCode of ['JTL-CB', 'LOF-CB', 'SEC-CB', 'LAW-CB', 'ASH-CB']) {
      clearCarboniteBeltCache()
      let dupPacks = 0
      const sample = 2000
      for (let i = 0; i < sample; i++) {
        const pack = generateCarboniteBoosterPack(setCode)
        const keys = pack.cards.filter(isDeckCard).map(treatmentKey)
        if (new Set(keys).size !== keys.length) dupPacks++
      }
      assertEqual(dupPacks, 0,
        `${setCode}: ${dupPacks}/${sample} packs had an identical-treatment duplicate ` +
        `(SPEC: 0 — carbonite packs never contain the same printing twice)`)
    }
  })

  test('cross-treatment pairs are still allowed (dedup is not over-broad)', () => {
    // SPEC: cross-treatment dups (same card, different treatment) are realistic and
    // must NOT be removed. Over many LAW+ packs some HS + its HSF co-occur; assert
    // the dedup does not forbid that (i.e. same underlying id can appear twice as
    // long as the treatment differs). This is a guard against over-dedup.
    clearCarboniteBeltCache()
    let crossTreatmentSeen = false
    for (let i = 0; i < 3000 && !crossTreatmentSeen; i++) {
      const pack = generateCarboniteBoosterPack('LAW-CB')
      const byCard: Record<string, Set<string>> = {}
      for (const c of pack.cards.filter(isDeckCard) as any[]) {
        const cardId = String(c.id ?? `${c.name}|${c.number}`)
        const treat = `${c.isFoil ? 1 : 0}|${c.isHyperspace ? 1 : 0}`
        ;(byCard[cardId] = byCard[cardId] || new Set()).add(treat)
      }
      if (Object.values(byCard).some(s => s.size > 1)) crossTreatmentSeen = true
    }
    assert(crossTreatmentSeen,
      'Expected at least one LAW+ pack with the same card in two different treatments ' +
      '(HS + HSF) over 3000 packs — dedup must not forbid cross-treatment pairs')
  })

  console.log('')
  console.log('\x1b[35m' + '='.repeat(50) + '\x1b[0m')
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
