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

  it('resolves Hyperspace placeholder leaders to Normal real cards when HS variants are not yet published', () => {
    // Pre-release case: ASH ships fully Normal-spoiled but HS leader variants
    // are still missing from the catalog. Old pools stored Hyperspace leader
    // placeholders; the resolver must hydrate them via the Normal bucket while
    // preserving the Hyperspace treatment flags so the slot still renders HS.
    const hyperspaceBucketId = 'ash-slot:hyperspace:leader:common:command-heroism'
    const hyperspaceLeaderPlaceholder = {
      id: `${hyperspaceBucketId}:001`,
      cardId: null,
      number: null,
      name: 'Unknown ASH Hyperspace Common Leader Command+Heroism Slot 1',
      set: 'ASH',
      rarity: 'Common',
      type: 'Leader',
      aspects: ['Command', 'Heroism'],
      variantType: 'Hyperspace',
      isLeader: true,
      isHyperspace: true,
      isFoil: false,
      isPlaceholder: true,
      placeholderKind: 'bucket-slot',
      placeholderGroup: 'leader',
      placeholderBucketId: hyperspaceBucketId,
      placeholderBucketLabel: 'Common Leader Command+Heroism',
      placeholderSlotIndex: 1,
    }
    const normalRealLeader = {
      id: 'ahsoka-uuid',
      cardId: 'ASH-001',
      number: '1',
      name: 'Ahsoka Tano',
      set: 'ASH',
      rarity: 'Common',
      type: 'Leader',
      aspects: ['Command', 'Heroism'],
      variantType: 'Normal',
      imageUrl: 'https://example.test/ahsoka.png',
      isLeader: true,
      isPlaceholder: false,
      spoilerStatus: 'spoiled',
    }
    const lookup = new Map([[normalRealLeader.id, normalRealLeader]])

    const resolved = resolveStoredCard(hyperspaceLeaderPlaceholder, lookup)

    assert.equal(resolved.name, 'Ahsoka Tano')
    assert.equal(resolved.isPlaceholder, false)
    assert.equal(resolved.imageUrl, 'https://example.test/ahsoka.png')
    // Hyperspace slot semantics preserved from the stored placeholder
    assert.equal(resolved.variantType, 'Hyperspace')
    assert.equal(resolved.isHyperspace, true)
  })

  it('resolves Hyperspace Foil placeholders to Normal real cards and preserves foil treatment', () => {
    const hsfBucketId = 'ash-slot:hyperspace-foil:main:rare:vigilance'
    const hsfPlaceholder = {
      id: `${hsfBucketId}:001`,
      cardId: null,
      number: null,
      name: 'Unknown ASH Hyperspace Foil Rare Vigilance Slot 1',
      set: 'ASH',
      rarity: 'Rare',
      type: 'Unknown',
      aspects: ['Vigilance'],
      variantType: 'Hyperspace Foil',
      isHyperspace: true,
      isFoil: true,
      isPlaceholder: true,
      placeholderKind: 'bucket-slot',
      placeholderGroup: 'main',
      placeholderBucketId: hsfBucketId,
      placeholderBucketLabel: 'Rare Vigilance',
      placeholderSlotIndex: 1,
    }
    const lookup = new Map([[real.id, real]])

    const resolved = resolveStoredCard(hsfPlaceholder, lookup)

    assert.equal(resolved.name, 'Spoiled Card')
    assert.equal(resolved.isPlaceholder, false)
    assert.equal(resolved.variantType, 'Hyperspace Foil')
    assert.equal(resolved.isHyperspace, true)
    assert.equal(resolved.isFoil, true)
  })

  it('keeps Hyperspace placeholders unresolved when no Normal-variant card exists in the same bucket either', () => {
    // Placeholder catalog over-predicted a Rare Vigilance+Heroism leader, but
    // no such real card exists. Without a Normal-bucket match either, the
    // resolver must leave the placeholder in place rather than substitute the
    // wrong card.
    const phantomBucketId = 'ash-slot:hyperspace:leader:rare:vigilance-heroism'
    const phantomPlaceholder = {
      id: `${phantomBucketId}:001`,
      cardId: null,
      number: null,
      name: 'Unknown ASH Hyperspace Rare Leader Vigilance+Heroism Slot 1',
      set: 'ASH',
      rarity: 'Rare',
      type: 'Leader',
      aspects: ['Vigilance', 'Heroism'],
      variantType: 'Hyperspace',
      isLeader: true,
      isHyperspace: true,
      isPlaceholder: true,
      placeholderKind: 'bucket-slot',
      placeholderGroup: 'leader',
      placeholderBucketId: phantomBucketId,
      placeholderBucketLabel: 'Rare Leader Vigilance+Heroism',
      placeholderSlotIndex: 1,
    }
    // Only Common Vigilance+Heroism real leader exists — not Rare.
    const commonVHLeader = {
      ...real,
      id: 'sabine-uuid',
      name: 'Sabine Wren',
      rarity: 'Common',
      type: 'Leader',
      aspects: ['Vigilance', 'Heroism'],
      isLeader: true,
    }
    const lookup = new Map([[commonVHLeader.id, commonVHLeader]])

    const resolved = resolveStoredCard(phantomPlaceholder, lookup)

    assert.equal(resolved.isPlaceholder, true)
    assert.equal(resolved.name, 'Unknown ASH Hyperspace Rare Leader Vigilance+Heroism Slot 1')
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
