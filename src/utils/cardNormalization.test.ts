// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { buildCardLookupMaps, normalizeCardId } from './cardNormalization'

describe('buildCardLookupMaps — cardId collisions with Hyperspace variants', () => {
  // SPEC: In SWU, leader/base cardIds collide with Hyperspace variants of other cards.
  // For example SOR-007 = Grand Moff Tarkin (Leader, Normal) AND Admiral Motti (Unit, Hyperspace).
  // Looking up "SOR_007" in cardMap MUST return the Leader (Normal variant), not the
  // Hyperspace non-Leader. Otherwise stats, archetypes, and Wayfinder exports show
  // a Unit where a Leader belongs.

  it('FIXED: normalized cardId resolves to Leader, not Hyperspace Unit, when both exist', () => {
    const cards = [
      { id: 'uuid-leader', cardId: 'SOR-007', name: 'Grand Moff Tarkin', type: 'Leader', subtitle: 'Oversector Governor', variantType: 'Normal' },
      // Hyperspace variant listed AFTER the leader — last-writer-wins would break the lookup
      { id: 'uuid-unit', cardId: 'SOR-007', name: 'Admiral Motti', type: 'Unit', subtitle: null, variantType: 'Hyperspace' },
    ]

    const { cardMap } = buildCardLookupMaps(cards)

    const resolved = cardMap.get('SOR_007')
    assert.strictEqual(resolved?.name, 'Grand Moff Tarkin', 'Normal Leader must win normalized cardId lookup')
    assert.strictEqual(resolved?.type, 'Leader')
  })

  it('FIXED: raw cardId resolves to Leader even when Hyperspace variant shares cardId', () => {
    const cards = [
      { id: 'uuid-leader', cardId: 'TWI-004', name: 'Yoda', type: 'Leader', subtitle: null, variantType: 'Normal' },
      { id: 'uuid-unit', cardId: 'TWI-004', name: '332nd Stalwart', type: 'Unit', subtitle: null, variantType: 'Hyperspace' },
    ]

    const { cardMap } = buildCardLookupMaps(cards)

    assert.strictEqual(cardMap.get('TWI-004')?.name, 'Yoda')
    assert.strictEqual(cardMap.get('TWI_004')?.name, 'Yoda')
  })

  it('UUID lookup still returns exact variant (Hyperspace variant by its id)', () => {
    const cards = [
      { id: 'uuid-leader', cardId: 'SOR-007', name: 'Grand Moff Tarkin', type: 'Leader', subtitle: null, variantType: 'Normal' },
      { id: 'uuid-unit', cardId: 'SOR-007', name: 'Admiral Motti', type: 'Unit', subtitle: null, variantType: 'Hyperspace' },
    ]

    const { cardMap } = buildCardLookupMaps(cards)

    // UUID lookup must still resolve to the specific variant, unchanged
    assert.strictEqual(cardMap.get('uuid-unit')?.name, 'Admiral Motti')
    assert.strictEqual(cardMap.get('uuid-leader')?.name, 'Grand Moff Tarkin')
  })

  it('Two Hyperspace variants sharing a cardId: first wins (no Normal available to promote)', () => {
    const cards = [
      { id: 'uuid-1', cardId: 'ABC-001', name: 'First', type: 'Unit', subtitle: null, variantType: 'Hyperspace' },
      { id: 'uuid-2', cardId: 'ABC-001', name: 'Second', type: 'Unit', subtitle: null, variantType: 'Hyperspace' },
    ]

    const { cardMap } = buildCardLookupMaps(cards)

    // When no Normal is available, we keep the first entry rather than thrashing
    assert.strictEqual(cardMap.get('ABC_001')?.name, 'First')
  })
})
