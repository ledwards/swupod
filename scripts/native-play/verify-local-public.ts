/** Real PostgreSQL acceptance spec; only isolated loopback fixtures are writable. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { parse } from 'dotenv'
import pg from 'pg'
const directory=process.argv[2]??'/tmp/ptp-native-fullstack'
const env=parse(await readFile(`${directory}/fixture.env`,'utf8'))
const url=new URL(env.DATABASE_URL!)
if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.startsWith('/ptp_native_fixture_'))throw new Error('Isolated local fixture required')
Object.assign(process.env,env)
const db=new pg.Client({connectionString:env.DATABASE_URL});await db.connect()
try {
  const {nativeDecks}=await import('../../src/services/play/native/decks')
  const {createInvitation}=await import('../../src/services/play/native/privateMatches')
  const {findPublicMatch,joinPublicMatch,cancelPublicMatch,listPublicMatches}=await import('../../src/services/play/native/publicMatches')
  await db.query(await readFile('migrations/101_native_public_matches.sql','utf8'))
  // Retire only prior synthetic public-test reservations; never browser fixtures.
  await db.query("UPDATE ptp_native_matches SET status='cancelled' WHERE creator_user_id IN (SELECT id FROM users WHERE username='Synthetic Public Fixture') AND status IN ('waiting','starting')")
  await db.query("UPDATE ptp_native_match_seats SET released_at=NOW() WHERE match_id IN (SELECT id FROM ptp_native_matches WHERE status='cancelled') AND user_id IN (SELECT id FROM users WHERE username='Synthetic Public Fixture')")
  const template=(await db.query("SELECT p.*,e.cards AS evidence FROM card_pools p JOIN ptp_native_pool_evidence e ON e.source_pool_id=p.id WHERE p.deck_builder_state->>'activeLeader' IS NOT NULL LIMIT 1")).rows[0]
  const users=[]
  for(let i=0;i<11;i++){
    const id=randomUUID(),pool=randomUUID(),share=`public-test-${pool}`
    await db.query('INSERT INTO users(id,username) VALUES($1,$2)',[id,'Synthetic Public Fixture'])
    await db.query('INSERT INTO card_pools(id,user_id,share_id,set_code,pool_type,cards,deck_builder_state) VALUES($1,$2,$3,$4,$5,$6,$7)',[pool,id,share,template.set_code,template.pool_type,JSON.stringify(template.cards),JSON.stringify(template.deck_builder_state)])
    await db.query("INSERT INTO ptp_native_pool_evidence(source_pool_id,owner_user_id,set_code,pool_type,pack_count,cards) VALUES($1,$2,'SOR','sealed',$3,$4)",[pool,id,i===7?8:6,JSON.stringify(template.evidence)])
    users.push({id,share})
  }
  const [a,b,c,d,e,f,g,h,i,j,k]=users
  let burstReceipt=''
  for(let attempt=0;attempt<6;attempt++){
    burstReceipt=randomUUID()
    const pending=await findPublicMatch(k!.id,k!.share,burstReceipt)
    await cancelPublicMatch(pending.matchId,k!.id)
  }
  assert.equal((await findPublicMatch(k!.id,k!.share,burstReceipt)).status,'cancelled','Throttling must preserve existing receipt retries')
  await assert.rejects(findPublicMatch(k!.id,k!.share,randomUUID()),{code:'rate_limited',status:429})
  const before=(await db.query('SELECT COUNT(*)::int AS n FROM ptp_play_deck_versions')).rows[0].n
  const eligible=await nativeDecks(a!.id)
  assert.equal(eligible.decks[0]?.ready,true)
  assert.equal(eligible.decks[0]?.packCount,6)
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM ptp_play_deck_versions')).rows[0].n,before,'Eligibility GET must not freeze snapshots')
  const request=randomUUID()
  const first=await findPublicMatch(a!.id,a!.share,request)
  assert.equal(first.status,'waiting')
  await assert.rejects(createInvitation(a!.id,a!.share,randomUUID(),false),{code:'already_playing'})
  await assert.rejects(createInvitation(a!.id,a!.share,request,false),{code:'request_conflict'})
  assert.equal((await findPublicMatch(a!.id,a!.share,request)).matchId,first.matchId)
  await assert.rejects(findPublicMatch(a!.id,b!.share,request),{code:'request_conflict'})
  const incompatible=await findPublicMatch(h!.id,h!.share,randomUUID())
  assert.equal(incompatible.status,'waiting','Pack count mismatch must not match')
  const listing=await listPublicMatches(b!.id)
  assert(listing.entries.some(row=>row.matchId===first.matchId))
  const frozen=(await db.query('SELECT deck_version_id FROM ptp_native_match_seats WHERE match_id=$1 AND seat=0',[first.matchId])).rows[0].deck_version_id
  await db.query("UPDATE card_pools SET deck_builder_state='{}'::jsonb WHERE share_id=$1",[a!.share])
  assert.equal((await nativeDecks(a!.id)).decks[0]?.ready,false,'Edited invalid build must be marked unready')
  const claims=await Promise.allSettled([joinPublicMatch(first.matchId,b!.id,b!.share,randomUUID()),joinPublicMatch(first.matchId,c!.id,c!.share,randomUUID())])
  assert.equal(claims.filter(v=>v.status==='fulfilled').length,1,'Exactly one simultaneous join may succeed')
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM ptp_native_match_seats WHERE match_id=$1',[first.matchId])).rows[0].n,2)
  assert.equal((await db.query('SELECT deck_version_id FROM ptp_native_match_seats WHERE match_id=$1 AND seat=0',[first.matchId])).rows[0].deck_version_id,frozen,'Match must retain its original frozen version after editing')
  await assert.rejects(cancelPublicMatch(first.matchId,a!.id),{code:'cannot_cancel'})
  const paired=await Promise.all([findPublicMatch(d!.id,d!.share,randomUUID()),findPublicMatch(e!.id,e!.share,randomUUID())])
  assert.equal(paired[0]!.matchId,paired[1]!.matchId,'Concurrent Find must share one game')
  const pending=await findPublicMatch(f!.id,f!.share,randomUUID())
  const race=await Promise.allSettled([cancelPublicMatch(pending.matchId,f!.id),joinPublicMatch(pending.matchId,g!.id,g!.share,randomUUID())])
  assert.equal(race.filter(v=>v.status==='fulfilled').length,1,'Join versus cancel must have one winner')
  const crossMode=await Promise.allSettled([findPublicMatch(i!.id,i!.share,randomUUID()),createInvitation(i!.id,i!.share,randomUUID(),false)])
  assert.equal(crossMode.filter(v=>v.status==='fulfilled').length,1,'Private versus public must reserve exactly one seat')
  await db.query("INSERT INTO ptp_play_queue_entries(user_id,card_pool_id,pool_share_id,set_code,pool_type,status,expires_at) SELECT user_id,id,share_id,set_code,pool_type,'queued',NOW()+INTERVAL '10 minutes' FROM card_pools WHERE share_id=$1",[j!.share])
  await assert.rejects(findPublicMatch(j!.id,j!.share,randomUUID()),{code:'already_playing'})
  await db.query("UPDATE card_pools SET pool_type='pack_wars' WHERE share_id=$1",[j!.share])
  assert.equal((await nativeDecks(j!.id)).decks.length,0)
  assert.equal((await nativeDecks(j!.id,j!.share)).decks[0]?.blockerCode,'unsupported_format')
  assert.equal((await nativeDecks(a!.id,j!.share)).decks.some(deck=>deck.poolShareId===j!.share),false,'Requested decks must remain owner-scoped')
  process.env.PTP_NATIVE_PLAY_ENABLED='false'
  assert.equal((await findPublicMatch(a!.id,a!.share,request)).matchId,first.matchId,'Disabled admission must retain safe retry')
  assert((await listPublicMatches(a!.id)).availability)
  await cancelPublicMatch(incompatible.matchId,h!.id)
  await assert.rejects(findPublicMatch(h!.id,h!.share,randomUUID()),{code:'native_disabled'})
  console.log('Public matchmaking PostgreSQL acceptance checks passed: retry, conflict, compatibility, shared listing, concurrent claims/find/cancel, disabled admission and resume.')
} finally {
  // These tests never launch a runtime. Release only their synthetic reservations.
  await db.query("UPDATE ptp_native_matches SET status='cancelled' WHERE creator_user_id IN (SELECT id FROM users WHERE username='Synthetic Public Fixture') AND status IN ('waiting','starting')")
  await db.query("UPDATE ptp_native_match_seats SET released_at=NOW() WHERE user_id IN (SELECT id FROM users WHERE username='Synthetic Public Fixture')")
  await db.query("UPDATE ptp_play_queue_entries SET status='cancelled' WHERE user_id IN (SELECT id FROM users WHERE username='Synthetic Public Fixture') AND status='queued'")
  await db.end()
}
