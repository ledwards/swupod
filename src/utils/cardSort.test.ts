// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  getCardTypeOrder,
  getTypeStringOrder,
  sortGroupKeys,
  createGetGroupKey,
  createDefaultSortFn,
  createGroupCardSortFn,
} from './cardSort'

describe('cardSort', () => {
  describe('getCardTypeOrder', () => {
    it('returns 1 for Ground Unit', () => {
      const card = { type: 'Unit', arenas: ['Ground'] }
      assert.strictEqual(getCardTypeOrder(card), 1)
    })

    it('returns 2 for Space Unit', () => {
      const card = { type: 'Unit', arenas: ['Space'] }
      assert.strictEqual(getCardTypeOrder(card), 2)
    })

    it('returns 1 for Unit with no arenas', () => {
      const card = { type: 'Unit' }
      assert.strictEqual(getCardTypeOrder(card), 1)
    })

    it('returns 3 for Upgrade', () => {
      const card = { type: 'Upgrade' }
      assert.strictEqual(getCardTypeOrder(card), 3)
    })

    it('returns 4 for Event', () => {
      const card = { type: 'Event' }
      assert.strictEqual(getCardTypeOrder(card), 4)
    })

    it('returns 99 for unknown type', () => {
      const card = { type: 'Leader' }
      assert.strictEqual(getCardTypeOrder(card), 99)
    })
  })

  describe('getTypeStringOrder', () => {
    it('returns 1 for Unit', () => {
      assert.strictEqual(getTypeStringOrder('Unit'), 1)
    })

    it('returns 1 for Ground Unit', () => {
      assert.strictEqual(getTypeStringOrder('Ground Unit'), 1)
    })

    it('returns 2 for Space Unit', () => {
      assert.strictEqual(getTypeStringOrder('Space Unit'), 2)
    })

    it('returns 3 for Upgrade', () => {
      assert.strictEqual(getTypeStringOrder('Upgrade'), 3)
    })

    it('returns 4 for Event', () => {
      assert.strictEqual(getTypeStringOrder('Event'), 4)
    })

    it('returns 99 for unknown type', () => {
      assert.strictEqual(getTypeStringOrder('Base'), 99)
    })
  })

  describe('sortGroupKeys', () => {
    describe('cost sorting', () => {
      it('sorts numeric costs in ascending order', () => {
        const keys = ['3', '1', '5', '2']
        const sorted = sortGroupKeys(keys, 'cost')
        assert.deepStrictEqual(sorted, ['1', '2', '3', '5'])
      })

      it('sorts 8+ at the end', () => {
        const keys = ['8+', '1', '5']
        const sorted = sortGroupKeys(keys, 'cost')
        assert.deepStrictEqual(sorted, ['1', '5', '8+'])
      })

      it('handles custom cost threshold', () => {
        const keys = ['10+', '1', '5']
        const sorted = sortGroupKeys(keys, 'cost', '10+')
        assert.deepStrictEqual(sorted, ['1', '5', '10+'])
      })
    })

    describe('type sorting', () => {
      it('sorts types in predefined order', () => {
        const keys = ['Events', 'Ground Units', 'Upgrades', 'Space Units']
        const sorted = sortGroupKeys(keys, 'type')
        assert.deepStrictEqual(sorted, ['Ground Units', 'Space Units', 'Upgrades', 'Events'])
      })

      it('puts Other at the end', () => {
        const keys = ['Other', 'Ground Units', 'Events']
        const sorted = sortGroupKeys(keys, 'type')
        assert.deepStrictEqual(sorted, ['Ground Units', 'Events', 'Other'])
      })
    })

    describe('aspect sorting', () => {
      it('sorts primary aspects before secondary', () => {
        const keys = ['Villainy', 'Vigilance', 'Command']
        const sorted = sortGroupKeys(keys, 'aspect')
        assert.strictEqual(sorted.indexOf('Vigilance') < sorted.indexOf('Villainy'), true)
      })

      it('sorts Neutral last', () => {
        const keys = ['ZZZ_Neutral', 'Vigilance']
        const sorted = sortGroupKeys(keys, 'aspect')
        assert.strictEqual(sorted[sorted.length - 1], 'ZZZ_Neutral')
      })
    })
  })

  describe('createGetGroupKey', () => {
    describe('cost grouping', () => {
      it('returns cost as string for normal costs', () => {
        const getGroupKey = createGetGroupKey('cost')
        const card = { cost: 3 }
        assert.strictEqual(getGroupKey(card), '3')
      })

      it('returns 8+ for costs >= 8', () => {
        const getGroupKey = createGetGroupKey('cost')
        assert.strictEqual(getGroupKey({ cost: 8 }), '8+')
        assert.strictEqual(getGroupKey({ cost: 10 }), '8+')
      })

      it('handles null cost', () => {
        const getGroupKey = createGetGroupKey('cost')
        const card = { cost: null }
        assert.strictEqual(getGroupKey(card), '8+')
      })

      it('includes aspect penalty when enabled', () => {
        const mockCalculatePenalty = () => 2
        const getGroupKey = createGetGroupKey('cost', {
          showAspectPenalties: true,
          leaderCard: { name: 'Leader' },
          baseCard: { name: 'Base' },
          calculateAspectPenalty: mockCalculatePenalty
        })
        const card = { cost: 3 }
        assert.strictEqual(getGroupKey(card), '5')
      })
    })

    describe('type grouping', () => {
      it('returns Ground Units for ground units', () => {
        const getGroupKey = createGetGroupKey('type')
        const card = { type: 'Unit', arenas: ['Ground'] }
        assert.strictEqual(getGroupKey(card), 'Ground Units')
      })

      it('returns Space Units for space units', () => {
        const getGroupKey = createGetGroupKey('type')
        const card = { type: 'Unit', arenas: ['Space'] }
        assert.strictEqual(getGroupKey(card), 'Space Units')
      })

      it('returns Units for unit without arenas', () => {
        const getGroupKey = createGetGroupKey('type')
        const card = { type: 'Unit' }
        assert.strictEqual(getGroupKey(card), 'Units')
      })

      it('returns Upgrades for upgrades', () => {
        const getGroupKey = createGetGroupKey('type')
        const card = { type: 'Upgrade' }
        assert.strictEqual(getGroupKey(card), 'Upgrades')
      })

      it('returns Events for events', () => {
        const getGroupKey = createGetGroupKey('type')
        const card = { type: 'Event' }
        assert.strictEqual(getGroupKey(card), 'Events')
      })

      it('returns Other for unknown types', () => {
        const getGroupKey = createGetGroupKey('type')
        const card = { type: 'Base' }
        assert.strictEqual(getGroupKey(card), 'Other')
      })
    })

    describe('aspect grouping', () => {
      it('uses getAspectKey function', () => {
        const mockGetAspectKey = (card: { aspects?: string[] }) => card.aspects?.join('_') || 'Neutral'
        const getGroupKey = createGetGroupKey('aspect', { getAspectKey: mockGetAspectKey })
        const card = { aspects: ['Vigilance', 'Villainy'] }
        assert.strictEqual(getGroupKey(card), 'Vigilance_Villainy')
      })
    })
  })

  describe('createDefaultSortFn', () => {
    // Mock returns A_, B_, C_ prefixes to simulate actual aspect sort key behavior
    const mockGetAspectSortKey = (card: { aspects?: string[] }) => {
      const aspect = card.aspects?.[0]
      const priorities: Record<string, string> = { 'Vigilance': 'A', 'Command': 'B', 'Aggression': 'C', 'Cunning': 'D' }
      return priorities[aspect!] ? `${priorities[aspect!]}_${aspect}` : 'ZZZ_Neutral'
    }

    it('sorts by aspect first', () => {
      const sortFn = createDefaultSortFn(mockGetAspectSortKey)
      const a = { position: { card: { aspects: ['Vigilance'], cost: 5, type: 'Event', name: 'Z' } } }
      const b = { position: { card: { aspects: ['Command'], cost: 1, type: 'Unit', name: 'A' } } }
      // A_Vigilance < B_Command alphabetically
      assert.strictEqual(sortFn(a, b) < 0, true)
    })

    it('sorts by cost within same aspect', () => {
      const sortFn = createDefaultSortFn(mockGetAspectSortKey)
      const a = { position: { card: { aspects: ['Vigilance'], cost: 1, type: 'Event', name: 'Z' } } }
      const b = { position: { card: { aspects: ['Vigilance'], cost: 5, type: 'Unit', name: 'A' } } }
      assert.strictEqual(sortFn(a, b) < 0, true)
    })

    it('sorts by type within same aspect and cost', () => {
      const sortFn = createDefaultSortFn(mockGetAspectSortKey)
      const a = { position: { card: { aspects: ['Vigilance'], cost: 3, type: 'Unit', arenas: ['Ground'], name: 'Z' } } }
      const b = { position: { card: { aspects: ['Vigilance'], cost: 3, type: 'Event', name: 'A' } } }
      assert.strictEqual(sortFn(a, b) < 0, true)
    })

    it('sorts by name as final tiebreaker', () => {
      const sortFn = createDefaultSortFn(mockGetAspectSortKey)
      const a = { position: { card: { aspects: ['Vigilance'], cost: 3, type: 'Unit', name: 'Alpha' } } }
      const b = { position: { card: { aspects: ['Vigilance'], cost: 3, type: 'Unit', name: 'Beta' } } }
      assert.strictEqual(sortFn(a, b) < 0, true)
    })

    it('handles null cost', () => {
      const sortFn = createDefaultSortFn(mockGetAspectSortKey)
      const a = { position: { card: { aspects: ['Vigilance'], cost: 5, type: 'Unit', name: 'A' } } }
      const b = { position: { card: { aspects: ['Vigilance'], cost: null, type: 'Unit', name: 'B' } } }
      assert.strictEqual(sortFn(a, b) < 0, true)
    })
  })

  describe('createGroupCardSortFn', () => {
    // Mock returns A_, B_, C_ prefixes to simulate actual aspect sort key behavior
    const mockGetAspectSortKey = (card: { aspects?: string[] }) => {
      const aspect = card.aspects?.[0]
      const priorities: Record<string, string> = { 'Vigilance': 'A', 'Command': 'B', 'Aggression': 'C', 'Cunning': 'D' }
      return priorities[aspect!] ? `${priorities[aspect!]}_${aspect}` : 'ZZZ_Neutral'
    }

    describe('cost sort option', () => {
      it('sorts by aspect within cost group', () => {
        const sortFn = createGroupCardSortFn('cost', mockGetAspectSortKey)
        const a = { position: { card: { aspects: ['Vigilance'], cost: 3, type: 'Unit', name: 'Z' } } }
        const b = { position: { card: { aspects: ['Command'], cost: 3, type: 'Unit', name: 'A' } } }
        // A_Vigilance < B_Command alphabetically
        assert.strictEqual(sortFn(a, b) < 0, true)
      })

      it('sorts by type after aspect', () => {
        const sortFn = createGroupCardSortFn('cost', mockGetAspectSortKey)
        const a = { position: { card: { aspects: ['Vigilance'], cost: 3, type: 'Unit', arenas: ['Ground'], name: 'Z' } } }
        const b = { position: { card: { aspects: ['Vigilance'], cost: 3, type: 'Event', name: 'A' } } }
        assert.strictEqual(sortFn(a, b) < 0, true)
      })
    })

    describe('type sort option', () => {
      it('sorts by aspect within type group', () => {
        const sortFn = createGroupCardSortFn('type', mockGetAspectSortKey)
        const a = { position: { card: { aspects: ['Vigilance'], cost: 5, type: 'Unit', name: 'Z' } } }
        const b = { position: { card: { aspects: ['Command'], cost: 1, type: 'Unit', name: 'A' } } }
        // A_Vigilance < B_Command alphabetically
        assert.strictEqual(sortFn(a, b) < 0, true)
      })

      it('sorts by cost after aspect', () => {
        const sortFn = createGroupCardSortFn('type', mockGetAspectSortKey)
        const a = { position: { card: { aspects: ['Vigilance'], cost: 1, type: 'Unit', name: 'Z' } } }
        const b = { position: { card: { aspects: ['Vigilance'], cost: 5, type: 'Unit', name: 'A' } } }
        assert.strictEqual(sortFn(a, b) < 0, true)
      })
    })

    describe('aspect sort option', () => {
      it('sorts by cost within aspect group', () => {
        const sortFn = createGroupCardSortFn('aspect', mockGetAspectSortKey)
        const a = { position: { card: { aspects: ['Vigilance'], cost: 1, type: 'Event', name: 'Z' } } }
        const b = { position: { card: { aspects: ['Vigilance'], cost: 5, type: 'Unit', name: 'A' } } }
        assert.strictEqual(sortFn(a, b) < 0, true)
      })

      it('sorts by type after cost', () => {
        const sortFn = createGroupCardSortFn('aspect', mockGetAspectSortKey)
        const a = { position: { card: { aspects: ['Vigilance'], cost: 3, type: 'Unit', arenas: ['Ground'], name: 'Z' } } }
        const b = { position: { card: { aspects: ['Vigilance'], cost: 3, type: 'Event', name: 'A' } } }
        assert.strictEqual(sortFn(a, b) < 0, true)
      })
    })

    it('sorts by name as final tiebreaker', () => {
      const sortFn = createGroupCardSortFn('aspect', mockGetAspectSortKey)
      const a = { position: { card: { aspects: ['Vigilance'], cost: 3, type: 'Unit', name: 'Alpha' } } }
      const b = { position: { card: { aspects: ['Vigilance'], cost: 3, type: 'Unit', name: 'Beta' } } }
      assert.strictEqual(sortFn(a, b) < 0, true)
    })
  })
})
