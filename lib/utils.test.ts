// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { formatSetCodeRange, generateShareId, validateRequired } from './utils'

describe('formatSetCodeRange', () => {
  it('returns empty string for empty array', () => {
    assert.strictEqual(formatSetCodeRange([]), '')
  })

  it('returns single set code as-is', () => {
    assert.strictEqual(formatSetCodeRange(['SOR']), 'SOR')
  })

  it('formats two consecutive sets as range', () => {
    assert.strictEqual(formatSetCodeRange(['SOR', 'SHD']), 'SOR-SHD')
  })

  it('formats three or more consecutive sets as range', () => {
    assert.strictEqual(formatSetCodeRange(['SOR', 'SHD', 'TWI']), 'SOR-TWI')
  })

  it('formats all six main sets as range', () => {
    assert.strictEqual(
      formatSetCodeRange(['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC']),
      'SOR-SEC'
    )
  })

  it('formats non-consecutive sets as comma-separated list', () => {
    assert.strictEqual(
      formatSetCodeRange(['SOR', 'TWI', 'LOF']),
      'SOR, TWI, LOF'
    )
  })

  it('handles unordered input by sorting first', () => {
    assert.strictEqual(
      formatSetCodeRange(['TWI', 'SOR', 'SHD']),
      'SOR-TWI'
    )
  })

  it('handles mixed consecutive and non-consecutive as list', () => {
    // SOR, SHD are consecutive but JTL breaks the chain
    assert.strictEqual(
      formatSetCodeRange(['SOR', 'SHD', 'JTL', 'LOF']),
      'SOR, SHD, JTL, LOF'
    )
  })

  it('includes LAW (set 7) in ranges', () => {
    // SEC and LAW are consecutive (6, 7)
    assert.strictEqual(
      formatSetCodeRange(['SEC', 'LAW']),
      'SEC-LAW'
    )
    assert.strictEqual(
      formatSetCodeRange(['JTL', 'LOF', 'SEC', 'LAW']),
      'JTL-LAW'
    )
  })
})

describe('generateShareId', () => {
  it('generates alphanumeric ID of default length', () => {
    const id = generateShareId()
    assert.strictEqual(id.length, 10)
    assert.match(id, /^[a-zA-Z0-9]+$/)
  })

  it('generates ID of specified length', () => {
    const id = generateShareId(8)
    assert.strictEqual(id.length, 8)
  })

  it('generates unique IDs', () => {
    const ids = new Set()
    for (let i = 0; i < 100; i++) {
      ids.add(generateShareId())
    }
    assert.strictEqual(ids.size, 100)
  })
})

describe('validateRequired', () => {
  it('passes when all required fields present', () => {
    assert.doesNotThrow(() => {
      validateRequired({ a: 1, b: 2 }, ['a', 'b'])
    })
  })

  it('throws when required field missing', () => {
    assert.throws(
      () => validateRequired({ a: 1 }, ['a', 'b']),
      /Missing required fields: b/
    )
  })

  it('throws listing all missing fields', () => {
    assert.throws(
      () => validateRequired({}, ['a', 'b', 'c']),
      /Missing required fields: a, b, c/
    )
  })
})
