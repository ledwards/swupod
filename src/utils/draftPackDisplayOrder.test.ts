// @ts-nocheck

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getDraftPackDisplayOrder, shouldPreserveDraftPackSlotOrder } from './draftPackDisplayOrder'
import { getAllSetCodes } from './setConfigs/index'

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

  it('keeps the foil last for every non-ASH set', () => {
    const pack = [
      { id: 'foil', rarity: 'Common', isFoil: true },
      { id: 'rare-1', rarity: 'Rare' },
      { id: 'common-1', rarity: 'Common' },
      { id: 'uncommon-1', rarity: 'Uncommon' },
    ]

    const nonAshSetCodes = getAllSetCodes().filter(setCode => setCode !== 'ASH')

    for (const setCode of nonAshSetCodes) {
      for (const displaySetCode of [setCode, `${setCode}-CB`]) {
        const ordered = getDraftPackDisplayOrder(pack, displaySetCode)

        assert.notStrictEqual(ordered, pack, `${displaySetCode} display sort should return a sorted copy`)
        assert.strictEqual(
          ordered[ordered.length - 1].id,
          'foil',
          `${displaySetCode} should keep foil as the last visible card`
        )
        assert.deepStrictEqual(
          ordered.map(c => c.id),
          ['common-1', 'uncommon-1', 'rare-1', 'foil'],
          `${displaySetCode} should retain the standard rarity sort`
        )
      }
    }
  })

  it('treats ASH carbonite set suffixes as ASH for display order', () => {
    assert.strictEqual(shouldPreserveDraftPackSlotOrder('ASH-CB'), true)
  })
})
