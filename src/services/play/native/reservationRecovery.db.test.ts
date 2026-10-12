import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import pg from 'pg'

test('reservation recovery owns its seat and preserves human results', {skip:process.env.POD_TOURNAMENT_DB_TEST!=='1'}, async()=>{
 const database=`ptp_recovery_test_${randomUUID().replaceAll('-','')}`
 const admin=new pg.Client({host:'/tmp',database:'postgres'})
 await admin.connect()
 await admin.query(`CREATE DATABASE ${database}`)
 const db=new pg.Client({host:'/tmp',database})
 await db.connect()
 const originalFetch=globalThis.fetch
 try {
  process.env.DATABASE_URL=`postgresql://${process.env.USER}@localhost/${database}`
  Object.assign(process.env,{BAIZE_PVP_URL:'http://runtime.test',BAIZE_PVP_SERVICE_KEY:'test',PURRGIL_INTERNAL_URL:'http://gateway.test',PURRGIL_HOST_SERVICE_KEY:'test',PURRGIL_PUBLIC_ORIGIN:'http://gateway.test',PTP_PUBLIC_ORIGIN:'http://host.test',PTP_NATIVE_INVITE_KEY:'test',PTP_NATIVE_SUPPORT_PATH:'test'})
  await db.query(`CREATE TABLE ptp_native_matches(id UUID PRIMARY KEY,status TEXT,visibility TEXT,result TEXT,terminal_step BIGINT,completed_at TIMESTAMPTZ,engine_revision TEXT);
   CREATE TABLE ptp_native_match_seats(match_id UUID, user_id UUID,seat INT,released_at TIMESTAMPTZ);`)
  const {nativeReservation,resolveNativeReservation}=await import('./reservationRecovery')
  const user=randomUUID(),opponent=randomUUID(),outsider=randomUUID()
  let matchId=randomUUID(),complete=false,ai=false,conflict=false,actions:number[]=[]
  globalThis.fetch=async(input,init)=>{
   const url=String(input)
   if(init?.method==='POST'){
    const action=JSON.parse(String(init.body))
    assert.equal(action.concede,true)
    assert.equal(action.expectedStep,7)
    const seat=Number(url.match(/seats\/(\d)/)?.[1])
    actions.push(seat)
    if(conflict){conflict=false;return new Response('{}',{status:409})}
    complete=true
    return Response.json({})
   }
   return Response.json({matchId,issuer:'ptp',engineRevision:'test',step:7,status:complete?'complete':'active',bots:[ai?'leebo':null,null],returns:[1,-1]})
  }
  async function seed(status:string){
   await db.query('TRUNCATE ptp_native_matches,ptp_native_match_seats')
   matchId=randomUUID();complete=false;actions=[]
   await db.query('INSERT INTO ptp_native_matches(id,status) VALUES($1,$2)',[matchId,status])
   await db.query('INSERT INTO ptp_native_match_seats(match_id,user_id,seat) VALUES($1,$2,1),($1,$3,0)',[matchId,user,opponent])
  }
  await seed('waiting')
  assert.deepEqual(await nativeReservation(user),{matchId,action:'cancel'})
  await resolveNativeReservation(outsider,matchId,'cancel')
  assert.equal((await db.query('SELECT status FROM ptp_native_matches')).rows[0].status,'waiting','outsider cannot cancel')
  await assert.rejects(resolveNativeReservation(user,randomUUID(),'cancel'),/changed/)
  await resolveNativeReservation(user,matchId,'cancel')
  assert.equal((await db.query('SELECT COUNT(*) FROM ptp_native_match_seats WHERE released_at IS NULL')).rows[0].count,'0')
  assert.equal(actions.length,0,'waiting rooms do not contact engine actions')
  await seed('active')
  assert.deepEqual(await nativeReservation(user),{matchId,action:'forfeit'})
  await assert.rejects(resolveNativeReservation(user,matchId,'cancel'),/changed/)
  conflict=true
  await resolveNativeReservation(user,matchId,'forfeit')
  assert.deepEqual(actions,[1,1],'retries step conflict and concedes only authenticated seat')
  assert.equal((await db.query('SELECT result FROM ptp_native_matches')).rows[0].result,'player1')
  assert.equal(await nativeReservation(user),null)
  await seed('active');ai=true
  assert.deepEqual(await nativeReservation(user),{matchId,action:'cancel'})
  await resolveNativeReservation(user,matchId,'cancel')
  assert.deepEqual(actions,[1])
  await seed('active')
  const healthyFetch=globalThis.fetch
  let runtimeCreates=0
  globalThis.fetch=async(_url,init)=>{if(init?.method==='POST')runtimeCreates++;return Response.json({error:'not found'},{status:404})}
  const {ensureBotRuntime}=await import('../../pods/podGames')
  await assert.rejects(ensureBotRuntime(matchId,[true,false]),/saved game must be restored/)
  assert.equal(runtimeCreates,0,'a missing active game must never be silently recreated')
  globalThis.fetch=healthyFetch
  await seed('active');complete=true
  assert.equal(await nativeReservation(user),null,'already finished game releases stale seats')
  assert.equal(actions.length,0)
 } finally {
  globalThis.fetch=originalFetch
  await db.end()
  const {closePool}=await import('../../../../lib/db')
  await closePool()
  await admin.query(`DROP DATABASE ${database} WITH (FORCE)`)
  await admin.end()
 }
})
