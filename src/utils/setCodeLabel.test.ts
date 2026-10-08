// Spec-first tests for set-code display labels.
//
// SPEC (src/utils/setCodeLabel.ts):
//   1. De-dupe — six SOR packs is a "SOR" pool, not "SOR,SOR,SOR,SOR,SOR,SOR"
//   2. Event Packs display as PROMO, never their internal entitlement codes
//   3. First-seen order is preserved
import { test, describe } from 'node:test'
import assert from 'node:assert'
import { PROMO_SET_DISPLAY, formatSetCodeLabel, normalizeSetCodes } from './setCodeLabel.ts'

describe('setCodeLabel', () => {
  test('SPEC: Event Packs display as PROMO', () => {
    assert.strictEqual(PROMO_SET_DISPLAY, 'PROMO')
  })

  describe('de-duping', () => {
    test('a pool of six identical packs shows the set once', () => {
      assert.strictEqual(formatSetCodeLabel('SOR,SOR,SOR,SOR,SOR,SOR'), 'SOR')
    })

    test('keeps distinct sets, collapsing only the repeats', () => {
      assert.strictEqual(formatSetCodeLabel('SOR,SHD,SOR,LAW'), 'SOR, SHD, LAW')
    })

    test('preserves first-seen order rather than re-sorting', () => {
      assert.strictEqual(formatSetCodeLabel('LAW,ASH,SOR'), 'LAW, ASH, SOR')
    })
  })

  describe('Event Packs', () => {
    test('a pool of six Silver Event Packs is just PROMO', () => {
      assert.strictEqual(formatSetCodeLabel(Array(6).fill('GC2026_SILVER').join(',')), 'PROMO')
    })

    test('Silver and Black collapse together — both are PROMO', () => {
      assert.strictEqual(formatSetCodeLabel('GC2026_SILVER,GC2026_BLACK'), 'PROMO')
    })

    test('a mixed pool shows the real set alongside PROMO, once', () => {
      assert.strictEqual(
        formatSetCodeLabel('GC2026_SILVER,ASH,GC2026_BLACK,ASH'),
        'PROMO, ASH',
      )
    })
  })

  describe('input handling', () => {
    test('accepts an array as well as a comma-joined string', () => {
      assert.deepStrictEqual(normalizeSetCodes(['SOR', 'SOR', 'LAW']), ['SOR', 'LAW'])
    })

    test('trims whitespace and normalizes case', () => {
      assert.deepStrictEqual(normalizeSetCodes(' sor , SOR,  law '), ['SOR', 'LAW'])
    })

    test('a single plain set code passes through unchanged', () => {
      assert.strictEqual(formatSetCodeLabel('LAW'), 'LAW')
    })

    test('empty and nullish input yield nothing to display', () => {
      for (const empty of ['', null, undefined, ',', '  ']) {
        assert.strictEqual(formatSetCodeLabel(empty), '', `${JSON.stringify(empty)} should be empty`)
        assert.deepStrictEqual(normalizeSetCodes(empty), [])
      }
    })
  })
})
