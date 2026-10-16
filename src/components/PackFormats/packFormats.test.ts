/**
 * Pack Wars / Pack Blitz (alpha) — the pure pieces of the setup → room → play flow.
 *
 * Specs (from the legacy pages these replace and plans/2026-10-13-style-guide-page-migration.md B4):
 * - The deck is every card from the opened packs except leaders and bases.
 * - Tabletop Simulator JSON: `[PTP Pack Wars] <set>` / `[PTP Pack Blitz] <set>`, author "Protect the Pod",
 *   leader + base count 1, empty sideboard.
 * - Pack Wars can fill the deck to 30 with 0-cost Porgs (card 28294); Pack Blitz never does.
 * - Routing: alpha moves /formats/<sub> to /other-formats/<sub>, keeping the query string.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  PACK_FORMATS,
  PORG_CARD_ID,
  deckCardsOf,
  buildTtsDeck,
  buildKarabastDeckState,
  withQuery,
  alphaPath,
  legacyPath,
  type PackPool,
} from './packFormats'

const card = (id: string, type: string, extra: Record<string, unknown> = {}) => ({ id, name: `Card ${id}`, type, ...extra })

function poolOf(perPack: number, packs: number): PackPool {
  const out: PackPool = { setCode: 'SHD', setName: 'Shadows of the Galaxy', leaders: [], bases: [], deckCards: [], packs: [] }
  for (let p = 0; p < packs; p++) {
    const leader = card(`L${p}`, 'Leader', { isLeader: true })
    const base = card(`B${p}`, 'Base', { isBase: true })
    out.leaders.push(leader)
    out.bases.push(base)
    const pack = [leader, base]
    for (let i = 0; i < perPack; i++) pack.push(card(`C${i % 5}`, 'Unit'))
    out.packs!.push(pack)
  }
  return out
}

describe('PACK_FORMATS', () => {
  it('Pack Wars opens 2 packs, Pack Blitz opens 1 (spec: format rules)', () => {
    assert.equal(PACK_FORMATS['pack-wars'].packs, 2)
    assert.equal(PACK_FORMATS['pack-blitz'].packs, 1)
  })
  it('only Pack Wars offers the Porg fill', () => {
    assert.equal(PACK_FORMATS['pack-wars'].porgFill, true)
    assert.equal(PACK_FORMATS['pack-blitz'].porgFill, false)
  })
})

describe('deckCardsOf', () => {
  it('is every pack card except leaders and bases', () => {
    const pool = poolOf(14, 2)
    const deck = deckCardsOf(pool)
    assert.equal(deck.length, 28)
    assert.ok(deck.every(c => c.type !== 'Leader' && c.type !== 'Base'))
  })
  it('falls back to deckCards when the pool has no packs', () => {
    const pool: PackPool = { setCode: 'SHD', setName: 'S', leaders: [], bases: [], deckCards: [card('X', 'Event')] }
    assert.deepEqual(deckCardsOf(pool).map(c => c.id), ['X'])
  })
})

describe('buildTtsDeck', () => {
  const pool = poolOf(14, 2)

  it('names the deck after the format and set, with leader, base and grouped counts', () => {
    const deck = buildTtsDeck(pool, 'pack-wars', 1, 0, { fillWithPorgs: false })!
    assert.deepEqual(deck.metadata, { name: '[PTP Pack Wars] Shadows of the Galaxy', author: 'Protect the Pod' })
    assert.deepEqual(deck.leader, { id: 'L1', count: 1 })
    assert.deepEqual(deck.base, { id: 'B0', count: 1 })
    assert.deepEqual(deck.sideboard, [])
    assert.equal(deck.deck.reduce((n, e) => n + e.count, 0), 28)
    assert.equal(deck.deck.find(e => e.id === 'C0')!.count, 6) // 3 per pack x 2 packs
  })

  it('Pack Wars fills a 28-card deck with exactly 2 Porgs to reach 30', () => {
    const deck = buildTtsDeck(pool, 'pack-wars', 0, 0, { fillWithPorgs: true })!
    assert.deepEqual(deck.deck.find(e => e.id === PORG_CARD_ID), { id: PORG_CARD_ID, count: 2 })
    assert.equal(deck.deck.reduce((n, e) => n + e.count, 0), 30)
  })

  it('adds no Porgs when the deck already has 30', () => {
    const deck = buildTtsDeck(poolOf(15, 2), 'pack-wars', 0, 0, { fillWithPorgs: true })!
    assert.equal(deck.deck.find(e => e.id === PORG_CARD_ID), undefined)
  })

  it('Pack Blitz never adds Porgs, even when asked', () => {
    const blitz = poolOf(14, 1)
    const deck = buildTtsDeck(blitz, 'pack-blitz', 0, 0, { fillWithPorgs: true })!
    assert.equal(deck.metadata.name, '[PTP Pack Blitz] Shadows of the Galaxy')
    assert.equal(deck.deck.find(e => e.id === PORG_CARD_ID), undefined)
    assert.equal(deck.deck.reduce((n, e) => n + e.count, 0), 14)
  })

  it('returns null without a leader and base', () => {
    assert.equal(buildTtsDeck(pool, 'pack-wars', null, 0, { fillWithPorgs: false }), null)
    assert.equal(buildTtsDeck(pool, 'pack-wars', 0, 9, { fillWithPorgs: false }), null)
  })
})

describe('buildKarabastDeckState', () => {
  const pool = poolOf(14, 2)

  it('marks the picked leader and base active and puts every other card in the deck', () => {
    const state = buildKarabastDeckState(pool, 'pack-wars', 1, 0, { fillWithPorgs: false })!
    const active = state.cardPositions[state.activeLeader]!
    assert.equal(active.card.id, 'L1')
    assert.equal(active.card.isLeader, true)
    assert.equal(state.cardPositions[state.activeBase]!.card.id, 'B0')
    const deck = Object.values(state.cardPositions).filter(p => p.section === 'deck' && p.visible && p.enabled !== false)
    assert.equal(deck.length, 28)
    assert.equal(state.poolName, '[PTP Pack Wars] Shadows of the Galaxy')
  })

  it('carries the same Porg fill as the Tabletop Simulator JSON', () => {
    const state = buildKarabastDeckState(pool, 'pack-wars', 0, 0, { fillWithPorgs: true })!
    const porgs = Object.values(state.cardPositions).filter(p => p.section === 'deck' && p.card.id === PORG_CARD_ID)
    assert.equal(porgs.length, 2)
  })
})

describe('alphaPath / legacyPath', () => {
  it('maps /formats/<sub> to /other-formats/<sub> and back, same sub-path', () => {
    assert.equal(withQuery(alphaPath('pack-wars', '/abc/play'), { a: '1' }), '/other-formats/pack-wars/abc/play?a=1')
    assert.equal(legacyPath('pack-blitz', '/abc'), '/formats/pack-blitz/abc')
  })
})

describe('withQuery', () => {
  it('keeps the query string, repeated keys included', () => {
    assert.equal(withQuery('/other-formats/pack-wars', { from: 'home', x: ['1', '2'] }), '/other-formats/pack-wars?from=home&x=1&x=2')
  })
  it('returns the bare path with no query', () => {
    assert.equal(withQuery('/formats/pack-blitz/abc/play', {}), '/formats/pack-blitz/abc/play')
    assert.equal(withQuery('/formats/pack-blitz', { empty: undefined }), '/formats/pack-blitz')
  })
})
