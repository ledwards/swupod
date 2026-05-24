// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getAllCards } from '../../utils/cardData'
import {
  ASH_EXPECTED_NORMAL_SLOTS,
  ASH_MAIN_DECK_MULTICOLOR_SLOTS,
  getAshAspectKey,
  getAshBucketId,
  getAshVariantBucketTargets,
  mergeAshPlaceholderCatalog,
} from './ashPlaceholderCatalog'

function ashOnly(cards) {
  return cards.filter(card => card.set === 'ASH')
}

function count(cards, predicate) {
  return cards.filter(predicate).length
}

describe('ASH bucket placeholder catalog', () => {
  it('generates bucket placeholders without collector numbers', () => {
    const { cards, metadata } = mergeAshPlaceholderCatalog([])
    const ashCards = ashOnly(cards)

    assert.equal(metadata.status, 'valid')
    assert.equal(count(ashCards, card => card.variantType === 'Normal'), ASH_EXPECTED_NORMAL_SLOTS)
    assert.equal(count(ashCards, card => card.variantType === 'Hyperspace'), ASH_EXPECTED_NORMAL_SLOTS)
    assert.equal(count(ashCards, card => card.variantType === 'Hyperspace Foil'), 238)
    assert.equal(metadata.placeholderCardCount, ASH_EXPECTED_NORMAL_SLOTS * 2 + 238)

    const sample = ashCards.find(card => card.rarity === 'Rare' && getAshAspectKey(card.aspects) === 'Vigilance')
    assert(sample, 'expected a rare vigilance placeholder')
    assert.equal(sample.number, null)
    assert.equal(sample.cardId, null)
    assert.match(sample.id, /^ash-slot:/)
    assert.match(sample.name, /^Unknown ASH Rare Vigilance Slot /)
  })

  it('codifies the v0 SEC-shaped, LAW-symmetric multicolor table', () => {
    const normalTargets = getAshVariantBucketTargets().filter(target => target.variantType === 'Normal')
    const mainTargets = normalTargets.filter(target => target.group === 'main')
    const leaders = normalTargets.filter(target => target.group === 'leader')
    const bases = normalTargets.filter(target => target.group === 'base')

    assert.equal(mainTargets.reduce((sum, target) => sum + target.count, 0), 238)
    assert.equal(leaders.reduce((sum, target) => sum + target.count, 0), 18)
    assert.equal(bases.reduce((sum, target) => sum + target.count, 0), 8)

    const rarityTotals = Object.fromEntries(['Common', 'Uncommon', 'Rare', 'Legendary', 'Special'].map(rarity => [
      rarity,
      normalTargets
        .filter(target => target.rarity === rarity)
        .reduce((sum, target) => sum + target.count, 0),
    ]))
    assert.deepEqual(rarityTotals, {
      Common: 116,
      Uncommon: 60,
      Rare: 58,
      Legendary: 20,
      Special: 10,
    })

    const primaryPrimaryMain = mainTargets
      .filter(target => {
        const aspects = target.aspects || []
        return aspects.length >= 2 &&
          ['Vigilance', 'Command', 'Aggression', 'Cunning'].filter(aspect => aspects.includes(aspect)).length >= 2
      })
      .reduce((sum, target) => sum + target.count, 0)
    assert.equal(primaryPrimaryMain, ASH_MAIN_DECK_MULTICOLOR_SLOTS)

    const primaryPrimaryLeaders = leaders
      .filter(target => {
        const aspects = target.aspects || []
        return ['Vigilance', 'Command', 'Aggression', 'Cunning'].filter(aspect => aspects.includes(aspect)).length >= 2
      })
      .reduce((sum, target) => sum + target.count, 0)
    assert.equal(primaryPrimaryLeaders, 2)
  })

  it('real spoiled cards occupy their matching bucket and reduce placeholders', () => {
    const realAsh = {
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
    }

    const { cards, metadata } = mergeAshPlaceholderCatalog([realAsh])
    const bucketId = getAshBucketId({
      group: 'main',
      rarity: 'Rare',
      aspects: ['Vigilance'],
      variantType: 'Normal',
    })
    const placeholders = ashOnly(cards).filter(card => card.placeholderBucketId === bucketId)

    assert.equal(metadata.realCardCount, 1)
    assert.equal(metadata.spoiledNormalCount, 1)
    assert.equal(placeholders.length, 3)
    assert.equal(cards.find(card => card.id === 'swuapi-real-uuid')?.isPlaceholder, false)
  })

  it('surfaces contradictions when a bucket is overfull', () => {
    const overfull = Array.from({ length: 5 }, (_, index) => ({
      id: `real-${index}`,
      cardId: `ASH-${100 + index}`,
      number: String(100 + index),
      name: `Real ${index}`,
      set: 'ASH',
      rarity: 'Rare',
      type: 'Unit',
      aspects: ['Vigilance'],
      variantType: 'Normal',
    }))

    const { metadata } = mergeAshPlaceholderCatalog(overfull)
    assert.equal(metadata.status, 'invalid')
    assert(metadata.contradictions.some(item => item.realCount === 5 && item.targetCount === 4))
  })

  it('is idempotent against the current generated card catalog', () => {
    const once = mergeAshPlaceholderCatalog(getAllCards())
    const twice = mergeAshPlaceholderCatalog(once.cards)
    const onceAshIds = ashOnly(once.cards).map(card => card.id).sort()
    const twiceAshIds = ashOnly(twice.cards).map(card => card.id).sort()

    assert.deepEqual(twiceAshIds, onceAshIds)
    assert.equal(twice.metadata.status, once.metadata.status)
  })
})
