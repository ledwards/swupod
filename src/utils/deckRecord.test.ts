import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatRecord } from './deckRecord'

describe('formatRecord', () => {
  it('formats wins, losses, draws, and integer win rate', () => {
    assert.equal(formatRecord(1, 3, 0), '1W-3L-0D (25%)')
    assert.equal(formatRecord(2, 1, 0), '2W-1L-0D (67%)')
  })

  it('returns a visible non-empty empty label for zero games', () => {
    assert.equal(formatRecord(0, 0, 0), 'No games')
    assert.equal(formatRecord(0, 0, 0, { emptyLabel: 'No reps yet' }), 'No reps yet')
    assert.notEqual(formatRecord(0, 0, 0), '')
  })

  it('includes draws in the denominator', () => {
    assert.equal(formatRecord(1, 1, 1), '1W-1L-1D (33%)')
  })

  it('coerces nullish and string counts without NaN', () => {
    assert.equal(formatRecord({ wins: '3', losses: null, draws: undefined }), '3W-0L-0D (100%)')
    assert.equal(formatRecord({ wins: null, losses: '3', draws: null }), '0W-3L-0D (0%)')
  })

  it('handles undefeated and winless records', () => {
    assert.equal(formatRecord(3, 0, 0), '3W-0L-0D (100%)')
    assert.equal(formatRecord(0, 3, 0), '0W-3L-0D (0%)')
  })
})
