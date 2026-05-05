// @ts-nocheck
/**
 * Tests for the pool/deck assembly service (U4).
 *
 * Spec: takes resolved rows + active leader/base IDs and produces
 * { cards, deckBuilderState } ready to INSERT into card_pools. Server-only.
 *
 * Run: node --import tsx/esm src/services/importPool/buildPool.test.ts
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildPool } from './buildPool.ts'

// Tiny synthetic card universe for tests. Real cards have ~30 fields; we only
// populate what buildPool reads.
function mkCard(overrides) {
  return {
    id: overrides.id,
    cardId: overrides.cardId || `LAW-${String(overrides.n || 1).padStart(3, '0')}`,
    name: overrides.name,
    subtitle: overrides.subtitle ?? null,
    type: overrides.type || 'Unit',
    set: 'LAW',
    aspects: overrides.aspects || [],
    variantType: 'Normal',
    isLeader: !!overrides.isLeader,
    isBase: !!overrides.isBase,
  }
}

// 6 leaders, 6 bases, 1 unit card
const L1 = mkCard({ id: 'l1', name: 'Leader One',   type: 'Leader', isLeader: true,  n: 1 })
const L2 = mkCard({ id: 'l2', name: 'Leader Two',   type: 'Leader', isLeader: true,  n: 2 })
const L3 = mkCard({ id: 'l3', name: 'Leader Three', type: 'Leader', isLeader: true,  n: 3 })
const L4 = mkCard({ id: 'l4', name: 'Leader Four',  type: 'Leader', isLeader: true,  n: 4 })
const L5 = mkCard({ id: 'l5', name: 'Leader Five',  type: 'Leader', isLeader: true,  n: 5 })
const L6 = mkCard({ id: 'l6', name: 'Leader Six',   type: 'Leader', isLeader: true,  n: 6 })
const B1 = mkCard({ id: 'b1', name: 'Base One',   type: 'Base', isBase: true, n: 7 })
const B2 = mkCard({ id: 'b2', name: 'Base Two',   type: 'Base', isBase: true, n: 8 })
const B3 = mkCard({ id: 'b3', name: 'Base Three', type: 'Base', isBase: true, n: 9 })
const B4 = mkCard({ id: 'b4', name: 'Base Four',  type: 'Base', isBase: true, n: 10 })
const B5 = mkCard({ id: 'b5', name: 'Base Five',  type: 'Base', isBase: true, n: 11 })
const B6 = mkCard({ id: 'b6', name: 'Base Six',   type: 'Base', isBase: true, n: 12 })
const U1 = mkCard({ id: 'u1', name: 'Sabacc Dealer',  type: 'Unit',    n: 13, aspects: ['Cunning'] })
const U2 = mkCard({ id: 'u2', name: 'Death Star Plans', type: 'Event', n: 14, aspects: ['Vigilance'] })

// Build a valid 96-card pool: 6 leaders (qty 1 each) + 6 bases (qty 1 each) + 84 of U1
function buildHappyPathRows({ activeLeaderDeckQty = 1, activeBaseDeckQty = 1, u1DeckQty = 30 } = {}) {
  return [
    { card: L1, poolQty: 1, deckQty: activeLeaderDeckQty },
    { card: L2, poolQty: 1, deckQty: 0 },
    { card: L3, poolQty: 1, deckQty: 0 },
    { card: L4, poolQty: 1, deckQty: 0 },
    { card: L5, poolQty: 1, deckQty: 0 },
    { card: L6, poolQty: 1, deckQty: 0 },
    { card: B1, poolQty: 1, deckQty: activeBaseDeckQty },
    { card: B2, poolQty: 1, deckQty: 0 },
    { card: B3, poolQty: 1, deckQty: 0 },
    { card: B4, poolQty: 1, deckQty: 0 },
    { card: B5, poolQty: 1, deckQty: 0 },
    { card: B6, poolQty: 1, deckQty: 0 },
    { card: U1, poolQty: 84, deckQty: u1DeckQty },
  ]
}

describe('buildPool', () => {
  describe('happy path', () => {
    it('produces a 96-card flat array', () => {
      const result = buildPool({
        resolvedRows: buildHappyPathRows(),
        activeLeaderId: 'l1',
        activeBaseId: 'b1',
        setCode: 'LAW',
        poolName: 'Test Pool',
      })

      assert.equal(result.validationErrors.length, 0)
      assert.equal(result.cards.length, 96)
    })

    it('puts ALL leaders and bases in leaders-bases section', () => {
      const result = buildPool({
        resolvedRows: buildHappyPathRows(),
        activeLeaderId: 'l1',
        activeBaseId: 'b1',
        setCode: 'LAW',
        poolName: 'Test Pool',
      })

      const leadersBasesPositions = Object.values(result.deckBuilderState.cardPositions)
        .filter(p => p.section === 'leaders-bases')
      assert.equal(leadersBasesPositions.length, 12)
    })

    it('splits other cards into deck (first deckQty copies) and sideboard (rest)', () => {
      const result = buildPool({
        resolvedRows: buildHappyPathRows({ u1DeckQty: 30 }),
        activeLeaderId: 'l1',
        activeBaseId: 'b1',
        setCode: 'LAW',
        poolName: 'Test Pool',
      })

      const deckPositions = Object.values(result.deckBuilderState.cardPositions)
        .filter(p => p.section === 'deck')
      const sideboardPositions = Object.values(result.deckBuilderState.cardPositions)
        .filter(p => p.section === 'sideboard')

      assert.equal(deckPositions.length, 30)
      assert.equal(sideboardPositions.length, 54) // 84 - 30
      // Deck positions are enabled, sideboard positions are not
      assert.ok(deckPositions.every(p => p.enabled === true))
      assert.ok(sideboardPositions.every(p => p.enabled === false))
    })

    it('points activeLeader and activeBase at position keys (not card IDs)', () => {
      const result = buildPool({
        resolvedRows: buildHappyPathRows(),
        activeLeaderId: 'l1',
        activeBaseId: 'b1',
        setCode: 'LAW',
        poolName: 'Test Pool',
      })

      const { activeLeader, activeBase, cardPositions } = result.deckBuilderState
      assert.ok(activeLeader, 'activeLeader should be set')
      assert.ok(activeBase, 'activeBase should be set')
      assert.ok(cardPositions[activeLeader], 'activeLeader should reference an existing position')
      assert.ok(cardPositions[activeBase], 'activeBase should reference an existing position')
      assert.equal(cardPositions[activeLeader].card.id, 'l1')
      assert.equal(cardPositions[activeBase].card.id, 'b1')
      assert.equal(cardPositions[activeLeader].section, 'leaders-bases')
    })

    it('uses the convention "leader-N-id", "base-N-id", "pool-N-id" for position keys', () => {
      const result = buildPool({
        resolvedRows: buildHappyPathRows(),
        activeLeaderId: 'l1',
        activeBaseId: 'b1',
        setCode: 'LAW',
        poolName: 'Test Pool',
      })

      const keys = Object.keys(result.deckBuilderState.cardPositions)
      assert.ok(keys.some(k => k.startsWith('leader-')), 'has leader-prefixed keys')
      assert.ok(keys.some(k => k.startsWith('base-')), 'has base-prefixed keys')
      assert.ok(keys.some(k => k.startsWith('pool-')), 'has pool-prefixed keys')
    })

    it('produces unique position keys for duplicate-card copies', () => {
      const result = buildPool({
        resolvedRows: buildHappyPathRows(),
        activeLeaderId: 'l1',
        activeBaseId: 'b1',
        setCode: 'LAW',
        poolName: 'Test Pool',
      })

      const keys = Object.keys(result.deckBuilderState.cardPositions)
      const uniqueKeys = new Set(keys)
      assert.equal(keys.length, uniqueKeys.size, 'all keys should be unique')
    })

    it('preserves the pool name', () => {
      const result = buildPool({
        resolvedRows: buildHappyPathRows(),
        activeLeaderId: 'l1',
        activeBaseId: 'b1',
        setCode: 'LAW',
        poolName: 'Crystal Cup #14 · Han Solo / Echo Base',
      })

      assert.equal(result.deckBuilderState.poolName, 'Crystal Cup #14 · Han Solo / Echo Base')
    })
  })

  describe('regression guard for DeckBuilder restoration seam', () => {
    // DeckBuilder.tsx:915 silently drops bases/leaders placed in 'deck' or 'sideboard'.
    // buildPool MUST place leaders/bases in 'leaders-bases' to avoid silent data loss
    // on restoration.
    it('never places a leader card in deck or sideboard sections', () => {
      const result = buildPool({
        resolvedRows: buildHappyPathRows(),
        activeLeaderId: 'l1',
        activeBaseId: 'b1',
        setCode: 'LAW',
        poolName: 'Test Pool',
      })

      const leaderInDeckOrSideboard = Object.values(result.deckBuilderState.cardPositions)
        .filter(p => (p.section === 'deck' || p.section === 'sideboard') && p.card.isLeader)
      assert.equal(leaderInDeckOrSideboard.length, 0, 'no leader should be in deck/sideboard')
    })

    it('never places a base card in deck or sideboard sections', () => {
      const result = buildPool({
        resolvedRows: buildHappyPathRows(),
        activeLeaderId: 'l1',
        activeBaseId: 'b1',
        setCode: 'LAW',
        poolName: 'Test Pool',
      })

      const baseInDeckOrSideboard = Object.values(result.deckBuilderState.cardPositions)
        .filter(p => (p.section === 'deck' || p.section === 'sideboard') && p.card.isBase)
      assert.equal(baseInDeckOrSideboard.length, 0, 'no base should be in deck/sideboard')
    })
  })

  describe('validation', () => {
    it('flags pool size mismatch when total != 96', () => {
      const rows = buildHappyPathRows()
      rows[12].poolQty = 50 // total becomes 6+6+50 = 62, not 96
      const result = buildPool({
        resolvedRows: rows,
        activeLeaderId: 'l1',
        activeBaseId: 'b1',
        setCode: 'LAW',
        poolName: 'Test Pool',
      })

      assert.ok(result.validationErrors.some(e => e.code === 'POOL_SIZE'))
      const sizeErr = result.validationErrors.find(e => e.code === 'POOL_SIZE')
      assert.equal(sizeErr.expected, 96)
      assert.equal(sizeErr.got, 62)
    })

    it('flags deckQty > poolQty', () => {
      const rows = buildHappyPathRows()
      rows[12].deckQty = 90 // poolQty=84, deckQty=90 — invalid
      const result = buildPool({
        resolvedRows: rows,
        activeLeaderId: 'l1',
        activeBaseId: 'b1',
        setCode: 'LAW',
        poolName: 'Test Pool',
      })

      assert.ok(result.validationErrors.some(e => e.code === 'INVALID_QTY'))
    })

    it('flags missing active leader (cardId not in resolved rows)', () => {
      const result = buildPool({
        resolvedRows: buildHappyPathRows(),
        activeLeaderId: 'nonexistent',
        activeBaseId: 'b1',
        setCode: 'LAW',
        poolName: 'Test Pool',
      })

      assert.ok(result.validationErrors.some(e => e.code === 'INVALID_LEADER'))
    })

    it('flags missing active base', () => {
      const result = buildPool({
        resolvedRows: buildHappyPathRows(),
        activeLeaderId: 'l1',
        activeBaseId: 'nonexistent',
        setCode: 'LAW',
        poolName: 'Test Pool',
      })

      assert.ok(result.validationErrors.some(e => e.code === 'INVALID_BASE'))
    })

    it('flags activeLeader pointing to a non-leader card', () => {
      const result = buildPool({
        resolvedRows: buildHappyPathRows(),
        activeLeaderId: 'u1', // Sabacc Dealer is not a leader
        activeBaseId: 'b1',
        setCode: 'LAW',
        poolName: 'Test Pool',
      })

      assert.ok(result.validationErrors.some(e => e.code === 'INVALID_LEADER'))
    })

    it('flags activeBase pointing to a non-base card', () => {
      const result = buildPool({
        resolvedRows: buildHappyPathRows(),
        activeLeaderId: 'l1',
        activeBaseId: 'u1', // Sabacc Dealer is not a base
        setCode: 'LAW',
        poolName: 'Test Pool',
      })

      assert.ok(result.validationErrors.some(e => e.code === 'INVALID_BASE'))
    })
  })

  describe('flat cards array', () => {
    it('contains one entry per copy (expanded by poolQty)', () => {
      const result = buildPool({
        resolvedRows: buildHappyPathRows(),
        activeLeaderId: 'l1',
        activeBaseId: 'b1',
        setCode: 'LAW',
        poolName: 'Test Pool',
      })

      const u1Count = result.cards.filter(c => c.id === 'u1').length
      assert.equal(u1Count, 84)
      const leaderCount = result.cards.filter(c => c.isLeader).length
      assert.equal(leaderCount, 6)
      const baseCount = result.cards.filter(c => c.isBase).length
      assert.equal(baseCount, 6)
    })
  })
})
