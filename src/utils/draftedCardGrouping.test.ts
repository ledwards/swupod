import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { groupDraftedCards, getAspectKey } from './draftedCardGrouping.ts'

const mk = (over = {}) => ({ id: Math.random().toString(36).slice(2), ...over })

describe('groupDraftedCards', () => {
  it('SPEC: pack mode splits pick-order cards into Pack 1..N by packSize', () => {
    const cards = Array.from({ length: 28 }, (_, i) => mk({ n: i }))
    const groups = groupDraftedCards(cards, 'pack', 14)
    assert.deepEqual(groups.map(g => g.label), ['Pack 1', 'Pack 2'])
    assert.equal(groups[0].cards.length, 14)
    assert.equal(groups[1].cards.length, 14)
    // pick order preserved within a pack
    assert.equal(groups[0].cards[0].n, 0)
    assert.equal(groups[1].cards[0].n, 14)
  })

  it('SPEC: cost mode groups by cost, ordered 0..7 then 8+, with 8+ catching high costs', () => {
    const cards = [mk({ cost: 2 }), mk({ cost: 0 }), mk({ cost: 5 }), mk({ cost: 2 }), mk({ cost: 8 }), mk({ cost: 11 })]
    const groups = groupDraftedCards(cards, 'cost')
    assert.deepEqual(groups.map(g => g.label), ['Cost 0', 'Cost 2', 'Cost 5', 'Cost 8+'])
    assert.equal(groups.find(g => g.label === 'Cost 2')!.cards.length, 2)
    assert.equal(groups.find(g => g.label === 'Cost 8+')!.cards.length, 2) // 8 and 11
  })

  it('SPEC: cost mode treats missing cost as 0', () => {
    const groups = groupDraftedCards([mk({}), mk({ cost: 0 })], 'cost')
    assert.deepEqual(groups.map(g => g.label), ['Cost 0'])
    assert.equal(groups[0].cards.length, 2)
  })

  it('SPEC: padCostColumns shows every cost column even when empty, but omits an empty Cost 0', () => {
    const groups = groupDraftedCards([mk({ cost: 2 }), mk({ cost: 5 })], 'cost', 14, true)
    assert.deepEqual(
      groups.map(g => g.label),
      ['Cost 1', 'Cost 2', 'Cost 3', 'Cost 4', 'Cost 5', 'Cost 6', 'Cost 7', 'Cost 8+'],
    )
    assert.equal(groups.find(g => g.label === 'Cost 2')!.cards.length, 1)
    assert.equal(groups.find(g => g.label === 'Cost 3')!.cards.length, 0) // empty column still shown
  })

  it('SPEC: padCostColumns includes Cost 0 only when a zero-cost card exists', () => {
    const groups = groupDraftedCards([mk({ cost: 0 }), mk({ cost: 1 })], 'cost', 14, true)
    assert.deepEqual(
      groups.map(g => g.label),
      ['Cost 0', 'Cost 1', 'Cost 2', 'Cost 3', 'Cost 4', 'Cost 5', 'Cost 6', 'Cost 7', 'Cost 8+'],
    )
  })

  it('SPEC: aspect mode orders Vigilance, Command, Aggression, Cunning, multi, then Neutral last', () => {
    const cards = [
      mk({ aspects: ['Command'] }),
      mk({ aspects: [] }), // Neutral
      mk({ aspects: ['Vigilance'] }),
      mk({ aspects: ['Aggression', 'Cunning'] }), // multi
    ]
    const groups = groupDraftedCards(cards, 'aspect')
    assert.deepEqual(groups.map(g => g.label), ['Vigilance', 'Command', 'Aggression/Cunning', 'Neutral'])
  })

  it('SPEC: getAspectKey puts Neutral last and sorts multi-aspect deterministically', () => {
    assert.equal(getAspectKey({ aspects: [] }), 'ZZZ_Neutral')
    assert.equal(getAspectKey({ aspects: ['Cunning', 'Aggression'] }), 'F_Aggression/Cunning')
    assert.ok(getAspectKey({ aspects: ['Vigilance'] }) < getAspectKey({ aspects: ['Command'] }))
  })
})
