import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TxClient } from '../../../../lib/db'
import { freezeSavedDeck, loadSupport } from './savedDeck'
function transaction(rows: (Record<string, unknown> | null)[]): TxClient {
  return { queryRow: async () => rows.shift() ?? null, query: async () => ({ rows: [], rowCount: 0, command: '', fields: [] }), queryRows: async () => [] }
}
it('does not certify historical mutable sealed pools from their displayed packs', async () => {
  const tx = transaction([{ id: 'pool', user_id: 'owner', pool_type: 'sealed', cards: [{ id: 'forged' }], packs: Array(6).fill({ cards: [] }) }, null])
  await assert.rejects(freezeSavedDeck(tx, 'owner', 'share', '/never-read'), { code: 'unverified_source' })
})
it('rejects builds borrowed from another player before card support lookup', async () => {
  const tx = transaction([{ id: 'build', user_id: 'owner', parent_pool_id: 'root' }, { id: 'root', user_id: 'other' }])
  await assert.rejects(freezeSavedDeck(tx, 'owner', 'share', '/never-read'), { code: 'unverified_source' })
})
it('freezes server draft picks even when browser pool cards were replaced', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ptp-support-'))
  try {
    const path = join(directory, 'support.json')
    await writeFile(path, JSON.stringify({ engineRevision: 'engine-rev', version: 'test-rev', supportedSets: ['SOR'], unrestrictedBaseIds: ['SOR_020'], cards: [
      { ptpId: 'l', engineId: 'SOR_001', type: 'Leader', rarity: 'Rare' },
      { ptpId: 'b', engineId: 'SOR_020', type: 'Base', rarity: 'Common' },
      { ptpId: 'u', engineId: 'SOR_100', type: 'Unit', rarity: 'Common' },
    ] }))
    const tx = transaction([
      { id: 'pool', user_id: 'owner', pool_type: 'draft', pod_id: 'pod', cards: [{ id: 'forged' }], deck_builder_state: { activeLeader: 'l', activeBase: 'b', cardPositions: { l: { card: { id: 'l' } }, b: { card: { id: 'b' } }, ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i, { section: 'deck', card: { id: 'u' } }])) } } },
      { id: 'pod', pod_type: 'draft', status: 'complete', set_code: 'SOR', all_packs: [[{ cards: [] }, { cards: [] }, { cards: [] }]] },
      { seat_number: 1, drafted_leaders: [{ id: 'l' }], drafted_cards: Array.from({ length: 30 }, () => ({ id: 'u' })) },
      { id: 'version' },
    ])
    const result = await freezeSavedDeck(tx, 'owner', 'share', path)
    assert.equal(result.id, 'version')
    assert.equal(result.snapshot.packCount, 3)
    assert.deepEqual(result.snapshot.deck, [{ id: 'SOR_100', count: 30 }])
    await writeFile(path, JSON.stringify({ engineRevision: 'engine-rev', version: 'bad', cards: [{ ptpId: 'same' }, { ptpId: 'same' }], supportedSets: [], unrestrictedBaseIds: [] }))
    await assert.rejects(loadSupport(path), /mapping/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
