import { test } from 'node:test'
import assert from 'node:assert/strict'
import { packWarsPoolDeck, packWarsReadiness, PACK_WARS_UNVERIFIED_MESSAGE } from './packWars'
import { loadSupport } from './savedDeck'
import { PtpPlayError } from '../playState'
import type { TxClient } from '../../../../lib/db'

const support = loadSupport('data/native-support/all.json')
const code = (e: unknown) => (e instanceof PtpPlayError ? e.code : String(e))
const owner = 'owner-1'
async function packCards() {
  const s = await support
  const sor = (type: string, n = 0) => [...s.catalog.values()].filter(c => c.type === type && c.engineId.startsWith('SOR_') && s.policy.supportedCardIds.has(c.engineId))[n]!
  return [sor('Leader'), sor('Base'), ...Array.from({ length: 14 }, (_, i) => sor('Unit', i)), sor('Leader', 1), sor('Base', 1), ...Array.from({ length: 14 }, (_, i) => sor('Event', i))]
    .map(c => ({ id: c.id, type: c.type, name: `Card ${c.engineId}` }))
}
function tx(rows: { pool?: Record<string, unknown> | null; evidence?: Record<string, unknown> | null }): TxClient & { sql: string[] } {
  const sql: string[] = []
  return {
    sql,
    query: async () => ({ rows: [], rowCount: 0 }) as never,
    queryRows: async () => [],
    queryRow: async (text: string) => { sql.push(text); return text.includes('ptp_native_pool_evidence') ? rows.evidence ?? null : rows.pool ?? null },
  }
}
const pool = { id: 'pool-1', share_id: 'share-1', user_id: owner, pool_type: 'pack_wars', parent_pool_id: null }

test('the player deck is built from the evidence stored at generation, never the editable pool', async () => {
  const s = await support, cards = await packCards()
  const evidence = { source_pool_id: 'pool-1', set_code: 'SOR', pool_type: 'pack_wars', pack_count: 2, cards: JSON.stringify(cards) }
  const { sourcePoolId, snapshot } = await packWarsPoolDeck(tx({ evidence }), { ...pool, cards: '[]' }, owner, { leaderId: cards[16]!.id, baseId: cards[1]!.id }, s)
  assert.equal(sourcePoolId, 'pool-1')
  assert.equal(snapshot.poolType, 'pack_wars')
  assert.equal(snapshot.deck.reduce((n, c) => n + c.count, 0), 28)
  assert.equal(snapshot.leader, s.catalog.get(cards[16]!.id)!.engineId)
})

test('pools opened before evidence existed are refused with a clear message, not backfilled', async () => {
  const s = await support
  const t = tx({ evidence: null })
  await assert.rejects(packWarsPoolDeck(t, pool, owner, { leaderId: 'l', baseId: 'b' }, s), (e: unknown) => code(e) === 'unverified_source' && (e as Error).message === PACK_WARS_UNVERIFIED_MESSAGE)
  assert.ok(t.sql.every(text => !/INSERT|UPDATE/i.test(text)))
  assert.deepEqual(await packWarsReadiness(tx({ pool, evidence: null }), 'share-1', owner, s), { ready: false, code: 'unverified_source', message: PACK_WARS_UNVERIFIED_MESSAGE })
})

test('only the owner’s own Pack Wars root pool qualifies', async () => {
  const s = await support, cards = await packCards()
  const evidence = { source_pool_id: 'pool-1', set_code: 'SOR', pool_type: 'pack_wars', pack_count: 2, cards }
  const choice = { leaderId: cards[0]!.id, baseId: cards[1]!.id }
  await assert.rejects(packWarsPoolDeck(tx({ evidence }), null, owner, choice, s), e => code(e) === 'deck_not_found')
  await assert.rejects(packWarsPoolDeck(tx({ evidence }), { ...pool, user_id: 'other' }, owner, choice, s), e => code(e) === 'deck_not_found')
  await assert.rejects(packWarsPoolDeck(tx({ evidence }), { ...pool, pool_type: 'sealed' }, owner, choice, s), e => code(e) === 'unsupported_format')
  await assert.rejects(packWarsPoolDeck(tx({ evidence }), { ...pool, parent_pool_id: 'root' }, owner, choice, s), e => code(e) === 'unverified_source')
  // Sealed evidence for the same id never stands in for Pack Wars evidence.
  await assert.rejects(packWarsPoolDeck(tx({ evidence: { ...evidence, pool_type: 'sealed' } }), pool, owner, choice, s), e => code(e) === 'unverified_source')
})

test('readiness names unsupported cards before the player picks a leader', async () => {
  const s = await support, cards = await packCards()
  const evidence = { source_pool_id: 'pool-1', set_code: 'SOR', pool_type: 'pack_wars', pack_count: 2, cards: [...cards, { id: 'nope', name: 'Mystery Card', type: 'Unit' }] }
  const result = await packWarsReadiness(tx({ pool, evidence }), 'share-1', owner, s)
  assert.equal(result.ready, false)
  assert.deepEqual('cards' in result ? result.cards : null, ['Mystery Card'])
  assert.deepEqual(await packWarsReadiness(tx({ pool, evidence: { ...evidence, cards } }), 'share-1', owner, s), { ready: true })
})
