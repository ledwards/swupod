import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initializeCardCache } from '../../../utils/cardCache'
import { generateSealedBox } from '../../../utils/boosterPack'
import { getAllCards } from '../../../utils/cardData'
import { LEGACY_SEALED_CUTOFF, legacySealedEvidence, plausibleBooster } from './legacyEvidence'

const before = new Date(LEGACY_SEALED_CUTOFF.getTime() - 86400000).toISOString()
const after = new Date(LEGACY_SEALED_CUTOFF.getTime() + 60000).toISOString()
async function packs(set: string, count = 6) {
  await initializeCardCache()
  return generateSealedBox([], set, 24).slice(0, count).map((p: any) => ({ cards: (p.cards ?? p).map((c: any) => ({ id: c.id, name: c.name, rarity: c.rarity })) }))
}
function pool(stored: { cards: { id: string }[] }[], extra: Record<string, unknown> = {}) {
  return { id: 'root', user_id: 'owner', pool_type: 'sealed', set_code: 'SOR', created_at: before, packs: JSON.stringify(stored), cards: stored.flatMap(p => p.cards), ...extra }
}

test('every set the generator deals passes the booster check', async () => {
  for (const set of ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW', 'ASH', 'HMW', 'JTL-CB', 'LOF-CB', 'SEC-CB', 'LAW-CB', 'ASH-CB']) {
    for (let box = 0; box < 5; box++) for (const pack of await packs(set, 24)) assert.ok(plausibleBooster(pack.cards.map(c => c.id), set), `${set} pack rejected`)
  }
})

test('older solo pools are verified from packs that add up to their cards', async () => {
  const stored = await packs('SOR')
  const evidence = legacySealedEvidence(pool(stored), 'owner')
  assert.equal(evidence?.setCode, 'SOR')
  assert.equal(evidence?.packCount, 6)
  assert.deepEqual(evidence?.cards.map(c => c.id), stored.flatMap(p => p.cards.map(c => c.id)))
  assert.equal(legacySealedEvidence(pool(await packs('SOR', 8)), 'owner')?.packCount, 8)
})

test('pools that cannot be trusted stay unverified', async () => {
  const stored = await packs('SOR')
  const legendaries = getAllCards().filter(c => c.set === 'SOR' && c.rarity === 'Legendary' && c.type === 'Unit')
  const typeOf = (id: string) => String(getAllCards().find(x => x.id === id)?.type)
  let swapped = 0
  const stacked = stored.map((p, i) => i ? p : { cards: p.cards.map(c => swapped < 4 && !['Leader', 'Base'].includes(typeOf(c.id)) ? { id: String(legendaries[swapped++]!.id) } : c) })
  const offSet = stored.map((p, i) => i ? p : { cards: [{ id: String(getAllCards().find(c => c.set === 'SHD' && c.type === 'Unit')!.id) }, ...p.cards.slice(1)] })
  const cases: [string, Record<string, unknown> | null][] = [
    ['opened after evidence existed', pool(stored, { created_at: after })],
    ['no creation time', pool(stored, { created_at: null })],
    ['cards differ from packs', pool(stored, { cards: stored.flatMap(p => p.cards).slice(1) })],
    ['stacked rares', pool(stacked)],
    ['card from another set', pool(offSet)],
    ['seven packs', pool([...stored, stored[0]!])],
    ['someone else\'s pool', pool(stored, { user_id: 'other' })],
    ['an alternate build', pool(stored, { parent_pool_id: 'other' })],
    ['a draft pool', pool(stored, { pool_type: 'draft' })],
    ['empty packs', pool(Array.from({ length: 6 }, () => ({ cards: [] })))],
    ['malformed packs', pool(stored, { packs: '{oops' })],
  ]
  for (const [name, row] of cases) assert.equal(legacySealedEvidence(row!, 'owner'), null, name)
})

test('server-dealt pod pools are verified through their pod at any age', async () => {
  const stored = await packs('SOR')
  const row = pool(stored, { pod_id: 'pod', created_at: after })
  const pod = { id: 'pod', pod_type: 'sealed', set_code: 'SOR' }
  assert.equal(legacySealedEvidence(row, 'owner', pod, { pod_id: 'pod', seat_number: 2 })?.packCount, 6)
  assert.equal(legacySealedEvidence(row, 'owner', pod, null), null, 'owner must be seated in the pod')
  assert.equal(legacySealedEvidence(row, 'owner', { ...pod, pod_type: 'draft' }, { pod_id: 'pod' }), null)
  assert.equal(legacySealedEvidence(row, 'owner', { ...pod, set_code: 'SHD' }, { pod_id: 'pod' }), null)
  assert.equal(legacySealedEvidence({ ...row, cards: [] }, 'owner', pod, { pod_id: 'pod' }), null)
})
