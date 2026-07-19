// Spec-first tests for the Chaos Sealed selection rules.
//
// SPEC (src/services/chaosSealedSelection.ts): a Chaos Sealed pool must contain at least
// one Leader-bearing pack. Every real set booster has a Leader slot; GC Event Packs are
// promo packs whose catalog is Units only, so an all-Event-Pack pool is unbuildable.
import { test, describe } from 'node:test'
import assert from 'node:assert'
import {
  MAX_PROMO_PACKS_PER_TIER,
  MIN_LEADER_PACKS,
  packProvidesLeaders,
  promoTierForCode,
  splitSelection,
  validateChaosSealedSelection,
} from './chaosSealedSelection.ts'

describe('chaosSealedSelection', () => {
  test('SPEC: a pool needs at least 1 Leader-bearing pack', () => {
    assert.strictEqual(MIN_LEADER_PACKS, 1)
  })

  test('SPEC: you can add 1 of each Event Pack tier you own', () => {
    assert.strictEqual(MAX_PROMO_PACKS_PER_TIER, 1)
  })

  describe('splitSelection', () => {
    test('SPEC: Event Packs augment the pool — only set packs fill its slots', () => {
      const { setPacks, promoPacks } = splitSelection([
        'SOR', 'GC2026_SILVER', 'LAW', 'GC2026_BLACK',
      ])
      assert.deepStrictEqual(setPacks, ['SOR', 'LAW'])
      assert.deepStrictEqual(promoPacks, ['GC2026_SILVER', 'GC2026_BLACK'])
    })

    test('a six-pack pool plus both Event Packs still fills exactly six slots', () => {
      const selection = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'LAW', 'GC2026_SILVER', 'GC2026_BLACK']
      const { setPacks, promoPacks } = splitSelection(selection)
      assert.strictEqual(setPacks.length, 6, 'Event Packs must not consume pool slots')
      assert.strictEqual(promoPacks.length, 2)
    })

    test('preserves the order packs were chosen in, within each group', () => {
      const { setPacks } = splitSelection(['LAW', 'GC2026_SILVER', 'SOR'])
      assert.deepStrictEqual(setPacks, ['LAW', 'SOR'])
    })

    test('an empty selection splits into two empty groups', () => {
      assert.deepStrictEqual(splitSelection([]), { setPacks: [], promoPacks: [] })
    })
  })

  describe('Event Pack cap', () => {
    test('rejects more than one of the same tier', () => {
      const result = validateChaosSealedSelection(['SOR', 'GC2026_SILVER', 'GC2026_SILVER'])
      assert.strictEqual(result.ok, false)
      assert.strictEqual(result.code, 'tooManyPromoPacks')
    })

    test('allows one of each tier alongside a full pool', () => {
      const result = validateChaosSealedSelection([
        'SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'LAW', 'GC2026_SILVER', 'GC2026_BLACK',
      ])
      assert.strictEqual(result.ok, true)
    })
  })

  describe('promoTierForCode', () => {
    test('maps each Event Pack code to its entitlement tier', () => {
      assert.strictEqual(promoTierForCode('GC2026_SILVER'), 'silver')
      assert.strictEqual(promoTierForCode('GC2026_BLACK'), 'black')
    })

    test('returns null for ordinary set codes', () => {
      for (const code of ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'LAW', 'ASH', 'SOR-CB']) {
        assert.strictEqual(promoTierForCode(code), null, `${code} is a real set, not a promo`)
      }
    })
  })

  describe('packProvidesLeaders', () => {
    test('every real set booster carries a Leader slot', () => {
      for (const code of ['SOR', 'ASH', 'LAW', 'SOR-CB']) {
        assert.strictEqual(packProvidesLeaders(code), true, `${code} should provide Leaders`)
      }
    })

    test('Event Packs do not — their catalog is Units only', () => {
      assert.strictEqual(packProvidesLeaders('GC2026_SILVER'), false)
      assert.strictEqual(packProvidesLeaders('GC2026_BLACK'), false)
    })
  })

  describe('validateChaosSealedSelection', () => {
    test('rejects a pool built entirely from Event Packs', () => {
      const result = validateChaosSealedSelection(['GC2026_SILVER'])
      assert.strictEqual(result.ok, false)
      assert.strictEqual(result.code, 'noLeaderPack')
      assert.match(result.message ?? '', /Leader/)
    })

    test('rejects a mixed Silver + Black pool — neither tier has Leaders', () => {
      const result = validateChaosSealedSelection(['GC2026_SILVER', 'GC2026_BLACK'])
      assert.strictEqual(result.ok, false)
      assert.strictEqual(result.code, 'noLeaderPack')
    })

    test('accepts a pool at exactly the minimum: 1 set pack among Event Packs', () => {
      const result = validateChaosSealedSelection(['GC2026_SILVER', 'GC2026_BLACK', 'ASH'])
      assert.strictEqual(result.ok, true)
      assert.strictEqual(result.message, undefined)
    })

    test('accepts an ordinary all-set pool', () => {
      const result = validateChaosSealedSelection(['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'LAW'])
      assert.strictEqual(result.ok, true)
    })

    test('stays quiet on an empty selection — the pack count gates that, not this', () => {
      assert.strictEqual(validateChaosSealedSelection([]).ok, true)
    })

    test('carries user-facing copy explaining what to do, not just what is wrong', () => {
      const { message } = validateChaosSealedSelection(['GC2026_BLACK'])
      assert.match(message ?? '', /Add at least one set pack/)
    })
  })
})
