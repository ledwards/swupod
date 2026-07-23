/**
 * Belt ↔ SetConfig wiring tests
 *
 * SPEC: belts must take ALL set-dependent parameters from the set config —
 * never from hardcoded `setNumber` branches. (User directive 2026-07-11:
 * "NONE of the generators should hardcode set logic; they should always look
 * to set configs to get constants, numbers, behaviors.")
 *
 * Two layers:
 *  1. Characterization: for every set, belt params equal today's values
 *     (byte-identical refactor guard).
 *  2. Wiring: patch a config value → a freshly constructed belt must follow it
 *     (proves the belt reads config, not a parallel hardcode).
 *
 * Run with: npx tsx src/belts/beltConfig.test.ts
 */

import { RareLegendaryBelt } from './RareLegendaryBelt'
import { HyperspaceRareLegendaryBelt } from './HyperspaceRareLegendaryBelt'
import { LeaderBelt } from './LeaderBelt'
import { HyperspaceUpgradeBelt } from './HyperspaceUpgradeBelt'
import { initializeCardCache } from '../utils/cardCache'
import { getSetConfig, getAllSetCodes } from '../utils/setConfigs/index'

let passed = 0
let failed = 0
function test(name: string, fn: () => void): void {
  try { fn(); console.log(`\x1b[32m✅ ${name}\x1b[0m`); passed++ }
  catch (e) { console.log(`\x1b[31m❌ ${name}\x1b[0m\n\x1b[33m   ${(e as Error).message}\x1b[0m`); failed++ }
}
function eq(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) throw new Error(`${msg}: expected ${expected}, got ${actual}`)
}

// Correct per-set belt params. Rare:legendary (rl) follows FFG's published rate:
// sets 1-3 = 7:1 (1 in 8); JTL onward (sets 4+) = 4:1 (1 in 5, "starting with Jump to
// Lightspeed and going forward"). hsrl (the hyperspace R/L slot) is tuned separately.
const EXPECTED: Record<string, { rl: number; rlWindow: number; hsrl: number; leaderCap: number }> = {
  SOR: { rl: 7, rlWindow: 6, hsrl: 6, leaderCap: 24 },
  SHD: { rl: 7, rlWindow: 6, hsrl: 6, leaderCap: 24 },
  TWI: { rl: 7, rlWindow: 6, hsrl: 6, leaderCap: 24 },
  JTL: { rl: 4, rlWindow: 6, hsrl: 5, leaderCap: 24 },
  LOF: { rl: 4, rlWindow: 6, hsrl: 5, leaderCap: 24 },
  SEC: { rl: 4, rlWindow: 6, hsrl: 5, leaderCap: 24 },
  LAW: { rl: 4, rlWindow: 3, hsrl: 5, leaderCap: 3 },
  ASH: { rl: 4, rlWindow: 3, hsrl: 5, leaderCap: 3 },
}

async function main() {
  await initializeCardCache()

  for (const set of getAllSetCodes()) {
    const cfg = getSetConfig(set)!
    const exp = EXPECTED[set]
    if (!exp) continue

    test(`${set}: config carries belt params (ratio/windows/flags)`, () => {
      eq(cfg.beltRatios.rareToLegendary, exp.rl, `${set} beltRatios.rareToLegendary`)
      eq(cfg.beltRatios.hyperspaceRareToLegendary, exp.hsrl, `${set} beltRatios.hyperspaceRareToLegendary`)
      eq(cfg.dedupWindows?.rareLegendary, exp.rlWindow, `${set} dedupWindows.rareLegendary`)
      eq(cfg.dedupWindows?.leaderCap, exp.leaderCap, `${set} dedupWindows.leaderCap`)
      eq(typeof cfg.packRules.specialInHyperspaceSlots, 'boolean', `${set} packRules.specialInHyperspaceSlots type`)
      eq(typeof cfg.packRules.specialShowcaseLeaders, 'boolean', `${set} packRules.specialShowcaseLeaders type`)
      eq(typeof cfg.packRules.baseLineAspectConflict, 'boolean', `${set} packRules.baseLineAspectConflict type`)
      eq(typeof cfg.packRules.lineStackingCollation, 'boolean', `${set} packRules.lineStackingCollation type`)
    })

    test(`${set}: RareLegendaryBelt reads config`, () => {
      const b = new RareLegendaryBelt(set)
      eq(b.ratio, cfg.beltRatios.rareToLegendary, `${set} RL ratio`)
      eq(b.dedupWindow, cfg.dedupWindows.rareLegendary, `${set} RL dedupWindow`)
    })

    test(`${set}: HyperspaceRareLegendaryBelt reads config`, () => {
      const b = new HyperspaceRareLegendaryBelt(set)
      eq(b.ratio, cfg.beltRatios.hyperspaceRareToLegendary, `${set} HSRL ratio`)
    })

    test(`${set}: LeaderBelt reads config`, () => {
      const b = new LeaderBelt(set)
      eq(b.dedupWindowCap, cfg.dedupWindows.leaderCap, `${set} leader dedup cap`)
    })
  }

  // Era pins for the per-config booleans
  test('specialInHyperspaceSlots: false sets 1-3, true sets 4+', () => {
    eq(getSetConfig('SOR')!.packRules.specialInHyperspaceSlots, false, 'SOR')
    eq(getSetConfig('JTL')!.packRules.specialInHyperspaceSlots, true, 'JTL')
    eq(getSetConfig('ASH')!.packRules.specialInHyperspaceSlots, true, 'ASH')
  })
  test('specialShowcaseLeaders: false SOR only', () => {
    eq(getSetConfig('SOR')!.packRules.specialShowcaseLeaders, false, 'SOR')
    eq(getSetConfig('SHD')!.packRules.specialShowcaseLeaders, true, 'SHD')
  })
  test('lineStacking + base line rule: Set 7+ only', () => {
    eq(getSetConfig('SEC')!.packRules.lineStackingCollation, false, 'SEC lineStacking')
    eq(getSetConfig('LAW')!.packRules.lineStackingCollation, true, 'LAW lineStacking')
    eq(getSetConfig('ASH')!.packRules.baseLineAspectConflict, true, 'ASH base line rule')
    eq(getSetConfig('TWI')!.packRules.baseLineAspectConflict, false, 'TWI base line rule')
  })
  test('foil belt target weights come from config', () => {
    eq(getSetConfig('SOR')!.rarityWeights.foilBeltTarget.Common, 78, 'SOR foil target C')
    eq(getSetConfig('JTL')!.rarityWeights.foilBeltTarget.Common, 75, 'JTL foil target C')
    // sets 1-6 must now carry hyperspaceFoilSlot for HyperfoilBelt
    eq(getSetConfig('SOR')!.rarityWeights.hyperspaceFoilSlot.Common, 78, 'SOR hyperfoil C')
    eq(getSetConfig('JTL')!.rarityWeights.hyperspaceFoilSlot.Common, 75, 'JTL hyperfoil C')
  })
  test('HS upgrade leader+base co-occurrence flag lives in HS_BELT_CONFIGS', () => {
    eq(new HyperspaceUpgradeBelt('LAW').allowLeaderBaseCoOccurrence, true, 'LAW group')
    eq(new HyperspaceUpgradeBelt('4-6').allowLeaderBaseCoOccurrence, false, '4-6 group')
    eq(new HyperspaceUpgradeBelt('1-3').allowLeaderBaseCoOccurrence, false, '1-3 group')
  })

  // WIRING: belts must FOLLOW a patched config (proves no parallel hardcode)
  test('wiring: RareLegendaryBelt follows patched config ratio', () => {
    const cfg = getSetConfig('ASH')!
    const orig = cfg.beltRatios.rareToLegendary
    const origW = cfg.dedupWindows.rareLegendary
    try {
      cfg.beltRatios.rareToLegendary = 4
      cfg.dedupWindows.rareLegendary = 2
      const b = new RareLegendaryBelt('ASH')
      eq(b.ratio, 4, 'patched ratio')
      eq(b.dedupWindow, 2, 'patched window')
    } finally {
      cfg.beltRatios.rareToLegendary = orig
      cfg.dedupWindows.rareLegendary = origW
    }
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main()
