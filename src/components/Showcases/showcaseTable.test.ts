import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { countUniqueShowcases, sortForExport, scatterPositions, clampToTable } from './showcaseTable'

const cards = {
  vader: { id: 'vader', name: 'Darth Vader', subtitle: 'Dark Lord of the Sith', aspects: ['Aggression', 'Villainy'] },
  vader2: { id: 'vader2', name: 'Darth Vader', subtitle: 'Dark Lord of the Sith', aspects: ['Aggression', 'Villainy'] },
  leia: { id: 'leia', name: 'Leia Organa', subtitle: 'Defiant Princess', aspects: ['Command', 'Heroism'] },
  boba: { id: 'boba', name: 'Boba Fett', subtitle: 'Daimyo', aspects: ['Cunning', 'Villainy'] },
  anakin: { id: 'anakin', name: 'Anakin Skywalker', subtitle: 'What It Takes to Win', aspects: ['Aggression', 'Heroism'] },
}
const leader = (id: string, cardId: keyof typeof cards, setCode: string) => ({ id, cardId, cardName: cards[cardId].name, setCode })

describe('showcase collection', () => {
  it('counts a leader pulled twice once (name + subtitle)', () => {
    const owned = [leader('1', 'vader', 'SOR'), leader('2', 'vader2', 'SOR'), leader('3', 'leia', 'SOR')]
    assert.equal(countUniqueShowcases(owned, cards), 2)
  })

  it('sorts the export by set, villains before heroes, then name', () => {
    const owned = [leader('1', 'leia', 'SOR'), leader('2', 'anakin', 'TWI'), leader('3', 'boba', 'SHD'), leader('4', 'vader', 'SOR')]
    const sorted = sortForExport(owned, cards, ['SOR', 'SHD', 'TWI'])
    assert.deepEqual(sorted.map(s => s.cardName), ['Darth Vader', 'Leia Organa', 'Boba Fett', 'Anakin Skywalker'])
  })

  it('scatters every card fully inside the table', () => {
    const table = { width: 1000, height: 720 }
    const card = { width: 294, height: 210 }
    const positions = scatterPositions(['a', 'b', 'c', 'd', 'e', 'f', 'g'], table, card, () => 0.99)
    assert.equal(Object.keys(positions).length, 7)
    for (const p of Object.values(positions)) {
      assert.ok(p.x >= 0 && p.x + card.width <= table.width, `x ${p.x} inside`)
      assert.ok(p.y >= 0 && p.y + card.height <= table.height, `y ${p.y} inside`)
      assert.ok(Math.abs(p.rotation) <= 10)
    }
    assert.deepEqual(Object.values(positions).map(p => p.zIndex), [1, 2, 3, 4, 5, 6, 7])
  })

  it('keeps a dragged card on the table', () => {
    const table = { width: 800, height: 600 }
    const card = { width: 200, height: 140 }
    assert.deepEqual(clampToTable({ x: -40, y: 900 }, table, card), { x: 0, y: 460 })
    assert.deepEqual(clampToTable({ x: 120, y: 30 }, table, card), { x: 120, y: 30 })
  })

  it('never places a card at a negative spot on a table narrower than the card', () => {
    assert.deepEqual(clampToTable({ x: 50, y: 50 }, { width: 150, height: 100 }, { width: 200, height: 140 }), { x: 0, y: 0 })
  })
})
