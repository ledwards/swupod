// @ts-nocheck
/**
 * DeckBuilderHeader Tests
 *
 * Tests the play button redirect logic:
 * - Competitive pods (draft OR sealed) redirect to /pool/:shareId/deck/play
 * - Casual draft pods redirect to /draft/:shareId/pod
 * - Casual sealed pods redirect to /sealed/:shareId/pod
 * - Redirect only when deck is legal (leader + base + 30 cards)
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { resolvePlayDestination } from '../../utils/deckBuilderSharing.ts'

// The redirect the DeckBuilder's handlePlay performs, gated on deck legality.
// The URL itself comes from the real shared resolver, not a copy of it.
function getPlayRedirectUrl(isDeckLegal, poolType, podShareId, shareId, competitive = false) {
  if (!isDeckLegal) return null
  return resolvePlayDestination({ poolType, podShareId, competitive, shareId })
}

// Simulate deck legality check
function isDeckLegal(activeLeader, activeBase, deckCardCount) {
  return !!(activeLeader && activeBase && deckCardCount >= 30)
}

describe('DeckBuilderHeader play redirect', () => {
  describe('redirect URL logic', () => {
    it('redirects draft pool to pod page', () => {
      const url = getPlayRedirectUrl(true, 'draft', 'draft-abc', 'pool-xyz')
      assert.strictEqual(url, '/draft/draft-abc/pod')
    })

    it('redirects solo sealed pool to play page', () => {
      const url = getPlayRedirectUrl(true, 'sealed', null, 'pool-xyz')
      assert.strictEqual(url, '/pool/pool-xyz/deck/play')
    })

    it('redirects sealed pod pool to sealed pod page', () => {
      const url = getPlayRedirectUrl(true, 'sealed', 'sealed-abc', 'pool-xyz')
      assert.strictEqual(url, '/sealed/sealed-abc/pod')
    })

    it('redirects draft pool without a pod to play page', () => {
      const url = getPlayRedirectUrl(true, 'draft', null, 'pool-xyz')
      assert.strictEqual(url, '/pool/pool-xyz/deck/play')
    })

    it('returns null when deck is not legal', () => {
      const url = getPlayRedirectUrl(false, 'draft', 'draft-abc', 'pool-xyz')
      assert.strictEqual(url, null)
    })

    it('returns null for illegal sealed deck', () => {
      const url = getPlayRedirectUrl(false, 'sealed', null, 'pool-xyz')
      assert.strictEqual(url, null)
    })
  })

  describe('competitive pods (Swiss Practice)', () => {
    it('NEW CODE: competitive SEALED pod goes to the Swiss play page, not the casual sealed hub', () => {
      const url = getPlayRedirectUrl(true, 'sealed', 'sealed-abc', 'pool-xyz', true)
      assert.strictEqual(url, '/pool/pool-xyz/deck/play')
    })

    it('OLD CODE: competitive sealed pod must NOT land on /sealed/:id/pod', () => {
      const url = getPlayRedirectUrl(true, 'sealed', 'sealed-abc', 'pool-xyz', true)
      assert.notStrictEqual(url, '/sealed/sealed-abc/pod')
    })

    it('competitive DRAFT pod goes to the Swiss play page', () => {
      const url = getPlayRedirectUrl(true, 'draft', 'draft-abc', 'pool-xyz', true)
      assert.strictEqual(url, '/pool/pool-xyz/deck/play')
    })
  })

  describe('deck legality', () => {
    it('legal when leader + base + 30+ cards', () => {
      assert.strictEqual(isDeckLegal('leader-1', 'base-1', 30), true)
    })

    it('legal with more than 30 cards', () => {
      assert.strictEqual(isDeckLegal('leader-1', 'base-1', 50), true)
    })

    it('illegal without leader', () => {
      assert.strictEqual(isDeckLegal(null, 'base-1', 30), false)
    })

    it('illegal without base', () => {
      assert.strictEqual(isDeckLegal('leader-1', null, 30), false)
    })

    it('illegal with fewer than 30 cards', () => {
      assert.strictEqual(isDeckLegal('leader-1', 'base-1', 29), false)
    })

    it('illegal with 0 cards', () => {
      assert.strictEqual(isDeckLegal('leader-1', 'base-1', 0), false)
    })

    it('illegal with no leader, no base, no cards', () => {
      assert.strictEqual(isDeckLegal(null, null, 0), false)
    })
  })
})
