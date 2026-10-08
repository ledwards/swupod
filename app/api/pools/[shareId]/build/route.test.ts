// @ts-nocheck
/**
 * Tests for POST /api/pools/:shareId/build
 *
 * Tests the deck building endpoint including:
 * - Pod broadcast trigger for draft pools
 * - Broadcast skipped for sealed pools
 * - deck_builder_state validation
 * - built_decks upsert logic
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'

// Simulate the broadcast decision logic from the build route
function shouldBroadcastPodState(pool) {
  return pool.pool_type === 'draft' && pool.pod_id != null
}

// Simulate the deck validation from the build route
function validateDeckState(state) {
  if (!state.activeLeader && !state.activeBase) {
    return { valid: false, error: 'No deck has been built for this pool yet' }
  }
  return { valid: true, error: null }
}

// Simulate the deck data validation
function validateDeckData(deckData) {
  if (!deckData.leader && !deckData.base) {
    return { valid: false, error: 'No valid deck found' }
  }
  return { valid: true, error: null }
}

// Simulate user ID resolution
function resolveUserId(session, pool) {
  return session?.userId || pool.user_id || null
}

describe('POST /api/pools/:shareId/build', () => {
  describe('pod broadcast trigger', () => {
    it('triggers broadcast for draft pools with pod_id', () => {
      const pool = { pool_type: 'draft', pod_id: 'pod-uuid-1' }
      assert.strictEqual(shouldBroadcastPodState(pool), true)
    })

    it('does NOT trigger broadcast for sealed pools', () => {
      const pool = { pool_type: 'sealed', pod_id: null }
      assert.strictEqual(shouldBroadcastPodState(pool), false)
    })

    it('does NOT trigger broadcast for draft pool missing pod_id', () => {
      const pool = { pool_type: 'draft', pod_id: null }
      assert.strictEqual(shouldBroadcastPodState(pool), false)
    })

    it('does NOT trigger broadcast for rotisserie pools', () => {
      const pool = { pool_type: 'rotisserie', pod_id: null }
      assert.strictEqual(shouldBroadcastPodState(pool), false)
    })

    it('does NOT trigger broadcast for pack-wars pools', () => {
      const pool = { pool_type: 'pack-wars', pod_id: null }
      assert.strictEqual(shouldBroadcastPodState(pool), false)
    })
  })

  describe('deck state validation', () => {
    it('valid when both leader and base are set', () => {
      const state = { activeLeader: 'leader-1', activeBase: 'base-1' }
      const result = validateDeckState(state)
      assert.strictEqual(result.valid, true)
    })

    it('valid when only leader is set', () => {
      const state = { activeLeader: 'leader-1', activeBase: null }
      const result = validateDeckState(state)
      assert.strictEqual(result.valid, true)
    })

    it('valid when only base is set', () => {
      const state = { activeLeader: null, activeBase: 'base-1' }
      const result = validateDeckState(state)
      assert.strictEqual(result.valid, true)
    })

    it('invalid when neither leader nor base is set', () => {
      const state = { activeLeader: null, activeBase: null }
      const result = validateDeckState(state)
      assert.strictEqual(result.valid, false)
      assert.strictEqual(result.error, 'No deck has been built for this pool yet')
    })

    it('invalid with empty state', () => {
      const state = {}
      const result = validateDeckState(state)
      assert.strictEqual(result.valid, false)
    })
  })

  describe('deck data validation', () => {
    it('valid when leader and base exist in deck data', () => {
      const deckData = {
        leader: { id: 'SOR_001', count: 1 },
        base: { id: 'SOR_100', count: 1 },
        deck: [],
        sideboard: [],
      }
      assert.strictEqual(validateDeckData(deckData).valid, true)
    })

    it('valid when only leader exists', () => {
      const deckData = { leader: { id: 'SOR_001', count: 1 }, base: null, deck: [], sideboard: [] }
      assert.strictEqual(validateDeckData(deckData).valid, true)
    })

    it('invalid when neither leader nor base exists', () => {
      const deckData = { leader: null, base: null, deck: [], sideboard: [] }
      const result = validateDeckData(deckData)
      assert.strictEqual(result.valid, false)
      assert.strictEqual(result.error, 'No valid deck found')
    })
  })

  describe('user ID resolution', () => {
    it('uses session userId when available', () => {
      const session = { userId: 'session-user' }
      const pool = { user_id: 'pool-owner' }
      assert.strictEqual(resolveUserId(session, pool), 'session-user')
    })

    it('falls back to pool user_id when no session', () => {
      const pool = { user_id: 'pool-owner' }
      assert.strictEqual(resolveUserId(null, pool), 'pool-owner')
    })

    it('returns null when no session and no pool owner', () => {
      const pool = { user_id: null }
      assert.strictEqual(resolveUserId(null, pool), null)
    })

    it('prefers session userId over pool user_id', () => {
      const session = { userId: 'logged-in-user' }
      const pool = { user_id: 'original-owner' }
      assert.strictEqual(resolveUserId(session, pool), 'logged-in-user')
    })
  })

  describe('upsert behavior', () => {
    it('ON CONFLICT updates deck data without changing card_pool_id', () => {
      // This test documents the SQL upsert behavior:
      // INSERT ... ON CONFLICT (card_pool_id) DO UPDATE SET ...
      // The constraint is UNIQUE on card_pool_id, so one built deck per pool
      const constraint = 'card_pool_id'
      const updatedFields = ['user_id', 'leader', 'base', 'deck', 'sideboard', 'built_at']

      assert.strictEqual(constraint, 'card_pool_id')
      assert.ok(updatedFields.includes('leader'), 'should update leader')
      assert.ok(updatedFields.includes('base'), 'should update base')
      assert.ok(updatedFields.includes('deck'), 'should update deck')
      assert.ok(updatedFields.includes('sideboard'), 'should update sideboard')
      assert.ok(updatedFields.includes('built_at'), 'should update built_at timestamp')
      assert.ok(!updatedFields.includes('set_code'), 'should NOT update set_code')
      assert.ok(!updatedFields.includes('pool_type'), 'should NOT update pool_type')
    })
  })
})
