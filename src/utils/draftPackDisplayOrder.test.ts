// @ts-nocheck

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getDraftPackDisplayOrder, shouldPreserveDraftPackSlotOrder } from './draftPackDisplayOrder'

describe('draft pack display order', () => {
  it('preserves ASH slot order so the foil slot stays before uncommons', () => {
    const pack = [
      { id: 'common-1', rarity: 'Common' },
      { id: 'foil', rarity: 'Special', isFoil: true },
      { id: 'uncommon-1', rarity: 'Uncommon' },
      { id: 'rare-1', rarity: 'Rare' },
    ]

    const ordered = getDraftPackDisplayOrder(pack, 'ASH')

    assert.strictEqual(ordered, pack, 'ASH should keep the stored pack order')
    assert.deepStrictEqual(ordered.map(c => c.id), ['common-1', 'foil', 'uncommon-1', 'rare-1'])
  })

  it('repairs legacy ASH foil-last order by putting the foil before non-common slots', () => {
    const pack = [
      { id: 'common-1', rarity: 'Common' },
      { id: 'common-2', rarity: 'Common' },
      { id: 'uncommon-1', rarity: 'Uncommon' },
      { id: 'rare-1', rarity: 'Rare' },
      { id: 'foil', rarity: 'Special', isFoil: true },
    ]

    const ordered = getDraftPackDisplayOrder(pack, 'ASH')

    assert.deepStrictEqual(ordered.map(c => c.id), ['common-1', 'common-2', 'foil', 'uncommon-1', 'rare-1'])
  })

  it('continues to sort non-ASH packs by rarity with foils last', () => {
    const pack = [
      { id: 'foil', rarity: 'Common', isFoil: true },
      { id: 'rare-1', rarity: 'Rare' },
      { id: 'common-1', rarity: 'Common' },
      { id: 'uncommon-1', rarity: 'Uncommon' },
    ]

    const ordered = getDraftPackDisplayOrder(pack, 'SOR')

    assert.notStrictEqual(ordered, pack, 'non-ASH display sort should return a sorted copy')
    assert.deepStrictEqual(ordered.map(c => c.id), ['common-1', 'uncommon-1', 'rare-1', 'foil'])
  })

  it('treats ASH carbonite set suffixes as ASH for display order', () => {
    assert.strictEqual(shouldPreserveDraftPackSlotOrder('ASH-CB'), true)
  })
})
