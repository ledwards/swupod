import { test } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Explicit opt-in. This test only creates/drops its own disposable local database.
test('PostgreSQL private reservations, immutable migrations and cross-mode admission', { skip: process.env.NATIVE_LOCAL_DB_TEST !== '1' }, async () => {
  const database = `ptp_native_test_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Client({ host: '/tmp', database: 'postgres' })
  const directory = await mkdtemp(join(tmpdir(), 'ptp-native-db-'))
  await admin.connect()
  await admin.query(`CREATE DATABASE ${database}`)
  const connection = new pg.Client({ host: '/tmp', database })
  await connection.connect()
  try {
    process.env.DATABASE_URL = `postgresql://${process.env.USER}@localhost/${database}`
    process.env.PTP_NATIVE_PLAY_ENABLED = 'true'
    Object.assign(process.env, { BAIZE_PVP_URL: 'http://localhost:4321', BAIZE_PVP_SERVICE_KEY: 'test', PURRGIL_INTERNAL_URL: 'http://localhost:4322', PURRGIL_HOST_SERVICE_KEY: 'test', PURRGIL_PUBLIC_ORIGIN: 'http://localhost:4322', PTP_PUBLIC_ORIGIN: 'http://localhost:4323', PTP_NATIVE_INVITE_KEY: 'disposable-test-invite-key', PTP_NATIVE_SUPPORT_PATH: join(directory, 'support.json') })
    await connection.query(`CREATE TABLE users (id UUID PRIMARY KEY, auth_version INTEGER DEFAULT 1,username TEXT,avatar_url TEXT);
      CREATE TABLE card_pools (id UUID PRIMARY KEY, user_id UUID, share_id TEXT UNIQUE, parent_pool_id UUID, pod_id UUID, set_code TEXT, set_name TEXT, pool_type TEXT, name TEXT, cards JSONB, packs JSONB, deck_builder_state JSONB, created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());`)
    for (const file of ['074_create_ptp_play_runtime.sql', '075_add_forceteki_seat_launch_urls.sql', '096_native_deck_versions.sql', '097_native_private_matches.sql', '098_native_reconciliation.sql', '099_native_mutual_rematches.sql', '100_solo_sealed_generation.sql']) await connection.query(await readFile(join(process.cwd(), 'migrations', file), 'utf8'))
    // Re-running additive migrations must be harmless.
    for (const file of ['096_native_deck_versions.sql', '097_native_private_matches.sql', '098_native_reconciliation.sql', '099_native_mutual_rematches.sql', '100_solo_sealed_generation.sql']) await connection.query(await readFile(join(process.cwd(), 'migrations', file), 'utf8'))
    await writeFile(process.env.PTP_NATIVE_SUPPORT_PATH!, JSON.stringify({ engineRevision: 'test-engine', version: 'test-v1', supportedSets: ['SOR'], unrestrictedBaseIds: ['SOR_020'], cards: [
      { ptpId: 'l',engineId:'SOR_001',type:'Leader',rarity:'Rare'}, {ptpId:'b',engineId:'SOR_020',type:'Base',rarity:'Common'}, {ptpId:'u',engineId:'SOR_100',type:'Unit',rarity:'Common'},
    ] }))
    const users = Array.from({ length: 4 }, () => randomUUID())
    const pools = Array.from({ length: 4 }, () => randomUUID())
    const state = { activeLeader: 'l', activeBase: 'b', cardPositions: { l: { card: {id:'l',name:'Leader',isLeader:true} }, b: {card:{id:'b',name:'Base',isBase:true}}, ...Object.fromEntries(Array.from({length:30},(_,i)=>[i,{section:'deck',card:{id:'u',name:'Unit'}}])) } }
    for (let i=0;i<users.length;i++) {
      await connection.query('INSERT INTO users(id) VALUES($1)',[users[i]])
      await connection.query("INSERT INTO card_pools(id,user_id,share_id,set_code,pool_type,cards,deck_builder_state) VALUES($1,$2,$3,'SOR','sealed','[]',$4)",[pools[i],users[i],`share-${i}`,JSON.stringify(state)])
      await connection.query("INSERT INTO ptp_native_pool_evidence(source_pool_id,owner_user_id,set_code,pool_type,pack_count,cards) VALUES($1,$2,'SOR','sealed',6,$3)",[pools[i],users[i],JSON.stringify([{id:'l'},...Array.from({length:30},()=>({id:'u'}))])])
    }
    const { createInvitation, invitation, getMatch, launchMatch } = await import('./privateMatches')
    const { enterLimitedQueue } = await import('../playLedger')
    const request = randomUUID()
    const repeated = await Promise.all([createInvitation(users[0]!, 'share-0', request, false), createInvitation(users[0]!, 'share-0', request, false)])
    assert.equal(repeated[0].matchId, repeated[1].matchId)
    assert.equal(repeated[0].token, repeated[1].token)
    const joined = await Promise.allSettled([invitation(repeated[0].token, users[1]!, 'share-1'), invitation(repeated[0].token, users[2]!, 'share-2')])
    assert.equal(joined.filter(v=>v.status==='fulfilled').length,1)
    assert.equal((await connection.query('SELECT COUNT(*)::int AS count FROM ptp_native_match_seats WHERE match_id=$1',[repeated[0].matchId])).rows[0].count,2)
    await assert.rejects(connection.query("UPDATE ptp_play_deck_versions SET snapshot=snapshot"), /immutable/)
    await connection.query('DELETE FROM card_pools WHERE id=$1',[pools[0]])
    assert.equal((await connection.query('SELECT COUNT(*)::int AS count FROM ptp_play_deck_versions WHERE pool_id=$1',[pools[0]])).rows[0].count,1)
    // Terminal rematch requires both independent consents and keeps exact snapshots.
    await connection.query("UPDATE ptp_native_matches SET status='complete',result='player1' WHERE id=$1",[repeated[0].matchId])
    await connection.query('UPDATE ptp_native_match_seats SET released_at=NOW() WHERE match_id=$1',[repeated[0].matchId])
    const { rematch } = await import('./rematches')
    const opponent = (await connection.query('SELECT user_id FROM ptp_native_match_seats WHERE match_id=$1 AND seat=1',[repeated[0].matchId])).rows[0].user_id
    assert.equal((await rematch(repeated[0].matchId,users[0]!,true)).status,'waiting')
    assert.equal((await rematch(repeated[0].matchId,opponent,false)).status,'declined')
    assert.equal((await rematch(repeated[0].matchId,users[0]!,true)).status,'waiting')
    const accepted = await Promise.all([rematch(repeated[0].matchId,opponent,true),rematch(repeated[0].matchId,opponent,true)])
    assert.equal(accepted[0].status,'ready')
    assert.equal(accepted[0].matchId,accepted[1].matchId)
    const snapshots = (await connection.query('SELECT deck_version_id FROM ptp_native_match_seats WHERE match_id=$1 ORDER BY seat',[accepted[0].matchId])).rows
    const originals = (await connection.query('SELECT deck_version_id FROM ptp_native_match_seats WHERE match_id=$1 ORDER BY seat',[repeated[0].matchId])).rows
    assert.deepEqual(snapshots,originals)
    const { reconcileNativePlay, revokeNativeSubject } = await import('./reconciliation')
    const originalFetch = globalThis.fetch
    try {
      // Resume the pinned runtime without reading a newer/broken support manifest.
      const supportBefore=await readFile(process.env.PTP_NATIVE_SUPPORT_PATH!,'utf8')
      await writeFile(process.env.PTP_NATIVE_SUPPORT_PATH!,'new policy is not readable by this old game')
      await connection.query("UPDATE ptp_native_matches SET status='active',engine_revision='test-engine' WHERE id=$1",[accepted[0].matchId])
      globalThis.fetch=async(url,init)=>{
        if(String(url).endsWith('/internal/launch'))return Response.json({launchUrl:'http://localhost:4322/launch?code=test'})
        assert.equal(init?.method,'GET');assert.ok(!String(url).endsWith('/v1/support'))
        return Response.json({matchId:accepted[0].matchId,issuer:'ptp',engineRevision:'test-engine',step:1,status:'in_progress'})
      }
      assert.ok('launchUrl' in await launchMatch(String(accepted[0].matchId),users[0]!,Date.now()+60000))
      globalThis.fetch=async()=>Response.json({matchId:accepted[0].matchId,issuer:'ptp',engineRevision:'wrong-engine',step:1,status:'in_progress'})
      await assert.rejects(launchMatch(String(accepted[0].matchId),users[0]!,Date.now()+60000),/revision mismatch/)
      globalThis.fetch=async()=>new Response('{}',{status:404})
      await assert.rejects(launchMatch(String(accepted[0].matchId),users[0]!,Date.now()+60000),{code:'runtime_not_found'})
      assert.equal((await connection.query('SELECT status FROM ptp_native_matches WHERE id=$1',[accepted[0].matchId])).rows[0].status,'active')
      await writeFile(process.env.PTP_NATIVE_SUPPORT_PATH!,supportBefore)
      await connection.query("UPDATE ptp_native_matches SET status='starting',engine_revision=NULL WHERE id=$1",[accepted[0].matchId])
      globalThis.fetch = async () => new Response('{}',{status:404})
      assert.equal((await getMatch(String(accepted[0].matchId),users[0]!)).status,'starting')
      globalThis.fetch = async () => new Response('{}',{status:503})
      assert.equal((await reconcileNativePlay()).failures,1)
      assert.equal((await connection.query('SELECT status FROM ptp_native_matches WHERE id=$1',[accepted[0].matchId])).rows[0].status,'starting')
      await revokeNativeSubject(users[0]!)
      assert.equal((await connection.query('SELECT COUNT(*)::int AS count FROM ptp_native_session_revocations')).rows[0].count,1)
      await connection.query('UPDATE ptp_native_matches SET next_reconcile_at=NOW()')
      globalThis.fetch = async (url) => String(url).endsWith('/internal/revoke') ? Response.json({revoked:true}) : Response.json({matchId:accepted[0].matchId,issuer:'ptp',engineRevision:'test-engine',step:7,status:'complete',returns:[1,-1]})
      assert.equal((await reconcileNativePlay()).failures,0)
      const terminal = (await connection.query('SELECT status,result,terminal_step FROM ptp_native_matches WHERE id=$1',[accepted[0].matchId])).rows[0]
      assert.equal(terminal.status,'complete'); assert.equal(terminal.result,'player1'); assert.equal(Number(terminal.terminal_step),7)
      assert.equal((await connection.query('SELECT COUNT(*)::int AS count FROM ptp_native_session_revocations')).rows[0].count,0)
      assert.equal((await reconcileNativePlay()).checked,0)
    } finally { globalThis.fetch = originalFetch }
    // Create failures with uncertain outcomes keep reservations. A definitive
    // rejection releases both seats and creates no fabricated game result.
    await rematch(String(accepted[0].matchId),users[0]!,true)
    const rejectedChild=await rematch(String(accepted[0].matchId),opponent,true)
    const savedFetch=globalThis.fetch
    try {
      for(const outcome of [503,409,'network',400] as const){
        globalThis.fetch=async(url,init)=>{
          if(String(url).endsWith('/v1/support'))return Response.json({engineRevision:'test-engine',protocolVersion:1})
          if(init?.method==='POST'){
            if(outcome==='network')throw new Error('network interrupted')
            return new Response('{}',{status:outcome})
          }
          return new Response('{}',{status:404})
        }
        await assert.rejects(launchMatch(String(rejectedChild.matchId),users[0]!,Date.now()+60000))
        const row=(await connection.query('SELECT status,result FROM ptp_native_matches WHERE id=$1',[rejectedChild.matchId])).rows[0]
        assert.equal(row.status,outcome===400?'cancelled':'starting');assert.equal(row.result,null)
        const held=(await connection.query('SELECT COUNT(*)::int AS n FROM ptp_native_match_seats WHERE match_id=$1 AND released_at IS NULL',[rejectedChild.matchId])).rows[0].n
        assert.equal(held,outcome===400?0:2)
      }
    }finally{globalThis.fetch=savedFetch}
    const waiting=await createInvitation(users[3]!,'share-3',randomUUID(),false)
    process.env.PTP_NATIVE_PLAY_ENABLED='false'
    try{
      assert.equal((await invitation(waiting.token,users[3]!)).status,'waiting')
      await assert.rejects(invitation(waiting.token,opponent,'share-1'),{code:'native_disabled'})
      assert.equal((await invitation(waiting.token,users[3]!,undefined,true)).status,'cancelled')
    }finally{process.env.PTP_NATIVE_PLAY_ENABLED='true'}
    // The same player cannot win both a legacy queue and native invitation race.
    const race = await Promise.allSettled([createInvitation(users[3]!, 'share-3', randomUUID(), false), enterLimitedQueue({userId:users[3]!,poolShareId:'share-3'})])
    assert.equal(race.filter(v=>v.status==='fulfilled').length,1)
    assert.equal(race.filter(v=>v.status==='rejected').length,1)
    const rejected = race.find(v=>v.status==='rejected') as PromiseRejectedResult
    assert.equal(rejected.reason.code, 'already_playing')
  } finally {
    const { closePool } = await import('../../../../lib/db')
    await closePool()
    await connection.end()
    await admin.query(`DROP DATABASE ${database} WITH (FORCE)`)
    await admin.end()
    await rm(directory, { recursive: true, force: true })
  }
})
