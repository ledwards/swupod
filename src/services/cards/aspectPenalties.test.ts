// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  leaderIgnoresPenalty,
  getLeaderAbilityDescription,
  calculateAspectPenalty,
  isInAspect,
  getEffectiveCost,
  getRelevantAspects,
  PENALTY_PER_ASPECT,
  LEADER_PENALTY_ABILITIES,
} from './aspectPenalties'

describe('aspectPenalties', () => {
  // Test fixtures
  const vigilanceLeader = { name: 'Test Leader', aspects: ['Vigilance', 'Villainy'], set: 'SOR' }
  const vigilanceBase = { name: 'Test Base', aspects: ['Vigilance'] }
  const commandBase = { name: 'Command Base', aspects: ['Command'] }

  describe('calculateAspectPenalty', () => {
    describe('no penalty cases', () => {
      it('returns 0 for card with matching aspects', () => {
        const card = { aspects: ['Vigilance'] }
        assert.strictEqual(calculateAspectPenalty(card, vigilanceLeader, vigilanceBase), 0)
      })

      it('returns 0 for neutral card (no aspects)', () => {
        const card = { aspects: [] }
        assert.strictEqual(calculateAspectPenalty(card, vigilanceLeader, vigilanceBase), 0)
      })

      it('returns 0 for card with undefined aspects', () => {
        const card = {}
        assert.strictEqual(calculateAspectPenalty(card, vigilanceLeader, vigilanceBase), 0)
      })

      it('returns 0 when leaderCard is null', () => {
        const card = { aspects: ['Command'] }
        assert.strictEqual(calculateAspectPenalty(card, null, vigilanceBase), 0)
      })

      it('returns 0 when baseCard is null', () => {
        const card = { aspects: ['Command'] }
        assert.strictEqual(calculateAspectPenalty(card, vigilanceLeader, null), 0)
      })

      it('returns 0 for dual-aspect card fully covered', () => {
        const card = { aspects: ['Vigilance', 'Villainy'] }
        assert.strictEqual(calculateAspectPenalty(card, vigilanceLeader, vigilanceBase), 0)
      })
    })

    describe('penalty cases', () => {
      it('returns 2 for one uncovered aspect', () => {
        const card = { aspects: ['Command'] }
        assert.strictEqual(calculateAspectPenalty(card, vigilanceLeader, vigilanceBase), 2)
      })

      it('returns 4 for two uncovered aspects', () => {
        const card = { aspects: ['Command', 'Aggression'] }
        assert.strictEqual(calculateAspectPenalty(card, vigilanceLeader, vigilanceBase), 4)
      })

      it('returns 2 for dual-aspect card with one covered', () => {
        const card = { aspects: ['Vigilance', 'Command'] }
        // Leader has Vigilance+Villainy, Base has Vigilance
        // Card needs Vigilance (covered) + Command (not covered)
        assert.strictEqual(calculateAspectPenalty(card, vigilanceLeader, vigilanceBase), 2)
      })
    })

    describe('aspect matching one-for-one', () => {
      it('matches aspects one-for-one (duplicates matter)', () => {
        // Card needs 2x Vigilance
        const card = { aspects: ['Vigilance', 'Vigilance'] }
        // Leader has Vigilance+Villainy, Base has Vigilance
        // Total: 2x Vigilance coverage, card needs 2x Vigilance = fully covered
        assert.strictEqual(calculateAspectPenalty(card, vigilanceLeader, vigilanceBase), 0)
      })

      it('penalizes when card needs more of same aspect', () => {
        // Card needs 3x Vigilance
        const card = { aspects: ['Vigilance', 'Vigilance', 'Vigilance'] }
        // Leader has Vigilance+Villainy, Base has Vigilance
        // Total: 2x Vigilance coverage, card needs 3x = 1 uncovered = +2
        assert.strictEqual(calculateAspectPenalty(card, vigilanceLeader, vigilanceBase), 2)
      })
    })
  })

  describe('leaderIgnoresPenalty', () => {
    describe('Hera Syndulla (SOR)', () => {
      const sorHera = { name: 'Hera Syndulla', set: 'SOR', aspects: ['Command', 'Heroism'] }
      const nonSorHera = { name: 'Hera Syndulla', set: 'LOF', aspects: ['Command', 'Heroism'] }

      it('returns true for SPECTRE card with SOR Hera', () => {
        const spectreCard = { traits: ['SPECTRE'], aspects: ['Aggression'] }
        assert.strictEqual(leaderIgnoresPenalty(spectreCard, sorHera), true)
      })

      it('returns true for spectre (lowercase) card with SOR Hera', () => {
        const spectreCard = { traits: ['Spectre'], aspects: ['Aggression'] }
        assert.strictEqual(leaderIgnoresPenalty(spectreCard, sorHera), true)
      })

      it('returns false for non-SPECTRE card with SOR Hera', () => {
        const regularCard = { traits: ['Rebel'], aspects: ['Aggression'] }
        assert.strictEqual(leaderIgnoresPenalty(regularCard, sorHera), false)
      })

      it('returns false for SPECTRE card with non-SOR Hera', () => {
        const spectreCard = { traits: ['SPECTRE'], aspects: ['Aggression'] }
        assert.strictEqual(leaderIgnoresPenalty(spectreCard, nonSorHera), false)
      })
    })

    describe('Mon Mothma (SEC)', () => {
      const secMonMothma = { name: 'Mon Mothma', set: 'SEC', aspects: ['Command', 'Heroism'] }
      const nonSecMonMothma = { name: 'Mon Mothma', set: 'SOR', aspects: ['Command', 'Heroism'] }

      it('returns true for Official unit without Villainy', () => {
        const officialUnit = { type: 'Unit', traits: ['Official'], aspects: ['Command'] }
        assert.strictEqual(leaderIgnoresPenalty(officialUnit, secMonMothma), true)
      })

      it('returns false for Official unit WITH Villainy', () => {
        const villainousOfficial = { type: 'Unit', traits: ['Official'], aspects: ['Command', 'Villainy'] }
        assert.strictEqual(leaderIgnoresPenalty(villainousOfficial, secMonMothma), false)
      })

      it('returns false for Official non-unit (Event)', () => {
        const officialEvent = { type: 'Event', traits: ['Official'], aspects: ['Command'] }
        assert.strictEqual(leaderIgnoresPenalty(officialEvent, secMonMothma), false)
      })

      it('returns false for non-Official unit', () => {
        const regularUnit = { type: 'Unit', traits: ['Rebel'], aspects: ['Command'] }
        assert.strictEqual(leaderIgnoresPenalty(regularUnit, secMonMothma), false)
      })

      it('returns false with non-SEC Mon Mothma', () => {
        const officialUnit = { type: 'Unit', traits: ['Official'], aspects: ['Command'] }
        assert.strictEqual(leaderIgnoresPenalty(officialUnit, nonSecMonMothma), false)
      })
    })

    describe('edge cases', () => {
      it('returns false for null leaderCard', () => {
        const card = { traits: ['SPECTRE'], aspects: ['Aggression'] }
        assert.strictEqual(leaderIgnoresPenalty(card, null), false)
      })

      it('returns false for leaderCard without name', () => {
        const card = { traits: ['SPECTRE'], aspects: ['Aggression'] }
        assert.strictEqual(leaderIgnoresPenalty(card, { set: 'SOR' }), false)
      })

      it('returns false for unknown leader', () => {
        const card = { traits: ['SPECTRE'], aspects: ['Aggression'] }
        const unknownLeader = { name: 'Unknown Leader', set: 'SOR' }
        assert.strictEqual(leaderIgnoresPenalty(card, unknownLeader), false)
      })

      it('returns false for card without traits', () => {
        const card = { aspects: ['Aggression'] }
        const sorHera = { name: 'Hera Syndulla', set: 'SOR' }
        assert.strictEqual(leaderIgnoresPenalty(card, sorHera), false)
      })
    })
  })

  describe('calculateAspectPenalty with leader abilities', () => {
    it('ignores penalty for SPECTRE card with SOR Hera', () => {
      const sorHera = { name: 'Hera Syndulla', set: 'SOR', aspects: ['Command', 'Heroism'] }
      const commandBase = { aspects: ['Command'] }
      const spectreCard = { traits: ['SPECTRE'], aspects: ['Aggression', 'Villainy'] }
      // Without ability, would be +4 (Aggression + Villainy uncovered)
      // With Hera's ability, should be 0
      assert.strictEqual(calculateAspectPenalty(spectreCard, sorHera, commandBase), 0)
    })

    it('ignores penalty for Official unit with SEC Mon Mothma', () => {
      const secMonMothma = { name: 'Mon Mothma', set: 'SEC', aspects: ['Command', 'Heroism'] }
      const commandBase = { aspects: ['Command'] }
      const officialUnit = { type: 'Unit', traits: ['Official'], aspects: ['Vigilance'] }
      // Without ability, would be +2 (Vigilance uncovered)
      // With Mon Mothma's ability, should be 0
      assert.strictEqual(calculateAspectPenalty(officialUnit, secMonMothma, commandBase), 0)
    })

    it('still applies penalty for Villainous Official with Mon Mothma', () => {
      const secMonMothma = { name: 'Mon Mothma', set: 'SEC', aspects: ['Command', 'Heroism'] }
      const commandBase = { aspects: ['Command'] }
      const villainousOfficial = { type: 'Unit', traits: ['Official'], aspects: ['Villainy'] }
      // Mon Mothma's ability doesn't apply to Villainy cards
      // Villainy uncovered = +2
      assert.strictEqual(calculateAspectPenalty(villainousOfficial, secMonMothma, commandBase), 2)
    })
  })

  describe('getLeaderAbilityDescription', () => {
    it('returns description for SOR Hera', () => {
      const sorHera = { name: 'Hera Syndulla', set: 'SOR' }
      assert.strictEqual(
        getLeaderAbilityDescription(sorHera),
        'Ignores aspect penalty on Spectre cards'
      )
    })

    it('returns description for SEC Mon Mothma', () => {
      const secMonMothma = { name: 'Mon Mothma', set: 'SEC' }
      assert.strictEqual(
        getLeaderAbilityDescription(secMonMothma),
        'Ignores aspect penalty on non-Villainy Official units'
      )
    })

    it('returns null for non-SOR Hera', () => {
      const lofHera = { name: 'Hera Syndulla', set: 'LOF' }
      assert.strictEqual(getLeaderAbilityDescription(lofHera), null)
    })

    it('returns null for non-SEC Mon Mothma', () => {
      const sorMonMothma = { name: 'Mon Mothma', set: 'SOR' }
      assert.strictEqual(getLeaderAbilityDescription(sorMonMothma), null)
    })

    it('returns null for unknown leader', () => {
      const unknownLeader = { name: 'Unknown Leader', set: 'SOR' }
      assert.strictEqual(getLeaderAbilityDescription(unknownLeader), null)
    })

    it('returns null for null leaderCard', () => {
      assert.strictEqual(getLeaderAbilityDescription(null), null)
    })

    it('returns null for leaderCard without name', () => {
      assert.strictEqual(getLeaderAbilityDescription({ set: 'SOR' }), null)
    })
  })

  describe('isInAspect', () => {
    it('returns true when penalty is 0', () => {
      const card = { aspects: ['Vigilance'] }
      assert.strictEqual(isInAspect(card, vigilanceLeader, vigilanceBase), true)
    })

    it('returns false when penalty > 0', () => {
      const card = { aspects: ['Command'] }
      assert.strictEqual(isInAspect(card, vigilanceLeader, vigilanceBase), false)
    })

    it('returns true for neutral cards', () => {
      const card = { aspects: [] }
      assert.strictEqual(isInAspect(card, vigilanceLeader, vigilanceBase), true)
    })
  })

  describe('getEffectiveCost', () => {
    it('returns base cost when no penalty', () => {
      const card = { cost: 3, aspects: ['Vigilance'] }
      assert.strictEqual(getEffectiveCost(card, vigilanceLeader, vigilanceBase), 3)
    })

    it('adds penalty to base cost', () => {
      const card = { cost: 3, aspects: ['Command'] }
      assert.strictEqual(getEffectiveCost(card, vigilanceLeader, vigilanceBase), 5)
    })

    it('handles null cost as 0', () => {
      const card = { cost: null, aspects: ['Vigilance'] }
      assert.strictEqual(getEffectiveCost(card, vigilanceLeader, vigilanceBase), 0)
    })

    it('handles undefined cost as 0', () => {
      const card = { aspects: ['Vigilance'] }
      assert.strictEqual(getEffectiveCost(card, vigilanceLeader, vigilanceBase), 0)
    })

    it('handles cost 0 correctly', () => {
      const card = { cost: 0, aspects: ['Command'] }
      // Cost 0 + penalty 2 = 2
      assert.strictEqual(getEffectiveCost(card, vigilanceLeader, vigilanceBase), 2)
    })
  })

  describe('getRelevantAspects', () => {
    it('combines leader and base aspects', () => {
      const result = getRelevantAspects(vigilanceLeader, vigilanceBase)
      assert.deepStrictEqual(result, ['Vigilance', 'Villainy', 'Vigilance'])
    })

    it('handles null leader', () => {
      const result = getRelevantAspects(null, vigilanceBase)
      assert.deepStrictEqual(result, ['Vigilance'])
    })

    it('handles null base', () => {
      const result = getRelevantAspects(vigilanceLeader, null)
      assert.deepStrictEqual(result, ['Vigilance', 'Villainy'])
    })

    it('handles both null', () => {
      const result = getRelevantAspects(null, null)
      assert.deepStrictEqual(result, [])
    })

    it('handles leader without aspects', () => {
      const result = getRelevantAspects({ name: 'Test' }, vigilanceBase)
      assert.deepStrictEqual(result, ['Vigilance'])
    })
  })

  describe('constants', () => {
    it('PENALTY_PER_ASPECT is 2', () => {
      assert.strictEqual(PENALTY_PER_ASPECT, 2)
    })

    it('LEADER_PENALTY_ABILITIES has Hera Syndulla', () => {
      assert.ok(LEADER_PENALTY_ABILITIES['Hera Syndulla'])
      assert.strictEqual(LEADER_PENALTY_ABILITIES['Hera Syndulla'].set, 'SOR')
    })

    it('LEADER_PENALTY_ABILITIES has Mon Mothma', () => {
      assert.ok(LEADER_PENALTY_ABILITIES['Mon Mothma'])
      assert.strictEqual(LEADER_PENALTY_ABILITIES['Mon Mothma'].set, 'SEC')
    })
  })
})
