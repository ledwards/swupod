// @ts-nocheck
// Tests for LAW set configuration
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { LAW_CONFIG } from './LAW'
import { ASH_CONFIG } from './ASH'
import { SET_CONFIGS, getSetConfig } from './index'

describe('LAW_CONFIG', () => {
  describe('basic properties', () => {
    it('should have correct set code', () => {
      assert.strictEqual(LAW_CONFIG.setCode, 'LAW')
    })

    it('should have correct set name', () => {
      assert.strictEqual(LAW_CONFIG.setName, 'A Lawless Time')
    })

    it('should have correct set number', () => {
      assert.strictEqual(LAW_CONFIG.setNumber, 7)
    })

    it('should have prereleaseDate and releaseDate', () => {
      assert.strictEqual(LAW_CONFIG.prereleaseDate, '2026-03-06')
      assert.strictEqual(LAW_CONFIG.releaseDate, '2026-03-13')
    })

    it('should have a color defined', () => {
      assert.ok(LAW_CONFIG.color, 'Should have a color')
      assert.ok(LAW_CONFIG.color.startsWith('#'), 'Color should be hex')
    })
  })

  describe('card counts', () => {
    const { cardCounts } = LAW_CONFIG

    it('should have leader counts', () => {
      assert.ok(cardCounts.leaders, 'Should have leaders')
      assert.ok(typeof cardCounts.leaders.common === 'number', 'Should have common leaders count')
      assert.ok(typeof cardCounts.leaders.rare === 'number', 'Should have rare leaders count')
      assert.ok(typeof cardCounts.leaders.total === 'number', 'Should have total leaders count')
    })

    it('should have base counts', () => {
      assert.ok(cardCounts.bases, 'Should have bases')
      assert.ok(typeof cardCounts.bases.common === 'number', 'Should have common bases count')
      assert.ok(typeof cardCounts.bases.rare === 'number', 'Should have rare bases count')
      assert.ok(typeof cardCounts.bases.total === 'number', 'Should have total bases count')
    })

    it('should have rarity counts', () => {
      assert.ok(typeof cardCounts.commons === 'number', 'Should have commons count')
      assert.ok(typeof cardCounts.uncommons === 'number', 'Should have uncommons count')
      assert.ok(typeof cardCounts.rares === 'number', 'Should have rares count')
      assert.ok(typeof cardCounts.legendaries === 'number', 'Should have legendaries count')
      assert.ok(typeof cardCounts.specials === 'number', 'Should have specials count')
    })

    it('leader total should be >= common + rare', () => {
      const { common, rare, total } = cardCounts.leaders
      assert.ok(total >= common + rare, 'Total should account for all leader types')
    })

    it('base total should be >= common + rare', () => {
      const { common, rare, total } = cardCounts.bases
      assert.ok(total >= common + rare, 'Total should account for all base types')
    })
  })

  describe('pack rules', () => {
    const { packRules } = LAW_CONFIG

    it('should have rareBasesInRareSlot defined', () => {
      assert.ok(typeof packRules.rareBasesInRareSlot === 'boolean')
    })

    it('should have foilSlotIsHyperspaceFoil set to true', () => {
      assert.strictEqual(packRules.foilSlotIsHyperspaceFoil, true)
    })

    it('should have guaranteedHyperspaceCommon set to true', () => {
      assert.strictEqual(packRules.guaranteedHyperspaceCommon, true)
    })

    it('should have hyperspaceCommonSlot set to 5 (dedicated HS common belt)', () => {
      assert.strictEqual(packRules.hyperspaceCommonSlot, 5)
    })

    it('should have prestigeInStandardPacks set to true', () => {
      assert.strictEqual(packRules.prestigeInStandardPacks, true)
    })

    it('should have specialInFoilSlot defined', () => {
      assert.ok(typeof packRules.specialInFoilSlot === 'boolean')
    })
  })

  describe('LAW-specific features', () => {
    it('should not carry a tripleAspect config (dead key removed; aspects[0] priority is the belt rule)', () => {
      assert.strictEqual('tripleAspect' in LAW_CONFIG, false)
    })
  })

  describe('rarity weights', () => {
    const { rarityWeights } = LAW_CONFIG

    it('should have hyperspaceFoilSlot weights (replaces foilSlot)', () => {
      assert.ok(rarityWeights.hyperspaceFoilSlot, 'Should have hyperspaceFoilSlot weights')
    })

    it('should have ucSlot3Upgraded weights', () => {
      assert.ok(rarityWeights.ucSlot3Upgraded, 'Should have ucSlot3Upgraded weights')
    })

    it('should have hyperspaceNonFoil weights', () => {
      assert.ok(rarityWeights.hyperspaceNonFoil, 'Should have hyperspaceNonFoil weights')
    })
  })

  describe('upgrade probabilities', () => {
    const { upgradeProbabilities } = LAW_CONFIG

    it('should have leader upgrade rates', () => {
      assert.ok(typeof upgradeProbabilities.leaderToHyperspace === 'number')
      assert.ok(typeof upgradeProbabilities.leaderToShowcase === 'number')
    })

    it('should have base upgrade rate', () => {
      assert.ok(typeof upgradeProbabilities.baseToHyperspace === 'number')
    })

    it('should have foil upgrade rate of 0 (foil IS hyperspace foil)', () => {
      assert.strictEqual(upgradeProbabilities.foilToHyperfoil, 0)
    })

    it('should have uncommon upgrade rates', () => {
      assert.ok(typeof upgradeProbabilities.thirdUCToHyperspaceRL === 'number')
      assert.ok(upgradeProbabilities.thirdUCToHyperspaceRL > 0, 'UC3 can still upgrade to HS R/L (fallback)')
      assert.ok(typeof upgradeProbabilities.firstUCToHyperspaceUC === 'number')
    })

    it('should have commonToHyperspace set to 0 (HS common is dedicated belt)', () => {
      assert.strictEqual(upgradeProbabilities.commonToHyperspace, 0)
    })

    it('should have rareToPrestige set to 0 (prestige moved to UC3)', () => {
      assert.strictEqual(upgradeProbabilities.rareToPrestige, 0)
    })

    it('should have uc3ToPrestige at ~1/18 rate', () => {
      assert.ok(typeof upgradeProbabilities.uc3ToPrestige === 'number')
      assert.ok(upgradeProbabilities.uc3ToPrestige > 0, 'UC3 prestige rate should be positive')
      // SPEC: ~1/18 rate
      const tolerance = 0.01
      assert.ok(Math.abs(upgradeProbabilities.uc3ToPrestige - 1/18) < tolerance,
        `UC3 prestige rate should be ~1/18 (${1/18}), got ${upgradeProbabilities.uc3ToPrestige}`)
    })
  })
})

describe('ASH_CONFIG', () => {
  it('should set UC3 prestige to ~1.1 tier-1 prestige cards per box (11 verified boxes)', () => {
    // SPEC: ALL 11 variant-verified boxes (261 packs, 2026-07-12): 12 prestige
    // = 4.6% ≈ 1/22 → 24/22 ≈ 1.09/box (mode 1, max 2). The 1/18 fit predated
    // the Teddy-box variant verification (it used only the 166 Lee-case packs).
    const rate = ASH_CONFIG.upgradeProbabilities.uc3ToPrestige
    assert.strictEqual(rate, 1 / 22)
    assert.ok(Math.abs(rate * 24 - 1.09) < 0.01)
  })

  it('should use ASH-calibrated foil slot weights (11 verified real boxes)', () => {
    // SPEC: 261 real foils observed C82.4/U11.1/R3.1/S1.5/L1.9 (every box
    // ≥77% common) → C83/U10/R3/S2/L2, realized by the 15×121 sheet stack.
    assert.deepStrictEqual(ASH_CONFIG.rarityWeights.hyperspaceFoilSlot, {
      Common: 83,
      Uncommon: 10,
      Rare: 3,
      Special: 2,
      Legendary: 2,
    })
  })

  it('should keep LAW foil slot weights unchanged (LAW-era 96-pack data)', () => {
    assert.deepStrictEqual(LAW_CONFIG.rarityWeights.hyperspaceFoilSlot, {
      Common: 65,
      Uncommon: 20,
      Rare: 8,
      Special: 4,
      Legendary: 3,
    })
  })

  it('should never upgrade UC1/UC2 to hyperspace for Set 7+ (real ASH box: 0/48)', () => {
    // SPEC: UC3 is the only uncommon upgrade slot for LAW and ASH.
    assert.strictEqual(LAW_CONFIG.upgradeProbabilities.firstUCToHyperspaceUC, 0)
    assert.strictEqual(LAW_CONFIG.upgradeProbabilities.secondUCToHyperspaceUC, 0)
    assert.strictEqual(ASH_CONFIG.upgradeProbabilities.firstUCToHyperspaceUC, 0)
    assert.strictEqual(ASH_CONFIG.upgradeProbabilities.secondUCToHyperspaceUC, 0)
  })
})

describe('SET_CONFIGS registry', () => {
  it('should include LAW config', () => {
    assert.ok(SET_CONFIGS['LAW'], 'LAW should be registered')
    assert.strictEqual(SET_CONFIGS['LAW'], LAW_CONFIG)
  })

  it('should return LAW config via getSetConfig', () => {
    const config = getSetConfig('LAW')
    assert.ok(config, 'Should return LAW config')
    assert.strictEqual(config.setCode, 'LAW')
  })

  it('should have 8 sets registered', () => {
    const setCodes = Object.keys(SET_CONFIGS)
    assert.strictEqual(setCodes.length, 8)
    assert.deepStrictEqual(
      setCodes.sort(),
      ['ASH', 'JTL', 'LAW', 'LOF', 'SEC', 'SHD', 'SOR', 'TWI'].sort()
    )
  })
})

// Run tests
console.log('\n🃏 Running LAW config tests...\n')
