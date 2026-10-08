// Spec tests for "make the deck this listing needs" deep links.
// SPEC: src/utils/deckCreationLink.ts (1)-(5).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { deckCreationLinkForListing } from './deckCreationLink'

describe('deckCreationLinkForListing — sealed (SPEC 1)', () => {
  it('deep-links set AND pack count, so the pool arrives pre-configured', () => {
    assert.deepEqual(
      deckCreationLinkForListing({ setCode: 'LAW', format: 'sealed', packsPerPlayer: 8 }),
      { href: '/pools/new?set=LAW&packs=8', label: 'Make a LAW Sealed (8-pack) pool' }
    )
  })

  it('distinguishes the two sealed buckets — the whole point', () => {
    const six = deckCreationLinkForListing({ setCode: 'LAW', format: 'sealed', packsPerPlayer: 6 })
    const eight = deckCreationLinkForListing({ setCode: 'LAW', format: 'sealed', packsPerPlayer: 8 })
    assert.equal(six.href, '/pools/new?set=LAW&packs=6')
    assert.equal(eight.href, '/pools/new?set=LAW&packs=8')
    assert.notEqual(six.href, eight.href)
    assert.match(six.label, /6-pack/)
    assert.match(eight.label, /8-pack/)
  })

  it('omits packs when the bucket is unknown rather than guessing', () => {
    const link = deckCreationLinkForListing({ setCode: 'LAW', format: 'sealed', packsPerPlayer: null })
    assert.equal(link.href, '/pools/new?set=LAW')
    assert.equal(link.label, 'Make a LAW Sealed pool')
  })

  it('SPEC 5: encodes the set code', () => {
    const link = deckCreationLinkForListing({ setCode: 'A B', format: 'sealed', packsPerPlayer: 6 })
    assert.equal(link.href, '/pools/new?set=A%20B&packs=6')
  })

  it('treats a missing format as sealed (pool_type defaults to sealed)', () => {
    const link = deckCreationLinkForListing({ setCode: 'SEC', packsPerPlayer: 6 })
    assert.equal(link.href, '/pools/new?set=SEC&packs=6')
  })
})

describe('deckCreationLinkForListing — draft (SPEC 2)', () => {
  it('links to draft creation and NEVER emits a packs param', () => {
    const link = deckCreationLinkForListing({ setCode: 'SEC', format: 'draft', packsPerPlayer: 8 })
    assert.equal(link.href, '/draft/solo')
    assert.doesNotMatch(link.href, /packs/, 'pack count is meaningless for draft')
    assert.equal(link.label, 'Start a SEC Draft')
  })

  it('falls back to generic copy with no set code', () => {
    assert.deepEqual(
      deckCreationLinkForListing({ format: 'draft' }),
      { href: '/draft/solo', label: 'Start a Solo Draft' }
    )
  })
})

describe('deckCreationLinkForListing — other formats (SPEC 3)', () => {
  it('never forwards a multi-set (Chaos) code to /pools/new', () => {
    const link = deckCreationLinkForListing({
      setCode: 'SOR,JTL,LOF',
      format: 'chaos_sealed',
      packsPerPlayer: null,
    })
    assert.equal(link.href, '/formats')
    assert.doesNotMatch(link.href, /set=/)
  })

  it('sends every non-sealed, non-draft pool type to /formats', () => {
    for (const format of ['chaos_sealed', 'pack_wars', 'pack_blitz', 'rotisserie', 'imported']) {
      const link = deckCreationLinkForListing({ setCode: 'LAW', format })
      assert.equal(link.href, '/formats', `${format} should route to /formats`)
    }
  })

  it('a comma-joined set code on a sealed listing still cannot reach /pools/new', () => {
    // /pools/new takes exactly one set code — forwarding a list would 404 the set.
    const link = deckCreationLinkForListing({ setCode: 'SOR,JTL', format: 'sealed', packsPerPlayer: 6 })
    assert.equal(link.href, '/sealed')
    assert.doesNotMatch(link.href, /set=/)
  })
})

describe('deckCreationLinkForListing — no set code (SPEC 4)', () => {
  it('falls back to the sealed set picker', () => {
    assert.deepEqual(
      deckCreationLinkForListing({ format: 'sealed', packsPerPlayer: 6 }),
      { href: '/sealed', label: 'Start a Solo Sealed' }
    )
    assert.deepEqual(
      deckCreationLinkForListing({ setCode: '   ', format: 'sealed' }),
      { href: '/sealed', label: 'Start a Solo Sealed' }
    )
  })
})
