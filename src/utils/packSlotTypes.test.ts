// SPEC: tracked slot types are the slot a card was printed in.
// Icons 2027 Edition (docs/sets/IC27.md) prints a 9-card pack:
//   0-2 common · 3 leader (about 1 in 4) or common · 4 hyperspace common
//   5-6 uncommon (6 = UC2, stays 'uncommon' when upgraded) · 7 rare/legendary · 8 hyperspace foil
// Every other set keeps the 16-card map, slot 0 leader and slot 1 base.
import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { slotTypeForPackCard, PACK_SLOT_TYPES } from './packSlotTypes'
import { initializeCardCache } from './cardCache'
import { generateBoosterPack, clearBeltCache } from './boosterPack'

const ICONS_SPEC = ['common', 'common', 'common', null, 'common', 'uncommon', 'uncommon', 'rare_legendary', 'foil']

describe('slotTypeForPackCard', () => {
  before(async () => {
    await initializeCardCache()
    clearBeltCache()
  })

  it('FIXED: labels every slot of real Icons packs by the Icons layout, not the 16-card map', () => {
    let leaders = 0
    for (let p = 0; p < 96; p++) {
      const pack = generateBoosterPack([], 'IC27').cards
      assert.strictEqual(pack.length, 9)
      pack.forEach((card, i) => {
        const got = slotTypeForPackCard(card, i)
        const want = ICONS_SPEC[i] ?? (card.isLeader ? 'leader' : 'common')
        assert.strictEqual(got, want, `IC27 slot ${i} (${card.name}, ${card.rarity}) labelled ${got}, spec ${want}`)
      })
      if (pack[3].isLeader) leaders++
    }
    assert.ok(leaders > 0, 'some Icons pack should carry a leader in slot 3')
  })

  it('never labels an Icons card as a base', () => {
    for (let i = 0; i < 9; i++) {
      assert.notStrictEqual(slotTypeForPackCard({ set: 'IC27', isLeader: false }, i), 'base')
    }
  })

  it('keeps the 16-card map for sets with a leader slot', () => {
    for (const set of ['SOR', 'LAW', 'HMW']) {
      for (let i = 0; i < 16; i++) {
        assert.strictEqual(slotTypeForPackCard({ set }, i), PACK_SLOT_TYPES[i])
      }
    }
  })

  it('falls back to the 16-card map when the card has no set', () => {
    assert.strictEqual(slotTypeForPackCard({}, 1), 'base')
    assert.strictEqual(slotTypeForPackCard(null, 0), 'leader')
    assert.strictEqual(slotTypeForPackCard({ set: 'SOR' }, 16), null)
  })
})
