import { test } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Explicit opt-in. This test only creates/drops its own disposable local database.
test('nativeDecks omits unverifiable pools instead of listing dead rows', { skip: process.env.NATIVE_LOCAL_DB_TEST !== '1' }, async () => {
  const database = `ptp_decks_test_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Client({ host: '/tmp', database: 'postgres' })
  const directory = await mkdtemp(join(tmpdir(), 'ptp-decks-db-'))
  await admin.connect()
  await admin.query(`CREATE DATABASE ${database}`)
  const connection = new pg.Client({ host: '/tmp', database })
  await connection.connect()
  try {
    process.env.DATABASE_URL = `postgresql://${process.env.USER}@localhost/${database}`
    process.env.PTP_NATIVE_PLAY_ENABLED = 'true'
    Object.assign(process.env, { NODE_ENV: 'development', PTP_NATIVE_LOCAL_TESTING: 'true', BAIZE_PVP_URL: 'http://localhost:4321', BAIZE_PVP_SERVICE_KEY: 'test', PURRGIL_INTERNAL_URL: 'http://localhost:4322', PURRGIL_HOST_SERVICE_KEY: 'test', PURRGIL_PUBLIC_ORIGIN: 'http://localhost:4322', PTP_PUBLIC_ORIGIN: 'http://localhost:4323', PTP_NATIVE_INVITE_KEY: 'disposable-test-invite-key', PTP_NATIVE_SUPPORT_PATH: join(directory, 'support.json') })
    await connection.query(`CREATE TABLE card_pools (id UUID PRIMARY KEY, user_id UUID, share_id TEXT UNIQUE, parent_pool_id UUID, pod_id UUID, hidden BOOLEAN DEFAULT FALSE, set_code TEXT, set_name TEXT, pool_type TEXT, name TEXT, cards JSONB, packs JSONB, deck_builder_state JSONB, created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());`)
    await connection.query(`CREATE TABLE pods (id UUID PRIMARY KEY, competitive BOOLEAN, draft_state TEXT, deck_lock_at TIMESTAMPTZ, decks_unlocked BOOLEAN, settings JSONB, status TEXT);`)
    await connection.query(`CREATE TABLE ptp_native_pool_evidence (source_pool_id UUID PRIMARY KEY, owner_user_id UUID NOT NULL, set_code TEXT NOT NULL, pool_type TEXT NOT NULL, pack_count INTEGER NOT NULL, cards JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());`)
    await writeFile(process.env.PTP_NATIVE_SUPPORT_PATH!, JSON.stringify({ engineRevision: 'test-engine', version: 'test-v1', supportedSets: ['SOR'], unrestrictedBaseIds: ['SOR_020'], cards: [
      { ptpId: 'l', engineId: 'SOR_001', type: 'Leader', rarity: 'Rare' }, { ptpId: 'b', engineId: 'SOR_020', type: 'Base', rarity: 'Common' }, { ptpId: 'u', engineId: 'SOR_100', type: 'Unit', rarity: 'Common' },
    ] }))
    const user = randomUUID()
    const verified = randomUUID(), legacy = randomUUID(), outOfSet = randomUUID()
    const state = { activeLeader: 'l', activeBase: 'b', cardPositions: { l: { card: { id: 'l', name: 'Leader', isLeader: true } }, b: { card: { id: 'b', name: 'Base', isBase: true } }, ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i, { section: 'deck', card: { id: 'u', name: 'Unit' } }])) } }
    // The out-of-curriculum pool has no started deck, so it cannot serve local practice either.
    const unstarted = { activeLeader: null, activeBase: null, cardPositions: {} }
    for (const [id, share, set, deckState] of [[verified, 'share-verified', 'SOR', state], [legacy, 'share-legacy', 'SOR', state], [outOfSet, 'share-ash', 'ASH', unstarted]] as const) {
      await connection.query("INSERT INTO card_pools(id,user_id,share_id,set_code,pool_type,cards,deck_builder_state) VALUES($1,$2,$3,$4,'sealed','[]',$5)", [id, user, share, set, JSON.stringify(deckState)])
    }
    const cards = JSON.stringify([{ id: 'l' }, ...Array.from({ length: 30 }, () => ({ id: 'u' }))])
    await connection.query("INSERT INTO ptp_native_pool_evidence(source_pool_id,owner_user_id,set_code,pool_type,pack_count,cards) VALUES($1,$2,'SOR','sealed',6,$3)", [verified, user, cards])
    await connection.query("INSERT INTO ptp_native_pool_evidence(source_pool_id,owner_user_id,set_code,pool_type,pack_count,cards) VALUES($1,$2,'ASH','sealed',6,$3)", [outOfSet, user, cards])
    const { nativeDecks } = await import('./decks')
    const result = await nativeDecks(user)
    assert.equal(result.decks.length, 2)
    assert.equal(result.decks.find(deck => deck.poolShareId === 'share-verified')?.ready, true)
    // The legacy pool cannot enter the lobby but stays selectable for local practice.
    assert.equal(result.decks.find(deck => deck.poolShareId === 'share-legacy')?.ready, false)
    assert.equal(result.hiddenCount, 1)
    assert.ok(!result.decks.some(deck => (deck.blocker ?? '').includes('generation record') || (deck.blocker ?? '').includes('immutable') || (deck.blocker ?? '').includes('configured engine')), 'no internal jargon reaches the picker')
    const unbuilt=randomUUID(),privateOther=randomUUID(),hidden=randomUUID()
    await connection.query("INSERT INTO card_pools(id,user_id,share_id,set_code,pool_type,cards,packs) VALUES($1,$2,'unbuilt-pool','SOR','sealed','[]','[[],[],[],[],[],[]]')",[unbuilt,user])
    await connection.query("INSERT INTO card_pools(id,user_id,share_id,set_code,pool_type,cards) VALUES($1,$2,'someone-elses','SOR','sealed','[]')",[privateOther,randomUUID()])
    await connection.query("INSERT INTO card_pools(id,user_id,share_id,set_code,pool_type,cards,hidden) VALUES($1,$2,'hidden-pool','SOR','sealed','[]',true)",[hidden,user])
    const library=await nativeDecks(user,undefined,{includeUnplayable:true})
    assert.equal(library.decks.length,4)
    assert.equal(library.decks.find(d=>d.poolShareId==='share-verified')?.ready,true)
    assert.equal(library.decks.find(d=>d.poolShareId==='share-ash')?.ready,false)
    const unopened=library.decks.find(d=>d.poolShareId==='unbuilt-pool')!
    assert.equal(unopened.hasDeck,false);assert.equal(unopened.ready,false);assert.equal(unopened.packCount,6)
    assert.equal(unopened.editUrl,'http://localhost:4323/pool/unbuilt-pool/deck')
    assert.equal(library.hiddenCount,0)
    assert.ok(!library.decks.some(d=>['someone-elses','hidden-pool'].includes(d.poolShareId)))
    assert.ok(!(await nativeDecks(user,'someone-elses',{includeUnplayable:true})).decks.some(d=>d.poolShareId==='someone-elses'))
    const {ownedPool}=await import('./library')
    const detail=await ownedPool(user,'unbuilt-pool')
    assert.equal(detail.pool.hasDeck,false);assert.deepEqual(detail.pool.cards,[])
    assert.equal('ready' in detail.pool,false,'Library details are not an admission decision')
    await assert.rejects(()=>ownedPool(user,'someone-elses'),/Pool not found/)
    await assert.rejects(()=>ownedPool(user,'hidden-pool'),/Pool not found/)
    await connection.query("INSERT INTO card_pools(id,user_id,share_id,set_code,pool_type,cards) SELECT gen_random_uuid(),$1,'unbuilt-'||n,'SOR','sealed','[]'::jsonb FROM generate_series(1,101) AS n",[user])
    assert.equal((await nativeDecks(user,undefined,{includeUnplayable:true})).decks.length,105,'The shared library must not silently stop at 100 saved pools')

    for(let n=0;n<20;n++)await connection.query("INSERT INTO card_pools(id,user_id,share_id,parent_pool_id,set_code,pool_type,cards,deck_builder_state) VALUES($1,$2,$3,$4,'SOR','sealed','[]',$5)",[randomUUID(),user,`alternate-${n}`,verified,JSON.stringify(state)])
    let reads=0
    const original=pg.Client.prototype.query
    pg.Client.prototype.query=function(...args:any[]){if(String(args[0]).trim().startsWith('SELECT'))reads++;return (original as any).apply(this,args)} as any
    try {
      const many=await nativeDecks(user)
      assert.equal(many.decks.filter(d=>d.poolShareId.startsWith('alternate-')&&d.ready).length,20)
      assert.ok(reads<=5,`Deck listing must batch source validation, used ${reads} SELECT queries`)
    }finally{pg.Client.prototype.query=original}

  } finally {
    const { closePool } = await import('../../../../lib/db')
    await closePool()
    await connection.end()
    await admin.query(`DROP DATABASE ${database} WITH (FORCE)`)
    await admin.end()
    await rm(directory, { recursive: true, force: true })
  }
})
