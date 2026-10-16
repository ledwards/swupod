import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { compareCatalogCards, groupCatalogCards, type CatalogCard } from './setCatalog'

const card = (over: Partial<CatalogCard> & { name: string }): CatalogCard => ({
  id: over.name, type: 'Unit', aspects: [], cost: 1, ...over,
})

describe('set catalog grouping', () => {
  const cards = [
    card({ name: 'Command Unit', aspects: ['Command'], cost: 2 }),
    card({ name: 'Vigilance Unit', aspects: ['Vigilance'], cost: 3 }),
    card({ name: 'Villain Leader', type: 'Leader', isLeader: true, aspects: ['Aggression', 'Villainy'] }),
    card({ name: 'Command Base', type: 'Base', isBase: true, aspects: ['Command'] }),
    card({ name: 'Vigilance Villain', aspects: ['Vigilance', 'Villainy'], cost: 1 }),
    card({ name: 'Plain Villainy', aspects: ['Villainy'] }),
    card({ name: 'Plain Heroism', aspects: ['Heroism'] }),
    card({ name: 'Neutral Event', type: 'Event', aspects: [] }),
    card({ name: 'Unknown Vigilance Unit', aspects: ['Vigilance'], isPlaceholder: true, rarity: 'Common', placeholderSlotIndex: 1 }),
    card({ name: 'Unknown Leader', type: 'Leader', isLeader: true, aspects: ['Cunning', 'Heroism'], isPlaceholder: true }),
    card({ name: 'Unknown Base', type: 'Unknown', aspects: ['Aggression'], isPlaceholder: true, placeholderGroup: 'base' }),
  ]

  const groups = groupCatalogCards([...cards].sort(compareCatalogCards))

  it('orders the page Leaders, Bases, then each aspect in game order, Neutral last', () => {
    assert.deepEqual(groups.map(g => g.label), ['Leaders', 'Bases', 'Vigilance', 'Command', 'Villainy', 'Heroism', 'Neutral'])
  })

  it('puts every leader and every base (spoiled or not) in its own group', () => {
    assert.deepEqual(groups[0]!.cards.map(c => c.name), ['Villain Leader', 'Unknown Leader'])
    assert.deepEqual(groups[1]!.cards.map(c => c.name), ['Command Base', 'Unknown Base'])
  })

  it('files a main-deck card under its primary aspect, unknown slots after the spoiled cards', () => {
    assert.deepEqual(groups[2]!.cards.map(c => c.name), ['Vigilance Villain', 'Vigilance Unit', 'Unknown Vigilance Unit'])
    assert.equal(groups[2]!.aspect, 'Vigilance')
  })

  it('gives Neutral no aspect icon', () => {
    assert.equal(groups.at(-1)!.aspect, null)
  })

  it('counts every card exactly once', () => {
    assert.equal(groups.reduce((n, g) => n + g.cards.length, 0), cards.length)
  })
})
