// SPEC: tracked slot types are the slot a card was printed in.
// Icons 2027 Edition (docs/sets/IC27.md) prints a 9-card pack:
//   0-2 common · 3 leader (about 1 in 4) or common · 4 hyperspace common
//   5-6 uncommon (6 = UC2, stays 'uncommon' when upgraded) · 7 rare/legendary · 8 hyperspace foil
// LAW+ (Set 7+, .claude/rules/belt-system.md "Pack Slot Indices") prints a 16-card pack:
//   0 leader · 1 base · 2-10 common (6 = guaranteed HS common) · 11 hyperspace foil
//   12-14 uncommon (14 = UC3, stays 'uncommon' when upgraded) · 15 rare/legendary
// Sets 1-6 keep the 16-card map: 0 leader · 1 base · 2-10 common · 11-13 uncommon · 14 R/L · 15 foil.
// Carbonite (-CB) packs print their own 16-card layout with no base (src/utils/carboniteBoosterPack.ts),
// labelled 'carbonite_*' so standard-pack stats never read them:
//   JTL/LOF/SEC: 0 leader · 1-4 common foil · 5-6 uncommon foil · 7 R/L foil · 8 prestige
//                9-11 HS common · 12 HS uncommon · 13 HS R/L · 14-15 hyperspace foil
//   LAW:         0 leader · 1 prestige · 2-5 HS common · 6-8 HS flex · 9 HS top · 10-13 HSF flex · 14-15 HSF common
//   ASH:         0 leader · 1-7 HS run · 8 HS top · 9 prestige · 10 HSF top · 11-15 HSF run
import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { slotTypeForPackCard } from './packSlotTypes'
import { initializeCardCache } from './cardCache'
import { generateBoosterPack, clearBeltCache } from './boosterPack'

const LAW_PLUS_SPEC = [
  'leader', 'base',
  'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common',
  'foil',
  'uncommon', 'uncommon', 'uncommon',
  'rare_legendary',
]
const SETS_1_6_SPEC = [
  'leader', 'base',
  'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common',
  'uncommon', 'uncommon', 'uncommon',
  'rare_legendary',
  'foil',
]
const CARBONITE_SPEC: Record<string, string[]> = {
  JTL: ['carbonite_leader',
    'carbonite_foil_common', 'carbonite_foil_common', 'carbonite_foil_common', 'carbonite_foil_common',
    'carbonite_foil_uncommon', 'carbonite_foil_uncommon', 'carbonite_foil_rare_legendary', 'carbonite_prestige',
    'carbonite_hs_common', 'carbonite_hs_common', 'carbonite_hs_common', 'carbonite_hs_uncommon', 'carbonite_hs_rare_legendary',
    'carbonite_hsf', 'carbonite_hsf'],
  LAW: ['carbonite_leader', 'carbonite_prestige',
    'carbonite_hs_common', 'carbonite_hs_common', 'carbonite_hs_common', 'carbonite_hs_common',
    'carbonite_hs_flex', 'carbonite_hs_flex', 'carbonite_hs_flex', 'carbonite_hs_top',
    'carbonite_hsf_flex', 'carbonite_hsf_flex', 'carbonite_hsf_flex', 'carbonite_hsf_flex',
    'carbonite_hsf_common', 'carbonite_hsf_common'],
  ASH: ['carbonite_leader',
    'carbonite_hs', 'carbonite_hs', 'carbonite_hs', 'carbonite_hs', 'carbonite_hs', 'carbonite_hs', 'carbonite_hs',
    'carbonite_hs_top', 'carbonite_prestige', 'carbonite_hsf_top',
    'carbonite_hsf', 'carbonite_hsf', 'carbonite_hsf', 'carbonite_hsf', 'carbonite_hsf'],
}
CARBONITE_SPEC.LOF = CARBONITE_SPEC.JTL
CARBONITE_SPEC.SEC = CARBONITE_SPEC.JTL

// What the printed card must look like for each Carbonite label.
function carboniteCardFits(label: string, card: { isLeader?: boolean; isFoil?: boolean; isHyperspace?: boolean; variantType?: string; rarity?: string }): boolean {
  const hs = card.isHyperspace === true || card.variantType === 'Hyperspace'
  const foil = card.isFoil === true
  if (label === 'carbonite_leader') return card.isLeader === true
  if (label === 'carbonite_prestige') return /Prestige$/.test(card.variantType ?? '')
  if (label.startsWith('carbonite_hsf')) return hs && foil
  if (label.startsWith('carbonite_hs')) return hs && !foil
  if (label.startsWith('carbonite_foil')) return foil && !hs
  return false
}

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

  it('FIXED: labels every slot of real LAW+ packs by the LAW+ physical order', () => {
    for (const set of ['LAW', 'ASH', 'HMW']) {
      for (let p = 0; p < 48; p++) {
        const pack = generateBoosterPack([], set).cards
        assert.strictEqual(pack.length, 16)
        pack.forEach((card, i) => {
          const got = slotTypeForPackCard(card, i)
          assert.strictEqual(got, LAW_PLUS_SPEC[i], `${set} slot ${i} (${card.name}, ${card.rarity}) labelled ${got}, spec ${LAW_PLUS_SPEC[i]}`)
        })
        // The labels match what is printed there: slot 11 is the hyperspace foil, slot 15 the R/L.
        assert.ok(pack[11].isFoil, `${set} slot 11 should be the foil`)
        assert.ok(['Rare', 'Legendary', 'Special'].includes(pack[15].rarity), `${set} slot 15 should be R/L, got ${pack[15].rarity}`)
        assert.strictEqual(pack[0].isLeader, true, `${set} slot 0 should be the leader`)
      }
    }
  })

  it('keeps the Sets 1-6 map for Sets 1-6 packs', () => {
    for (const set of ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC']) {
      const pack = generateBoosterPack([], set).cards
      assert.strictEqual(pack.length, 16)
      pack.forEach((card, i) => {
        assert.strictEqual(slotTypeForPackCard(card, i), SETS_1_6_SPEC[i], `${set} slot ${i}`)
      })
      assert.ok(pack[15].isFoil, `${set} slot 15 should be the foil`)
    }
  })

  it('FIXED: labels every slot of real Carbonite packs by their own layout, never as a standard slot', () => {
    for (const set of Object.keys(CARBONITE_SPEC)) {
      const packSet = `${set}-CB`
      for (let p = 0; p < 24; p++) {
        const pack = generateBoosterPack([], packSet).cards
        assert.strictEqual(pack.length, 16, `${packSet} pack size`)
        pack.forEach((card, i) => {
          const got = slotTypeForPackCard(card, i, packSet)
          assert.strictEqual(got, CARBONITE_SPEC[set][i], `${packSet} slot ${i} (${card.name}) labelled ${got}`)
          assert.ok(carboniteCardFits(got as string, card), `${packSet} slot ${i} labelled ${got} holds ${card.variantType} ${card.rarity} foil=${card.isFoil} hs=${card.isHyperspace}`)
        })
      }
    }
  })

  it('falls back to the 16-card map when the card has no set', () => {
    assert.strictEqual(slotTypeForPackCard({}, 1), 'base')
    assert.strictEqual(slotTypeForPackCard(null, 0), 'leader')
    assert.strictEqual(slotTypeForPackCard({ set: 'SOR' }, 16), null)
  })
})
