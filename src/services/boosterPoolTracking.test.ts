// Spec tests for booster-pool generation tracking.
//
// SPEC (see src/services/boosterPoolTracking.ts):
//   Every card in a format pool's booster packs is recorded in card_generations, the
//   same way regular Sealed records a pool, so showcase leaders pulled in Chaos
//   Sealed, Pack Wars or Pack Blitz appear in the puller's Showcase collection.
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { buildBoosterPoolTrackingRecords } from './boosterPoolTracking.ts'
import { buildChaosSealedTrackingRecords } from './chaosSealedTracking.ts'

const POOL = {
  poolId: 'aa480fe4-ebab-4b6d-9289-54f23877802e',
  shareId: '8cIgmJA8',
  userId: '5180de0e-863d-4d2c-8d5a-2d308cf011c5',
}

/** A 16-card booster in the shape Chaos Sealed stores: {cards, setCode, setName}. */
function boosterPack(setCode: string, cardSet: string) {
  const cards = [
    { id: 'c-leader', set: cardSet, name: 'Finn', type: 'Leader', rarity: 'Rare', variantType: 'Showcase', isLeader: true },
    { id: 'c-base', set: cardSet, name: 'Base', type: 'Base', rarity: 'Common', variantType: 'Normal', isBase: true },
  ]
  for (let i = 2; i < 16; i++) {
    cards.push({ id: `c-${i}`, set: cardSet, name: `Card ${i}`, type: 'Unit', rarity: 'Common', variantType: 'Normal' })
  }
  return { cards, setCode, setName: 'Test Set' }
}

/** A GC Event Pack as stored: promo setCode, Units-only catalog, not 16 cards. */
function eventPack() {
  return {
    setCode: 'GC2026_SILVER',
    setName: '2026 GC Silver Pack',
    cards: [
      { id: 'p-1', set: 'SOR', name: 'Promo One', type: 'Unit', rarity: 'Rare', variantType: 'Normal' },
      { id: 'p-2', set: 'SOR', name: 'Promo Two', type: 'Unit', rarity: 'Rare', variantType: 'Normal' },
    ],
  }
}

describe('buildBoosterPoolTrackingRecords', () => {
  it('BUGGY (old code): a Chaos Sealed pool produced no tracking records at all', () => {
    // The old route inserted the pool and returned without calling the tracker,
    // so a showcase leader opened in Chaos Sealed was never attributed to anyone.
    const oldBehaviourRecordCount = 0
    const records = buildBoosterPoolTrackingRecords([boosterPack('ASH-CB', 'ASH')], POOL)
    assert.ok(records.length > oldBehaviourRecordCount, 'SPEC: Chaos Sealed packs must be tracked')
  })

  it('records every card of every set pack', () => {
    const packs = [boosterPack('ASH-CB', 'ASH'), boosterPack('JTL', 'JTL')]
    const records = buildBoosterPoolTrackingRecords(packs, POOL)
    assert.strictEqual(records.length, 32, 'SPEC: 2 packs x 16 cards')
  })

  it('attributes each record to the pool and its owner', () => {
    const [record] = buildBoosterPoolTrackingRecords([boosterPack('ASH-CB', 'ASH')], POOL)
    assert.strictEqual(record.options.sourceId, POOL.poolId)
    assert.strictEqual(record.options.sourceShareId, POOL.shareId)
    assert.strictEqual(record.options.userId, POOL.userId)
    assert.strictEqual(record.options.sourceType, 'sealed')
    assert.strictEqual(record.options.packType, 'booster')
  })

  it('assigns slot types by position, so a Showcase leader lands in the leader slot', () => {
    const records = buildBoosterPoolTrackingRecords([boosterPack('ASH-CB', 'ASH')], POOL)
    assert.strictEqual(records[0].options.slotType, 'leader')
    assert.strictEqual(records[1].options.slotType, 'base')
    assert.strictEqual(records[15].options.slotType, 'foil')
    assert.strictEqual(records[0].card.variantType, 'Showcase', 'the leader is the Showcase pull')
  })

  it('numbers pack_index by position in the stored packs array', () => {
    const packs = [boosterPack('ASH-CB', 'ASH'), boosterPack('JTL', 'JTL')]
    const records = buildBoosterPoolTrackingRecords(packs, POOL)
    assert.strictEqual(records[0].options.packIndex, 0)
    assert.strictEqual(records[16].options.packIndex, 1)
  })

  it('SPEC: skips GC Event Packs — their catalog is Units only, and they are not 16-card boosters', () => {
    const packs = [boosterPack('ASH-CB', 'ASH'), eventPack()]
    const records = buildBoosterPoolTrackingRecords(packs, POOL)
    assert.strictEqual(records.length, 16, 'only the set pack is tracked')
    assert.ok(records.every(r => r.card.id !== 'p-1'), 'no Event Pack card is recorded')
  })

  it('keeps pack_index aligned with the stored packs array when an Event Pack is skipped', () => {
    const packs = [eventPack(), boosterPack('ASH-CB', 'ASH')]
    const records = buildBoosterPoolTrackingRecords(packs, POOL)
    assert.strictEqual(records[0].options.packIndex, 1, 'SPEC: index is the pack position, not a counter')
  })

  it('SPEC: a Carbonite pack is recorded under its base set code, from the card itself', () => {
    const [record] = buildBoosterPoolTrackingRecords([boosterPack('ASH-CB', 'ASH')], POOL)
    assert.strictEqual(record.card.set, 'ASH', 'ASH-CB packs hold ASH cards')
  })

  it('accepts an anonymous pool (no signed-in owner)', () => {
    const [record] = buildBoosterPoolTrackingRecords([boosterPack('ASH', 'ASH')], { ...POOL, userId: null })
    assert.strictEqual(record.options.userId, null)
  })

  it('tolerates malformed packs without throwing', () => {
    const packs = [null, { cards: null }, {}, boosterPack('ASH', 'ASH'), { cards: [{ name: 'no id' }] }]
    const records = buildBoosterPoolTrackingRecords(packs, POOL)
    assert.strictEqual(records.length, 16, 'only the well-formed pack contributes records')
  })

  it('accepts a bare array pack (older stored pools)', () => {
    const records = buildBoosterPoolTrackingRecords([boosterPack('ASH', 'ASH').cards], POOL)
    assert.strictEqual(records.length, 16)
    assert.strictEqual(records[0].options.slotType, 'leader')
  })

  it('returns nothing for an empty or missing packs array', () => {
    assert.deepStrictEqual(buildBoosterPoolTrackingRecords([], POOL), [])
    assert.deepStrictEqual(buildBoosterPoolTrackingRecords(null, POOL), [])
  })
})

describe('Pack Wars and Pack Blitz pools', () => {
  // Those routes store the raw generateBoosterPack() results: {cards: [...]} with no
  // setCode key, unlike Chaos Sealed which tags each pack with the code it was picked from.
  const rawPack = (cardSet: string) => ({ cards: boosterPack('X', cardSet).cards })

  it('BUGGY (old code): Pack Wars and Pack Blitz pools produced no tracking records', () => {
    const oldBehaviourRecordCount = 0
    const records = buildBoosterPoolTrackingRecords([rawPack('SOR'), rawPack('SOR')], POOL)
    assert.ok(records.length > oldBehaviourRecordCount, 'SPEC: booster pools must be tracked')
  })

  it('records both Pack Wars packs', () => {
    const records = buildBoosterPoolTrackingRecords([rawPack('SOR'), rawPack('SOR')], POOL)
    assert.strictEqual(records.length, 32, 'SPEC: 2 packs x 16 cards')
    assert.strictEqual(records[0].options.packIndex, 0)
    assert.strictEqual(records[16].options.packIndex, 1)
  })

  it('records the single Pack Blitz pack', () => {
    const records = buildBoosterPoolTrackingRecords([rawPack('SOR')], POOL)
    assert.strictEqual(records.length, 16)
    assert.strictEqual(records[0].options.slotType, 'leader')
  })

  it('a pack with no setCode is never mistaken for an Event Pack', () => {
    const records = buildBoosterPoolTrackingRecords([rawPack('SOR')], POOL)
    assert.strictEqual(records.length, 16, 'SPEC: only a promo setCode marks an Event Pack')
  })
})

describe('chaosSealedTracking shim (pinned by migration 094)', () => {
  // Migration 094 imports this name and has already run in production. If the shim
  // breaks, that migration fails on any database that has not run it yet.
  it('still exports the builder under its original name', () => {
    const records = buildChaosSealedTrackingRecords([boosterPack('ASH-CB', 'ASH')], POOL)
    assert.strictEqual(records.length, 16)
    assert.strictEqual(records[0].options.slotType, 'leader')
  })
})
