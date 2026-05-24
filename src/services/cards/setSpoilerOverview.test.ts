// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mergeAshPlaceholderCatalog } from './ashPlaceholderCatalog'
import { buildSetSpoilerOverview } from './setSpoilerOverview'

describe('set spoiler overview', () => {
  it('summarizes ASH normal-slot progress from bucket placeholders', () => {
    const { cards, metadata } = mergeAshPlaceholderCatalog([])
    const overview = buildSetSpoilerOverview('ASH', cards, {
      sets: [{ code: 'ASH', name: 'Ashes of the Empire' }],
      ashPlaceholderCatalog: metadata,
    })

    assert.equal(overview.setName, 'Ashes of the Empire')
    assert.equal(overview.totals.normalTargetCount, 264)
    assert.equal(overview.totals.normalRealCount, 0)
    assert.equal(overview.totals.normalPlaceholderCount, 264)
    assert.equal(overview.metadata.placeholderStatus, 'valid')

    const normalRarityRows = overview.rollupsByVariant.Normal.byRarity
    assert.deepEqual(Object.fromEntries(normalRarityRows.map(row => [row.key, row.targetCount])), {
      Common: 116,
      Uncommon: 60,
      Rare: 58,
      Legendary: 20,
      Special: 10,
    })
  })

  it('keeps the two known primary-primary leader buckets visible', () => {
    const { cards, metadata } = mergeAshPlaceholderCatalog([])
    const overview = buildSetSpoilerOverview('ASH', cards, { ashPlaceholderCatalog: metadata })

    const primaryPrimaryLeaders = overview.buckets.filter(bucket =>
      bucket.variantType === 'Normal' &&
      bucket.group === 'leader' &&
      bucket.rarity === 'Rare' &&
      ['Command+Aggression', 'Vigilance+Cunning'].includes(bucket.aspectKey)
    )

    assert.equal(primaryPrimaryLeaders.length, 2)
    assert.equal(primaryPrimaryLeaders.reduce((sum, bucket) => sum + bucket.targetCount, 0), 2)
    assert.equal(primaryPrimaryLeaders.reduce((sum, bucket) => sum + bucket.placeholderCount, 0), 2)
  })

  it('counts spoiled real cards inside their bucket', () => {
    const { cards, metadata } = mergeAshPlaceholderCatalog([{
      id: 'real-ash-card',
      cardId: 'ASH-042',
      number: '42',
      name: 'Spoiled Rare',
      set: 'ASH',
      rarity: 'Rare',
      type: 'Unit',
      aspects: ['Vigilance'],
      variantType: 'Normal',
    }])
    const overview = buildSetSpoilerOverview('ASH', cards, { ashPlaceholderCatalog: metadata })
    const bucket = overview.buckets.find(bucket =>
      bucket.variantType === 'Normal' &&
      bucket.group === 'main' &&
      bucket.rarity === 'Rare' &&
      bucket.aspectKey === 'Vigilance'
    )

    assert(bucket)
    assert.equal(bucket.targetCount, 4)
    assert.equal(bucket.realCount, 1)
    assert.equal(bucket.placeholderCount, 3)
    assert.equal(overview.totals.normalRealCount, 1)
  })

  it('summarizes a non-placeholder set without ASH assumptions', () => {
    const overview = buildSetSpoilerOverview('SOR', [{
      id: 'sor-1',
      cardId: 'SOR-001',
      number: '001',
      name: 'Leader One',
      set: 'SOR',
      rarity: 'Common',
      type: 'Leader',
      aspects: ['Command', 'Heroism'],
      variantType: 'Normal',
      isLeader: true,
    }, {
      id: 'sor-2',
      cardId: 'SOR-002',
      number: '002',
      name: 'Unit One',
      set: 'SOR',
      rarity: 'Rare',
      type: 'Unit',
      aspects: ['Vigilance'],
      variantType: 'Normal',
    }], {})

    assert.equal(overview.totals.realCount, 2)
    assert.equal(overview.totals.placeholderCount, 0)
    assert.equal(overview.variantSummaries[0].targetCount, 2)
    assert.equal(overview.buckets.length, 2)
  })
})
