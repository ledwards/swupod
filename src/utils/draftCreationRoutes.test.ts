import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  COMPETITIVE_DRAFT_NEW_PATH,
  STANDARD_DRAFT_NEW_PATH,
  initialDraftCompetitiveFromSearch,
} from './draftCreationRoutes'

describe('draft creation routes', () => {
  it('routes explicit Standard Draft creation with competitive mode off', () => {
    assert.strictEqual(STANDARD_DRAFT_NEW_PATH, '/draft/new?competitive=0')
  })

  it('routes explicit Competitive Draft creation with competitive mode on', () => {
    assert.strictEqual(COMPETITIVE_DRAFT_NEW_PATH, '/draft/new?competitive=1')
  })

  it('initializes Swiss Rounds off for the standard route query', () => {
    assert.strictEqual(initialDraftCompetitiveFromSearch('?competitive=0'), false)
  })

  it('accepts URLSearchParams-like values from Next search params', () => {
    assert.strictEqual(initialDraftCompetitiveFromSearch(new URLSearchParams('competitive=0')), false)
  })

  it('initializes Swiss Rounds on for the competitive route query', () => {
    assert.strictEqual(initialDraftCompetitiveFromSearch('?competitive=1'), true)
  })

  it('keeps the direct /draft/new default as Swiss Rounds on', () => {
    assert.strictEqual(initialDraftCompetitiveFromSearch(''), true)
  })
})
