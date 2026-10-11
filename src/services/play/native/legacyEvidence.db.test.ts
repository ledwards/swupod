import { test } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Explicit opt-in. This test only creates/drops its own disposable local database.
test('older sealed pools play once their stored packs verify', { skip: process.env.NATIVE_LOCAL_DB_TEST !== '1' }, async () => {
  const database = `ptp_legacy_test_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Client({ host: '/tmp', database: 'postgres' })
  const directory = await mkdtemp(join(tmpdir(), 'ptp-legacy-db-'))
  await admin.connect()
  await admin.query(`CREATE DATABASE ${database}`)
  const connection = new pg.Client({ host: '/tmp', database })
  await connection.connect()
  try {
    process.env.DATABASE_URL = `postgresql://${process.env.USER}@localhost/${database}`
    Object.assign(process.env, { NODE_ENV: 'development', PTP_NATIVE_PLAY_ENABLED: 'true', PTP_NATIVE_LOCAL_TESTING: 'true', BAIZE_PVP_URL: 'http://localhost:4321', BAIZE_PVP_SERVICE_KEY: 'test', PURRGIL_INTERNAL_URL: 'http://localhost:4322', PURRGIL_HOST_SERVICE_KEY: 'test', PURRGIL_PUBLIC_ORIGIN: 'http://localhost:4322', PTP_PUBLIC_ORIGIN: 'http://localhost:4323', PTP_NATIVE_INVITE_KEY: 'disposable-test-invite-key', PTP_NATIVE_SUPPORT_PATH: join(directory, 'support.json') })
    await connection.query(`CREATE TABLE users (id UUID PRIMARY KEY, username TEXT);
      CREATE TABLE card_pools (id UUID PRIMARY KEY, user_id UUID, share_id TEXT UNIQUE, parent_pool_id UUID, pod_id UUID, hidden BOOLEAN DEFAULT FALSE, set_code TEXT, set_name TEXT, pool_type TEXT, name TEXT, cards JSONB, packs JSONB, deck_builder_state JSONB, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE pods (id UUID PRIMARY KEY, pod_type TEXT, set_code TEXT, all_packs JSONB, competitive BOOLEAN, draft_state TEXT, deck_lock_at TIMESTAMPTZ, decks_unlocked BOOLEAN, settings JSONB, status TEXT);
      CREATE TABLE pod_players (pod_id UUID, user_id UUID, seat_number INT, drafted_leaders JSONB, drafted_cards JSONB);
      CREATE TABLE ptp_native_pool_evidence (source_pool_id UUID PRIMARY KEY, owner_user_id UUID NOT NULL, set_code TEXT NOT NULL, pool_type TEXT NOT NULL CHECK (pool_type = 'sealed'), pack_count INTEGER NOT NULL CHECK (pack_count > 0), cards JSONB NOT NULL CHECK (jsonb_typeof(cards) = 'array'), created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE ptp_play_deck_versions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), pool_id UUID, source_pool_id UUID, owner_user_id UUID, content_hash TEXT, snapshot JSONB, UNIQUE(pool_id, content_hash));
      CREATE TABLE ptp_solo_ai_runs (id UUID PRIMARY KEY, owner_user_id UUID, request_id UUID, pool_share_id TEXT, prepared JSONB, best_of_three BOOLEAN, created_at TIMESTAMPTZ DEFAULT NOW());`)

    const { initializeCardCache } = await import('../../../utils/cardCache')
    const { generateSealedBox } = await import('../../../utils/boosterPack')
    const { getAllCards } = await import('../../../utils/cardData')
    await initializeCardCache()
    const byId = new Map(getAllCards().map(c => [String(c.id), c]))
    const packs = generateSealedBox([], 'SOR', 24).slice(0, 6).map((p: any) => ({ cards: (p.cards ?? p).map((c: any) => ({ id: c.id })) }))
    const cards = packs.flatMap(p => p.cards)
    const ids = [...new Set(cards.map(c => c.id))]
    await writeFile(process.env.PTP_NATIVE_SUPPORT_PATH!, JSON.stringify({ engineRevision: 'test-engine', version: 'test-v1', supportedSets: ['SOR'], unrestrictedBaseIds: [],
      cards: ids.map((id, i) => ({ ptpId: id, engineId: `SOR_${String(i + 1).padStart(3, '0')}`, type: byId.get(id)!.type, rarity: byId.get(id)!.rarity })) }))
    const of = (type: string) => cards.filter(c => byId.get(c.id)!.type === type)
    const main = cards.filter(c => ['Unit', 'Event', 'Upgrade'].includes(String(byId.get(c.id)!.type))).slice(0, 30)
    const state = { activeLeader: 'l', activeBase: 'b', cardPositions: { l: { card: of('Leader')[0] }, b: { card: of('Base')[0] }, ...Object.fromEntries(main.map((card, i) => [i, { section: 'deck', card }])) } }

    const user = randomUUID(), pod = randomUUID()
    await connection.query('INSERT INTO users(id,username) VALUES($1,$2)', [user, 'Owner'])
    const add = (share: string, createdAt: string, extra: {podId?: string; cards?: unknown} = {}) => connection.query(
      "INSERT INTO card_pools(id,user_id,share_id,set_code,pool_type,name,cards,packs,deck_builder_state,pod_id,created_at) VALUES($1,$2,$3,'SOR','sealed',$3,$4,$5,$6,$7,$8)",
      [randomUUID(), user, share, JSON.stringify(extra.cards ?? cards), JSON.stringify(packs), JSON.stringify(state), extra.podId ?? null, createdAt])
    await add('legacy', '2026-09-01T12:00:00Z')
    await add('recent', new Date().toISOString())
    await add('tampered', '2026-09-01T12:00:00Z', { cards: cards.slice(1) })
    await add('pod-pool', new Date().toISOString(), { podId: pod })
    await connection.query("INSERT INTO pods(id,pod_type,set_code,status) VALUES($1,'sealed','SOR','complete')", [pod])
    await connection.query('INSERT INTO pod_players(pod_id,user_id,seat_number) VALUES($1,$2,1)', [pod, user])

    const { nativeDecks } = await import('./decks')
    const picker = await nativeDecks(user, undefined, { includeUnplayable: true, hideUnverified: true })
    const ready = (share: string) => picker.decks.find(d => d.poolShareId === share)?.ready
    assert.equal(ready('legacy'), true)
    assert.equal(ready('pod-pool'), true)
    assert.ok(!picker.decks.some(d => d.poolShareId === 'recent' || d.poolShareId === 'tampered'), 'the picker never offers a pool admission would refuse')
    assert.equal(picker.hiddenCount, 2)
    const library = await nativeDecks(user, undefined, { includeUnplayable: true })
    assert.equal(library.decks.find(d => d.poolShareId === 'recent')?.blocker, 'This pool is not available for table play.')
    assert.equal((await connection.query('SELECT 1 FROM ptp_native_pool_evidence')).rowCount, 0, 'listing does not write evidence')

    const { withTransaction } = await import('../../../../lib/db')
    const { freezeSavedDeck } = await import('./savedDeck')
    const frozen = await withTransaction(tx => freezeSavedDeck(tx, user, 'legacy', process.env.PTP_NATIVE_SUPPORT_PATH!))
    assert.equal(frozen.snapshot.provenance, 'server-sealed')
    assert.equal(frozen.snapshot.packCount, 6)
    const evidence = (await connection.query("SELECT e.* FROM ptp_native_pool_evidence e JOIN card_pools p ON p.id=e.source_pool_id WHERE p.share_id='legacy'")).rows[0]
    assert.deepEqual(evidence.cards.map((c: {id: string}) => c.id), cards.map(c => c.id))
    assert.equal(evidence.pack_count, 6)
    // Admission is repeatable once the evidence exists.
    assert.equal((await withTransaction(tx => freezeSavedDeck(tx, user, 'legacy', process.env.PTP_NATIVE_SUPPORT_PATH!))).id, frozen.id)
    await withTransaction(tx => freezeSavedDeck(tx, user, 'pod-pool', process.env.PTP_NATIVE_SUPPORT_PATH!))
    for (const share of ['recent', 'tampered']) await assert.rejects(withTransaction(tx => freezeSavedDeck(tx, user, share, process.env.PTP_NATIVE_SUPPORT_PATH!)), { code: 'unverified_source' })
    assert.equal((await connection.query('SELECT 1 FROM ptp_native_pool_evidence')).rowCount, 2)

    const { soloStatus } = await import('../../../../lib/play/soloStatus')
    assert.equal((await soloStatus(user, 'tampered')).unavailableReason, 'This pool is not available for AI play.')
    await connection.query("DELETE FROM ptp_native_pool_evidence")
    assert.equal((await soloStatus(user, 'legacy')).unavailableReason, null)
    assert.equal((await soloStatus(user, 'pod-pool')).unavailableReason, null)
  } finally {
    const { closePool } = await import('../../../../lib/db')
    await closePool()
    await connection.end()
    await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`)
    await admin.end()
    await rm(directory, { recursive: true, force: true })
  }
})
