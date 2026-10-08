// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { jsonParse, jsonStringify } from './json'

describe('jsonParse', () => {
  describe('string input', () => {
    it('parses valid JSON string to object', () => {
      const result = jsonParse('{"foo": "bar"}')
      assert.deepStrictEqual(result, { foo: 'bar' })
    })

    it('parses valid JSON array string', () => {
      const result = jsonParse('[1, 2, 3]')
      assert.deepStrictEqual(result, [1, 2, 3])
    })

    it('parses nested JSON', () => {
      const result = jsonParse('{"a": {"b": {"c": 1}}}')
      assert.deepStrictEqual(result, { a: { b: { c: 1 } } })
    })

    it('returns fallback for invalid JSON string', () => {
      const result = jsonParse('not valid json', { default: true })
      assert.deepStrictEqual(result, { default: true })
    })

    it('returns null fallback by default for invalid JSON', () => {
      const result = jsonParse('invalid')
      assert.strictEqual(result, null)
    })

    it('returns fallback for empty string', () => {
      const result = jsonParse('', [])
      assert.deepStrictEqual(result, [])
    })

    it('returns fallback for whitespace-only string', () => {
      const result = jsonParse('   ', {})
      assert.deepStrictEqual(result, {})
    })
  })

  describe('object input', () => {
    it('returns object as-is', () => {
      const obj = { foo: 'bar' }
      const result = jsonParse(obj)
      assert.strictEqual(result, obj)
    })

    it('returns array as-is', () => {
      const arr = [1, 2, 3]
      const result = jsonParse(arr)
      assert.strictEqual(result, arr)
    })

    it('returns empty object as-is', () => {
      const obj = {}
      const result = jsonParse(obj)
      assert.strictEqual(result, obj)
    })

    it('returns empty array as-is', () => {
      const arr: number[] = []
      const result = jsonParse(arr)
      assert.strictEqual(result, arr)
    })
  })

  describe('nullish input', () => {
    it('returns null fallback by default for null input', () => {
      const result = jsonParse(null)
      assert.strictEqual(result, null)
    })

    it('returns null fallback by default for undefined input', () => {
      const result = jsonParse(undefined)
      assert.strictEqual(result, null)
    })

    it('returns custom fallback for null input', () => {
      const result = jsonParse(null, {})
      assert.deepStrictEqual(result, {})
    })

    it('returns custom fallback for undefined input', () => {
      const result = jsonParse(undefined, [])
      assert.deepStrictEqual(result, [])
    })
  })

  describe('edge cases', () => {
    it('parses JSON number', () => {
      const result = jsonParse('42')
      assert.strictEqual(result, 42)
    })

    it('parses JSON boolean true', () => {
      const result = jsonParse('true')
      assert.strictEqual(result, true)
    })

    it('parses JSON boolean false', () => {
      const result = jsonParse('false')
      assert.strictEqual(result, false)
    })

    it('parses JSON null', () => {
      const result = jsonParse('null')
      assert.strictEqual(result, null)
    })

    it('handles number input', () => {
      const result = jsonParse(42)
      assert.strictEqual(result, 42)
    })

    it('handles boolean input', () => {
      const result = jsonParse(true)
      assert.strictEqual(result, true)
    })
  })

  describe('characterization: matches existing codebase pattern', () => {
    // These tests verify the new function behaves identically to the old pattern:
    // typeof x === 'string' ? JSON.parse(x) : x

    it('matches pattern: string JSON parsed', () => {
      const value = '{"cards": [1,2,3]}'
      const oldPattern = typeof value === 'string' ? JSON.parse(value) : value
      const newPattern = jsonParse(value)
      assert.deepStrictEqual(newPattern, oldPattern)
    })

    it('matches pattern: object returned as-is', () => {
      const value = { cards: [1, 2, 3] }
      const oldPattern = typeof value === 'string' ? JSON.parse(value) : value
      const newPattern = jsonParse(value)
      assert.deepStrictEqual(newPattern, oldPattern)
    })

    it('matches pattern with fallback: null with default', () => {
      const value = null
      // Old pattern: (value ? (typeof value === 'string' ? JSON.parse(value) : value) : {})
      const oldPattern = value ? (typeof value === 'string' ? JSON.parse(value) : value) : {}
      const newPattern = jsonParse(value, {})
      assert.deepStrictEqual(newPattern, oldPattern)
    })

    it('matches pattern: already parsed pool cards', () => {
      // Simulating: typeof pool.cards === 'string' ? JSON.parse(pool.cards) : pool.cards
      const poolWithStringCards = { cards: '[{"id":1},{"id":2}]' }
      const poolWithObjectCards = { cards: [{ id: 1 }, { id: 2 }] }

      const oldString = typeof poolWithStringCards.cards === 'string'
        ? JSON.parse(poolWithStringCards.cards)
        : poolWithStringCards.cards
      const oldObject = typeof poolWithObjectCards.cards === 'string'
        ? JSON.parse(poolWithObjectCards.cards)
        : poolWithObjectCards.cards

      assert.deepStrictEqual(jsonParse(poolWithStringCards.cards), oldString)
      assert.deepStrictEqual(jsonParse(poolWithObjectCards.cards), oldObject)
    })
  })
})

describe('jsonStringify', () => {
  describe('object input', () => {
    it('stringifies object to JSON', () => {
      const result = jsonStringify({ foo: 'bar' })
      assert.strictEqual(result, '{"foo":"bar"}')
    })

    it('stringifies array to JSON', () => {
      const result = jsonStringify([1, 2, 3])
      assert.strictEqual(result, '[1,2,3]')
    })

    it('stringifies nested object', () => {
      const result = jsonStringify({ a: { b: 1 } })
      assert.strictEqual(result, '{"a":{"b":1}}')
    })
  })

  describe('string input', () => {
    it('returns string as-is (assumes already JSON)', () => {
      const result = jsonStringify('{"already":"json"}')
      assert.strictEqual(result, '{"already":"json"}')
    })

    it('returns plain string as-is', () => {
      const result = jsonStringify('hello')
      assert.strictEqual(result, 'hello')
    })
  })

  describe('nullish input', () => {
    it('returns null for null input', () => {
      const result = jsonStringify(null)
      assert.strictEqual(result, null)
    })

    it('returns null for undefined input', () => {
      const result = jsonStringify(undefined)
      assert.strictEqual(result, null)
    })

    it('returns custom fallback for null', () => {
      const result = jsonStringify(null, '{}')
      assert.strictEqual(result, '{}')
    })
  })

  describe('primitive input', () => {
    it('stringifies number', () => {
      const result = jsonStringify(42)
      assert.strictEqual(result, '42')
    })

    it('stringifies boolean', () => {
      const result = jsonStringify(true)
      assert.strictEqual(result, 'true')
    })
  })
})
