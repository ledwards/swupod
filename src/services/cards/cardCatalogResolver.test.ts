// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  collectPlaceholderCards,
  containsPlaceholderCards,
  resolveCatalogCards,
  resolveStoredCard,
} from './cardCatalogResolver'

const bucketId = 'ash-slot:normal:main:rare:vigilance'

const placeholder = {
  id: `${bucketId}:004`,
  cardId: null,
  number: null,
  name: 'Unknown ASH Rare Vigilance Slot 4',
  set: 'ASH',
  rarity: 'Rare',
  type: 'Unknown',
  aspects: ['Vigilance'],
  variantType: 'Normal',
  isPlaceholder: true,
  placeholderKind: 'bucket-slot',
  placeholderGroup: 'main',
  placeholderBucketId: bucketId,
  placeholderBucketLabel: 'Rare Vigilance',
  placeholderSlotIndex: 4,
}

const currentPlaceholder = {
  ...placeholder,
  id: `${bucketId}:001`,
  name: 'Unknown ASH Rare Vigilance Slot 1',
  placeholderSlotIndex: 1,
}
const currentPlaceholder2 = {
  ...placeholder,
  id: `${bucketId}:002`,
  name: 'Unknown ASH Rare Vigilance Slot 2',
  placeholderSlotIndex: 2,
}
const currentPlaceholder3 = {
  ...placeholder,
  id: `${bucketId}:003`,
  name: 'Unknown ASH Rare Vigilance Slot 3',
  placeholderSlotIndex: 3,
}

const real = {
  id: 'swuapi-real-uuid',
  cardId: 'ASH-042',
  number: '42',
  name: 'Spoiled Card',
  set: 'ASH',
  rarity: 'Rare',
  type: 'Unit',
  aspects: ['Vigilance'],
  variantType: 'Normal',
  imageUrl: 'https://example.test/card.png',
  isPlaceholder: false,
  spoilerStatus: 'spoiled',
}

describe('card catalog resolver', () => {
  it('hydrates a stored placeholder object from the current catalog by stable ID', () => {
    const lookup = new Map([[real.id, real]])
    const resolved = resolveStoredCard({
      ...real,
      name: 'Old Spoiled Name',
      instanceId: 'draft-instance-1',
      pickNumber: 7,
    }, lookup)

    assert.equal(resolved.name, 'Spoiled Card')
    assert.equal(resolved.imageUrl, 'https://example.test/card.png')
    assert.equal(resolved.isPlaceholder, false)
    assert.equal(resolved.instanceId, 'draft-instance-1')
    assert.equal(resolved.pickNumber, 7)
  })

  it('resolves disappeared bucket placeholder slots to real cards from the same bucket', () => {
    const lookup = new Map([
      [currentPlaceholder.id, currentPlaceholder],
      [currentPlaceholder2.id, currentPlaceholder2],
      [currentPlaceholder3.id, currentPlaceholder3],
      [real.id, real],
    ])
    const resolved = resolveStoredCard({
      ...placeholder,
      instanceId: 'draft-instance-1',
    }, lookup)

    assert.equal(resolved.name, 'Spoiled Card')
    assert.equal(resolved.isPlaceholder, false)
    assert.equal(resolved.instanceId, 'draft-instance-1')
  })

  it('keeps bucket placeholders unresolved when their slot still exists', () => {
    const lookup = new Map([
      [currentPlaceholder.id, currentPlaceholder],
      [real.id, real],
    ])
    const resolved = resolveStoredCard({
      ...placeholder,
      id: currentPlaceholder.id,
      placeholderSlotIndex: 1,
    }, lookup)

    assert.equal(resolved.name, 'Unknown ASH Rare Vigilance Slot 1')
    assert.equal(resolved.isPlaceholder, true)
  })

  it('preserves synthesized pack treatment flags while hydrating card data', () => {
    const lookup = new Map([[real.id, real]])
    const resolved = resolveStoredCard({
      ...real,
      variantType: 'Hyperspace Foil',
      isFoil: true,
      isHyperspace: true,
    }, lookup)

    assert.equal(resolved.name, 'Spoiled Card')
    assert.equal(resolved.variantType, 'Hyperspace Foil')
    assert.equal(resolved.isFoil, true)
    assert.equal(resolved.isHyperspace, true)
  })

  it('recursively resolves cards in saved pool and deck-builder shapes', () => {
    const lookup = new Map([[real.id, real]])
    const resolved = resolveCatalogCards({
      cards: [real],
      packs: [{ cards: [real] }],
      deckBuilderState: {
        cardPositions: {
          one: { card: real, section: 'deck', visible: true },
        },
      },
    }, lookup)

    assert.equal(resolved.cards[0].name, 'Spoiled Card')
    assert.equal(resolved.packs[0].cards[0].name, 'Spoiled Card')
    assert.equal(resolved.deckBuilderState.cardPositions.one.card.name, 'Spoiled Card')
  })

  it('detects placeholder cards before external exports', () => {
    const lookup = new Map([[currentPlaceholder.id, currentPlaceholder]])
    const state = { cardPositions: { one: { card: currentPlaceholder, section: 'deck', visible: true } } }

    assert.equal(containsPlaceholderCards(state, lookup), true)
    assert.equal(collectPlaceholderCards(state, lookup).length, 1)
  })
})
