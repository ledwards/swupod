import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  COMPETITIVE_DRAFT_NEW_PATH,
  STANDARD_DRAFT_NEW_PATH,
  COMPETITIVE_SEALED_NEW_PATH,
  STANDARD_SEALED_NEW_PATH,
  initialDraftCompetitiveFromSearch,
  initialSealedCompetitiveFromSearch,
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

describe('sealed creation routes', () => {
  it('routes explicit Standard Sealed creation with competitive mode off', () => {
    assert.strictEqual(STANDARD_SEALED_NEW_PATH, '/sealed/new?competitive=0')
  })

  it('routes explicit Competitive Sealed creation with competitive mode on', () => {
    assert.strictEqual(COMPETITIVE_SEALED_NEW_PATH, '/sealed/new?competitive=1')
  })

  it('initializes competitive off for the standard route query', () => {
    assert.strictEqual(initialSealedCompetitiveFromSearch('?competitive=0'), false)
  })

  it('initializes competitive on for the Competitive Sealed route query', () => {
    assert.strictEqual(initialSealedCompetitiveFromSearch('?competitive=1'), true)
  })

  it('accepts URLSearchParams-like values from Next search params', () => {
    assert.strictEqual(initialSealedCompetitiveFromSearch(new URLSearchParams('competitive=1')), true)
  })

  it('SPEC: direct /sealed/new stays a standard (6-pack) pod by default', () => {
    assert.strictEqual(initialSealedCompetitiveFromSearch(''), false)
    assert.strictEqual(initialSealedCompetitiveFromSearch(null), false)
  })
})
