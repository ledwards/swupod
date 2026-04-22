// @ts-nocheck
// Tests for LAW set configuration
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { LAW_CONFIG } from './LAW'
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
    it('should have tripleAspect configuration', () => {
      assert.ok(LAW_CONFIG.tripleAspect, 'Should have tripleAspect config')
      assert.strictEqual(LAW_CONFIG.tripleAspect.enabled, true)
      assert.ok(LAW_CONFIG.tripleAspect.beltAssignment, 'Should have belt assignment strategy')
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
