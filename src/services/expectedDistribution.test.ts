// @ts-nocheck
/**
 * Tests for src/services/expectedDistribution.ts
 *
 * SPEC-FIRST: All expected values are hardcoded from
 *   - PACK_STRUCTURE in src/utils/packConstants.ts
 *   - SET_CONFIGS.* in src/utils/setConfigs/
 * and computed by HAND in this file's comments. No value is read back
 * from the function under test or derived from `cards.json` aspect counts
 * at runtime. (The aspect-mix test uses a hand-counted slice — see the
 * "LAW Legendary aspect mix" describe block.)
 *
 * Run with: npx tsx --test src/services/expectedDistribution.test.ts
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import {
  getExpectedPerPack,
  scaleExpected,
  resetExpectedDistributionCache,
  classifyAspect,
  COLOR_ASPECTS,
  ASPECT_CATEGORIES,
  RARITIES,
} from './expectedDistribution'
import { LAW_CONFIG } from '../utils/setConfigs/LAW'
import { SOR_CONFIG } from '../utils/setConfigs/SOR'
import { getCardsBySet } from '../utils/cardData'

const FLOAT_TOL = 1e-9

// ============================================================================
// SPEC CONSTANTS — hand-derived from packConstants.ts and setConfigs/*.ts
// ============================================================================

// PACK_STRUCTURE per pack:
//   commons: 9, uncommons: 3, rareOrLegendary: 1 (all in src/utils/packConstants.ts)
const PACK_COMMONS = 9
const PACK_UNCOMMONS = 3
const PACK_RARE_OR_LEGENDARY = 1

// LAW (Set 7+):
//   guaranteedHyperspaceCommon = true → one common slot is HS-belt-managed
//   → base commons per pack = 9 - 1 = 8
//   beltRatios.rareToLegendary = 4 (constants.rareSlotLegendaryRatio = 4;
//   FFG advertised 1-in-5 legendary, JTL onward — refit 2026-07-11)
//   → Rare = 1 × 4/5, Legendary = 1 × 1/5
//   cardCounts.commons = 100, uncommons = 60, rares = 47, legendaries = 20
const LAW_BASE_COMMONS_PER_PACK = PACK_COMMONS - 1 // 8
const LAW_BASE_UNCOMMONS_PER_PACK = PACK_UNCOMMONS // 3
const LAW_RL_RATIO = 4
const LAW_RARES_PER_PACK = PACK_RARE_OR_LEGENDARY * (LAW_RL_RATIO / (LAW_RL_RATIO + 1)) // 4/5
const LAW_LEGENDARIES_PER_PACK = PACK_RARE_OR_LEGENDARY * (1 / (LAW_RL_RATIO + 1)) // 1/5
const LAW_BASE_TOTAL_PER_PACK =
  LAW_BASE_COMMONS_PER_PACK +
  LAW_BASE_UNCOMMONS_PER_PACK +
  LAW_RARES_PER_PACK +
  LAW_LEGENDARIES_PER_PACK // 12
const LAW_POOL_COMMONS = 100
const LAW_POOL_UNCOMMONS = 60
const LAW_POOL_RARES = 47
const LAW_POOL_LEGENDARIES = 20

// SOR (Set 1):
//   No guaranteedHyperspaceCommon → base commons per pack = 9
//   beltRatios.rareToLegendary = 7 → Rare = 7/8, Legendary = 1/8
//   cardCounts.commons = 90, uncommons = 60, rares = 48, legendaries = 16
const SOR_BASE_COMMONS_PER_PACK = PACK_COMMONS // 9
const SOR_BASE_UNCOMMONS_PER_PACK = PACK_UNCOMMONS // 3
const SOR_RL_RATIO = 7
const SOR_RARES_PER_PACK = PACK_RARE_OR_LEGENDARY * (SOR_RL_RATIO / (SOR_RL_RATIO + 1)) // 7/8
const SOR_LEGENDARIES_PER_PACK = PACK_RARE_OR_LEGENDARY * (1 / (SOR_RL_RATIO + 1)) // 1/8
const SOR_BASE_TOTAL_PER_PACK =
  SOR_BASE_COMMONS_PER_PACK +
  SOR_BASE_UNCOMMONS_PER_PACK +
  SOR_RARES_PER_PACK +
  SOR_LEGENDARIES_PER_PACK // 13

describe('expectedDistribution', () => {
  before(() => {
    resetExpectedDistributionCache()
  })

  describe('config sanity (guard against config drift)', () => {
    it('LAW config has the rareSlotLegendaryRatio this test assumes', () => {
      assert.strictEqual(
        LAW_CONFIG.beltRatios.rareToLegendary,
        LAW_RL_RATIO,
        'If this fails, update LAW_RL_RATIO in this test file from LAW.ts.'
      )
    })

    it('SOR config has the rareSlotLegendaryRatio this test assumes', () => {
      assert.strictEqual(
        SOR_CONFIG.beltRatios.rareToLegendary,
        SOR_RL_RATIO,
        'If this fails, update SOR_RL_RATIO in this test file from SOR.ts.'
      )
    })

    it('LAW config has guaranteedHyperspaceCommon', () => {
      assert.strictEqual(LAW_CONFIG.packRules.guaranteedHyperspaceCommon, true)
    })

    it('SOR config does NOT have guaranteedHyperspaceCommon', () => {
      assert.notStrictEqual(SOR_CONFIG.packRules.guaranteedHyperspaceCommon, true)
    })

    it('LAW cardCounts match this test\'s pool-size assumptions', () => {
      assert.strictEqual(LAW_CONFIG.cardCounts.commons, LAW_POOL_COMMONS)
      assert.strictEqual(LAW_CONFIG.cardCounts.uncommons, LAW_POOL_UNCOMMONS)
      assert.strictEqual(LAW_CONFIG.cardCounts.rares, LAW_POOL_RARES)
      assert.strictEqual(LAW_CONFIG.cardCounts.legendaries, LAW_POOL_LEGENDARIES)
    })
  })

  describe('LAW per-pack rarity', () => {
    it('matches the spec for Common (8 base common slots / pack)', () => {
      const expected = getExpectedPerPack('LAW')
      assert.ok(expected)
      assert.strictEqual(expected.rarity.Common, LAW_BASE_COMMONS_PER_PACK)
    })

    it('matches the spec for Uncommon (3 base uncommon slots / pack)', () => {
      const expected = getExpectedPerPack('LAW')
      assert.strictEqual(expected.rarity.Uncommon, LAW_BASE_UNCOMMONS_PER_PACK)
    })

    it('matches the spec for Rare (1 R/L slot × 4/5 = 4/5 / pack)', () => {
      const expected = getExpectedPerPack('LAW')
      assert.ok(Math.abs(expected.rarity.Rare - LAW_RARES_PER_PACK) < FLOAT_TOL)
    })

    it('matches the spec for Legendary (1 R/L slot × 1/5 = 1/5 / pack)', () => {
      const expected = getExpectedPerPack('LAW')
      assert.ok(
        Math.abs(expected.rarity.Legendary - LAW_LEGENDARIES_PER_PACK) < FLOAT_TOL
      )
    })

    it('rarity values sum to base-card-per-pack total (12 for LAW)', () => {
      const expected = getExpectedPerPack('LAW')
      const sum =
        expected.rarity.Common +
        expected.rarity.Uncommon +
        expected.rarity.Rare +
        expected.rarity.Legendary
      assert.ok(Math.abs(sum - LAW_BASE_TOTAL_PER_PACK) < FLOAT_TOL)
      assert.ok(Math.abs(expected.baseCardsPerPack - LAW_BASE_TOTAL_PER_PACK) < FLOAT_TOL)
    })
  })

  describe('SOR per-pack rarity (older set, no dedicated HS common)', () => {
    it('matches the spec for Common (9 base common slots / pack)', () => {
      const expected = getExpectedPerPack('SOR')
      assert.strictEqual(expected.rarity.Common, SOR_BASE_COMMONS_PER_PACK)
    })

    it('matches the spec for Uncommon (3 base uncommon slots / pack)', () => {
      const expected = getExpectedPerPack('SOR')
      assert.strictEqual(expected.rarity.Uncommon, SOR_BASE_UNCOMMONS_PER_PACK)
    })

    it('matches the spec for Rare (1 R/L slot × 7/8)', () => {
      const expected = getExpectedPerPack('SOR')
      assert.ok(Math.abs(expected.rarity.Rare - SOR_RARES_PER_PACK) < FLOAT_TOL)
    })

    it('matches the spec for Legendary (1 R/L slot × 1/8)', () => {
      const expected = getExpectedPerPack('SOR')
      assert.ok(
        Math.abs(expected.rarity.Legendary - SOR_LEGENDARIES_PER_PACK) < FLOAT_TOL
      )
    })

    it('rarity values sum to base-card-per-pack total (13 for SOR)', () => {
      const expected = getExpectedPerPack('SOR')
      const sum =
        expected.rarity.Common +
        expected.rarity.Uncommon +
        expected.rarity.Rare +
        expected.rarity.Legendary
      assert.ok(Math.abs(sum - SOR_BASE_TOTAL_PER_PACK) < FLOAT_TOL)
    })
  })

  describe('LAW per-pack aspect', () => {
    it('aspect totals sum to base-cards-per-pack within float tolerance', () => {
      const expected = getExpectedPerPack('LAW')
      const sum = ASPECT_CATEGORIES.reduce(
        (acc, cat) => acc + expected.aspect[cat],
        0
      )
      // The 6 aspect categories partition all cards, so the per-aspect
      // expecteds must sum to the base-cards-per-pack total.
      assert.ok(
        Math.abs(sum - LAW_BASE_TOTAL_PER_PACK) < 1e-9,
        `aspect sum ${sum} should equal base total ${LAW_BASE_TOTAL_PER_PACK}`
      )
    })

    it('all 6 aspect categories are present in the result', () => {
      const expected = getExpectedPerPack('LAW')
      for (const cat of ASPECT_CATEGORIES) {
        assert.ok(
          cat in expected.aspect,
          `Missing aspect category: ${cat}`
        )
        assert.ok(
          typeof expected.aspect[cat] === 'number',
          `Aspect ${cat} should be a number`
        )
        assert.ok(
          expected.aspect[cat] >= 0,
          `Aspect ${cat} should be non-negative`
        )
      }
    })
  })

  describe('LAW Legendary aspect mix (hand-counted from cards.json)', () => {
    // Hand-counted from `jq '.cards | map(select(.set == "LAW" and
    // .variantType == "Normal" and .rarity == "Legendary"))'` on the
    // checked-in cards.json. The 20 LAW Legendaries classify as:
    //   Vigilance only: 1   (Lawbringer)
    //   Command only:   2   (Intimidator, Rey)
    //   Aggression only: 2  (Persecutor, Ben Solo)
    //   Cunning only:   2   (Liberty, Anakin's Podracer)
    //   Neutral:        0
    //   Multicolor:     13  (all the rest — Cad Bane, L3-37,
    //                        Tear This Ship Apart, Maz Kanata,
    //                        The Stranger, Maul, Max Rebo, Luke,
    //                        Hondo, Chewbacca, Obi-Wan,
    //                        Single Reactor Ignition, The Mandalorian)
    // Sum: 1+2+2+2+0+13 = 20 ✓
    //
    // Per-pack legendary expected = LAW_LEGENDARIES_PER_PACK = 1/6.
    // So per-pack legendary contribution to each aspect =
    //   1/6 × (count in category) / 20.
    const LAW_LEGENDARY_VIGILANCE_FROM_LEG = LAW_LEGENDARIES_PER_PACK * (1 / 20)
    const LAW_LEGENDARY_COMMAND_FROM_LEG = LAW_LEGENDARIES_PER_PACK * (2 / 20)
    const LAW_LEGENDARY_AGGRESSION_FROM_LEG = LAW_LEGENDARIES_PER_PACK * (2 / 20)
    const LAW_LEGENDARY_CUNNING_FROM_LEG = LAW_LEGENDARIES_PER_PACK * (2 / 20)
    const LAW_LEGENDARY_NEUTRAL_FROM_LEG = LAW_LEGENDARIES_PER_PACK * (0 / 20)
    const LAW_LEGENDARY_MULTICOLOR_FROM_LEG = LAW_LEGENDARIES_PER_PACK * (13 / 20)

    it('Legendary aspect mix from cards.json matches hand count (20 cards)', () => {
      // Sanity: assert the underlying cards.json slice still has 20
      // Legendaries with the expected per-category counts. If this
      // breaks the cards.json data changed and the hand counts need to
      // be redone.
      const legendaries = getCardsBySet('LAW').filter(
        (c) =>
          c.variantType === 'Normal' &&
          c.type !== 'Leader' &&
          c.type !== 'Base' &&
          c.rarity === 'Legendary'
      )
      assert.strictEqual(legendaries.length, 20)

      const byCategory: Record<string, number> = {
        Vigilance: 0,
        Command: 0,
        Aggression: 0,
        Cunning: 0,
        Neutral: 0,
        Multicolor: 0,
      }
      for (const card of legendaries) {
        byCategory[classifyAspect(card)] += 1
      }
      assert.strictEqual(byCategory.Vigilance, 1, 'LAW Vigilance-only Legendary count')
      assert.strictEqual(byCategory.Command, 2, 'LAW Command-only Legendary count')
      assert.strictEqual(byCategory.Aggression, 2, 'LAW Aggression-only Legendary count')
      assert.strictEqual(byCategory.Cunning, 2, 'LAW Cunning-only Legendary count')
      assert.strictEqual(byCategory.Neutral, 0, 'LAW Neutral Legendary count')
      assert.strictEqual(byCategory.Multicolor, 13, 'LAW Multicolor Legendary count')
    })

    // These verify the Legendary contribution to per-aspect-per-pack is
    // computed correctly. Other rarities also contribute; this just
    // confirms the lower bound that aspect[Multicolor] is at least the
    // Legendary contribution (a directional sanity check, not the full
    // value — full value depends on all 4 rarity buckets).
    it('Multicolor aspect expected is at least the Legendary contribution', () => {
      const expected = getExpectedPerPack('LAW')
      assert.ok(
        expected.aspect.Multicolor >= LAW_LEGENDARY_MULTICOLOR_FROM_LEG - FLOAT_TOL,
        `Multicolor expected (${expected.aspect.Multicolor}) should be at least legendary contribution (${LAW_LEGENDARY_MULTICOLOR_FROM_LEG})`
      )
    })

    it('Neutral aspect expected is finite and non-negative', () => {
      // Sanity: Neutral does occur in LAW commons (16 of 100 commons are
      // 0-color per the cards.json count); confirm the value is sane.
      const expected = getExpectedPerPack('LAW')
      assert.ok(Number.isFinite(expected.aspect.Neutral))
      assert.ok(expected.aspect.Neutral >= 0)
    })
  })

  describe('classifyAspect helper (hand-built fixtures)', () => {
    it('classifies a 0-color card as Neutral', () => {
      assert.strictEqual(classifyAspect({ aspects: [] }), 'Neutral')
      // Heroism/Villainy alone don't count as colors.
      assert.strictEqual(classifyAspect({ aspects: ['Heroism'] }), 'Neutral')
      assert.strictEqual(classifyAspect({ aspects: ['Villainy'] }), 'Neutral')
      assert.strictEqual(
        classifyAspect({ aspects: ['Heroism', 'Villainy'] }),
        'Neutral'
      )
    })

    it('classifies a 1-color card by that color', () => {
      for (const color of COLOR_ASPECTS) {
        assert.strictEqual(classifyAspect({ aspects: [color] }), color)
        // Color + alignment is still single-color.
        assert.strictEqual(
          classifyAspect({ aspects: [color, 'Heroism'] }),
          color
        )
        assert.strictEqual(
          classifyAspect({ aspects: [color, 'Villainy'] }),
          color
        )
      }
    })

    it('classifies a 2-color card as Multicolor', () => {
      assert.strictEqual(
        classifyAspect({ aspects: ['Vigilance', 'Command'] }),
        'Multicolor'
      )
      assert.strictEqual(
        classifyAspect({ aspects: ['Aggression', 'Cunning', 'Villainy'] }),
        'Multicolor'
      )
    })

    it('handles missing aspects array', () => {
      assert.strictEqual(classifyAspect({}), 'Neutral')
      assert.strictEqual(classifyAspect({ aspects: null }), 'Neutral')
    })
  })

  describe('LAW per-card expected (the bug-catcher)', () => {
    it('per-card expected for a specific Legendary equals (1/5) × (1/20)', () => {
      // SPEC: per-pack legendary expected = 1 R/L slot × 1/5 split =
      // 1/5 (FFG advertised 1-in-5, JTL onward). Each of 20 LAW legendaries
      // has equal share → 1/5 × 1/20 = 1/100 = 0.01.
      const expected = getExpectedPerPack('LAW')
      const SPEC_PER_LEGENDARY = LAW_LEGENDARIES_PER_PACK / LAW_POOL_LEGENDARIES
      assert.ok(
        Math.abs(SPEC_PER_LEGENDARY - 1 / 100) < FLOAT_TOL,
        `SPEC sanity: 1/5 × 1/20 should equal 1/100, got ${SPEC_PER_LEGENDARY}`
      )
      // Pick one known LAW Legendary cardId from cards.json — Cad Bane
      // (LAW-032). If this card is renumbered upstream, this id should
      // be updated.
      const cadBane = getCardsBySet('LAW').find(
        (c) =>
          c.cardId === 'LAW-032' &&
          c.variantType === 'Normal' &&
          c.rarity === 'Legendary'
      )
      assert.ok(cadBane, 'LAW-032 (Cad Bane Legendary Normal) should exist in cards.json')
      const observed = expected.cards.get(cadBane.cardId)
      assert.ok(observed !== undefined, `expected.cards missing ${cadBane.cardId}`)
      assert.ok(
        Math.abs(observed - SPEC_PER_LEGENDARY) < FLOAT_TOL,
        `LAW-032 expected rate ${observed} should equal ${SPEC_PER_LEGENDARY}`
      )
    })

    it('per-card expected for a Rare in LAW equals (4/5) × (1/47)', () => {
      // SPEC: per-pack rare expected = 1 R/L slot × 4/5 split = 4/5.
      // 47 LAW rares → 4/5 × 1/47.
      const expected = getExpectedPerPack('LAW')
      const SPEC_PER_RARE = LAW_RARES_PER_PACK / LAW_POOL_RARES
      // Pick a known LAW Rare from cards.json.
      const someRare = getCardsBySet('LAW').find(
        (c) =>
          c.variantType === 'Normal' &&
          c.rarity === 'Rare' &&
          c.type !== 'Leader' &&
          c.type !== 'Base'
      )
      assert.ok(someRare, 'Should find at least one LAW Normal Rare card')
      const observed = expected.cards.get(someRare.cardId)
      assert.ok(observed !== undefined, `expected.cards missing ${someRare.cardId}`)
      assert.ok(
        Math.abs(observed - SPEC_PER_RARE) < FLOAT_TOL,
        `${someRare.cardId} expected rate ${observed} should equal ${SPEC_PER_RARE}`
      )
    })

    it('per-card expected for a Common in LAW equals 8 × (1/100)', () => {
      const expected = getExpectedPerPack('LAW')
      const SPEC_PER_COMMON = LAW_BASE_COMMONS_PER_PACK / LAW_POOL_COMMONS // 0.08
      const someCommon = getCardsBySet('LAW').find(
        (c) =>
          c.variantType === 'Normal' &&
          c.rarity === 'Common' &&
          c.type !== 'Leader' &&
          c.type !== 'Base'
      )
      assert.ok(someCommon)
      const observed = expected.cards.get(someCommon.cardId)
      assert.ok(observed !== undefined)
      assert.ok(
        Math.abs(observed - SPEC_PER_COMMON) < FLOAT_TOL,
        `${someCommon.cardId} expected rate ${observed} should equal ${SPEC_PER_COMMON}`
      )
    })

    it('per-card expected for an Uncommon in LAW equals 3 × (1/60)', () => {
      const expected = getExpectedPerPack('LAW')
      const SPEC_PER_UC = LAW_BASE_UNCOMMONS_PER_PACK / LAW_POOL_UNCOMMONS // 0.05
      const someUC = getCardsBySet('LAW').find(
        (c) =>
          c.variantType === 'Normal' &&
          c.rarity === 'Uncommon' &&
          c.type !== 'Leader' &&
          c.type !== 'Base'
      )
      assert.ok(someUC)
      const observed = expected.cards.get(someUC.cardId)
      assert.ok(observed !== undefined)
      assert.ok(
        Math.abs(observed - SPEC_PER_UC) < FLOAT_TOL,
        `${someUC.cardId} expected rate ${observed} should equal ${SPEC_PER_UC}`
      )
    })

    it('per-card Map only contains Common/Uncommon/Rare/Legendary cards', () => {
      const expected = getExpectedPerPack('LAW')
      const allLawCards = getCardsBySet('LAW')
      const lawCardById = new Map(allLawCards.map((c) => [c.cardId, c]))
      for (const [cardId, _rate] of expected.cards) {
        const card = lawCardById.get(cardId)
        assert.ok(card, `cardId ${cardId} in expected.cards should exist in LAW pool`)
        assert.ok(
          (RARITIES as readonly string[]).includes(card.rarity),
          `cardId ${cardId} has rarity ${card.rarity}, not in base rarities`
        )
      }
    })
  })

  describe('belt-managed variants are excluded from per-card Map', () => {
    function assertNoBeltManagedForSet(setCode: string) {
      const expected = getExpectedPerPack(setCode)
      assert.ok(expected, `${setCode} should resolve a config`)
      // Older sets have duplicate cardIds across variants (e.g., SOR-214
      // exists as both Normal and Foil). When asserting "no belt-managed
      // cards in the per-card Map", we must verify that AT LEAST the
      // Normal variant exists for each cardId — i.e., the Map is keyed by
      // a cardId that has a Normal twin in the catalog. The service keys
      // only the Normal variant into the Map; a sibling Foil with the
      // same cardId is filtered out at the service level.
      const allCards = getCardsBySet(setCode)
      for (const [cardId] of expected.cards) {
        const normalTwin = allCards.find(
          (c) =>
            c.cardId === cardId &&
            c.variantType === 'Normal' &&
            c.isPrestige !== true &&
            c.isShowcase !== true &&
            c.isHyperspace !== true &&
            c.isFoil !== true &&
            c.isLeader !== true &&
            c.isBase !== true &&
            c.type !== 'Leader' &&
            c.type !== 'Base'
        )
        assert.ok(
          normalTwin,
          `${setCode} ${cardId} in expected.cards Map should have a base-belt Normal twin in cards.json`
        )
      }
    }

    it('LAW per-card Map has no HS / HSF / Showcase / Foil / Prestige cards', () => {
      assertNoBeltManagedForSet('LAW')
    })

    it('SOR per-card Map has no HS / HSF / Showcase / Foil / Prestige cards', () => {
      assertNoBeltManagedForSet('SOR')
    })
  })

  describe('scaleExpected', () => {
    it('packsCracked = 0 returns all zeros', () => {
      const perPack = getExpectedPerPack('LAW')
      const total = scaleExpected(perPack, 0)
      assert.strictEqual(total.packsCracked, 0)
      assert.strictEqual(total.baseCardsTotal, 0)
      for (const r of RARITIES) {
        assert.strictEqual(total.rarity[r], 0)
      }
      for (const cat of ASPECT_CATEGORIES) {
        assert.strictEqual(total.aspect[cat], 0)
      }
      for (const [, rate] of total.cards) {
        assert.strictEqual(rate, 0)
      }
    })

    it('packsCracked = 100 returns 100× per-pack values', () => {
      const perPack = getExpectedPerPack('LAW')
      const total = scaleExpected(perPack, 100)
      assert.strictEqual(total.packsCracked, 100)
      for (const r of RARITIES) {
        assert.ok(
          Math.abs(total.rarity[r] - perPack.rarity[r] * 100) < 1e-7,
          `rarity ${r}: expected ${perPack.rarity[r] * 100}, got ${total.rarity[r]}`
        )
      }
      for (const cat of ASPECT_CATEGORIES) {
        assert.ok(
          Math.abs(total.aspect[cat] - perPack.aspect[cat] * 100) < 1e-7,
          `aspect ${cat}: expected ${perPack.aspect[cat] * 100}, got ${total.aspect[cat]}`
        )
      }
      // Per-card scaling
      for (const [cardId, rate] of perPack.cards) {
        const scaledRate = total.cards.get(cardId)
        assert.ok(
          scaledRate !== undefined,
          `Missing ${cardId} in scaled cards`
        )
        assert.ok(Math.abs(scaledRate - rate * 100) < 1e-7)
      }
    })

    it('Legendary scaled to 120 packs is approximately 24 (1/5 × 120 = 24)', () => {
      // SPEC sanity: 120 packs × 1/5 legendary/pack = 24 legendaries expected.
      const perPack = getExpectedPerPack('LAW')
      const total = scaleExpected(perPack, 120)
      assert.ok(
        Math.abs(total.rarity.Legendary - 24) < 1e-9,
        `Expected 24 legendaries in 120 packs, got ${total.rarity.Legendary}`
      )
    })

    it('negative packsCracked is treated as 0 (defensive)', () => {
      const perPack = getExpectedPerPack('LAW')
      const total = scaleExpected(perPack, -5)
      assert.strictEqual(total.packsCracked, 0)
      assert.strictEqual(total.rarity.Common, 0)
    })

    it('NaN packsCracked is treated as 0 (defensive)', () => {
      const perPack = getExpectedPerPack('LAW')
      const total = scaleExpected(perPack, NaN)
      assert.strictEqual(total.packsCracked, 0)
    })
  })

  describe('unknown setCode', () => {
    it('returns null for an unknown set code', () => {
      assert.strictEqual(getExpectedPerPack('XYZ' as any), null)
    })

    it('returns null for empty string', () => {
      assert.strictEqual(getExpectedPerPack('' as any), null)
    })

    it('returns null for undefined', () => {
      assert.strictEqual(getExpectedPerPack(undefined as any), null)
    })
  })

  describe('module-scope cache', () => {
    it('returns the same object instance on repeat calls', () => {
      resetExpectedDistributionCache()
      const first = getExpectedPerPack('LAW')
      const second = getExpectedPerPack('LAW')
      assert.strictEqual(first, second, 'Should return cached instance')
    })

    it('resetExpectedDistributionCache clears the cache', () => {
      const first = getExpectedPerPack('LAW')
      resetExpectedDistributionCache()
      const second = getExpectedPerPack('LAW')
      // After reset, a new object should be returned (structurally equal
      // but different reference).
      assert.notStrictEqual(first, second)
      // But the values should match.
      assert.strictEqual(first.rarity.Common, second.rarity.Common)
      assert.strictEqual(first.rarity.Legendary, second.rarity.Legendary)
    })
  })
})
