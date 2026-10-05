import {test} from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import {randomUUID} from 'node:crypto'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

test('BO3 sideboarding preserves game one, enforces pool legality, saves builds and is retry-safe', {skip:process.env.NATIVE_LOCAL_DB_TEST!=='1'}, async()=>{
 const database=`ptp_sideboard_test_${randomUUID().replaceAll('-','')}`
 const admin=new pg.Client({host:'/tmp',database:'postgres'}), directory=await mkdtemp(join(tmpdir(),'ptp-sideboard-'))
 await admin.connect();await admin.query(`CREATE DATABASE ${database}`)
 const db=new pg.Client({host:'/tmp',database});await db.connect()
 try {
  Object.assign(process.env,{DATABASE_URL:`postgresql://${process.env.USER}@localhost/${database}`,NODE_ENV:'development',
   PTP_NATIVE_PLAY_ENABLED:'true',BAIZE_PVP_URL:'http://localhost:4321',BAIZE_PVP_SERVICE_KEY:'test',PURRGIL_INTERNAL_URL:'http://localhost:4322',PURRGIL_HOST_SERVICE_KEY:'test',PURRGIL_PUBLIC_ORIGIN:'http://localhost:4322',PTP_PUBLIC_ORIGIN:'http://localhost:4323',PTP_NATIVE_INVITE_KEY:'test',PTP_NATIVE_SUPPORT_PATH:join(directory,'support.json')})
  await db.query(`CREATE TABLE users(id UUID PRIMARY KEY);
   CREATE TABLE card_pools(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID,share_id TEXT UNIQUE,parent_pool_id UUID,set_code TEXT,set_name TEXT,pool_type TEXT,name TEXT,cards JSONB,packs JSONB,deck_builder_state JSONB,is_public BOOLEAN,hidden BOOLEAN DEFAULT false,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());
   CREATE FUNCTION reject_native_deck_version_update() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'Immutable'; END; $$ LANGUAGE plpgsql;`)
  for(const file of ['104_solo_ai_opponents.sql','105_solo_ai_progression.sql','108_solo_sideboarding.sql']) await db.query(await readFile(join(process.cwd(),'migrations',file),'utf8'))
  const {getAllCards}=await import('../../src/utils/cardData')
  const cards=getAllCards().filter(c=>c.set==='SOR'&&c.variantType==='Normal')
  const leaders=cards.filter(c=>c.type==='Leader').slice(0,2), bases=cards.filter(c=>c.type==='Base'&&c.rarity==='Common').slice(0,2), units=cards.filter(c=>c.type==='Unit').slice(0,2)
  assert.equal(leaders.length,2);assert.equal(bases.length,2);assert.equal(units.length,2)
  const all=[...leaders,...bases,...units]
  const engine=(c:typeof all[number])=>`SOR_${String(c.number).padStart(3,'0')}`
  await writeFile(process.env.PTP_NATIVE_SUPPORT_PATH!,JSON.stringify({version:'test',engineRevision:'test',supportedSets:['SOR'],unrestrictedBaseIds:bases.map(engine),cards:all.map(c=>({ptpId:c.id,engineId:engine(c),type:c.type,rarity:c.rarity}))}))
  const owner=randomUUID(),poolId=randomUUID(),runId=randomUUID(),matchId=randomUUID(),requestId=randomUUID()
  await db.query('INSERT INTO users VALUES($1)',[owner])
  const source=[...leaders,...Array.from({length:35},()=>units[0]!),...Array.from({length:5},()=>units[1]!)]
  const positions=Object.fromEntries([...leaders,...bases,...source.slice(2,32)].map((c,i)=>[String(i),{card:c,section:i<2?'leaders':i<4?'bases':'deck'}]))
  const state={activeLeader:'0',activeBase:'2',cardPositions:positions}
  await db.query("INSERT INTO card_pools(id,user_id,share_id,set_code,pool_type,name,cards,packs,deck_builder_state,is_public) VALUES($1,$2,'pool','SOR','sealed','Original',$3,'[]',$4,false)",[poolId,owner,JSON.stringify(source),JSON.stringify(state)])
  const {loadSupport}=await import('../../src/services/play/native/savedDeck')
  const {savedOpponentSnapshot}=await import('../../src/services/play/solo/savedOpponent')
  const support=await loadSupport(process.env.PTP_NATIVE_SUPPORT_PATH!)
  const original=savedOpponentSnapshot({id:poolId,share_id:'pool',user_id:owner,set_code:'SOR',pool_type:'sealed',packs:[],deck_builder_state:state},owner,support)
  await db.query('INSERT INTO ptp_solo_ai_runs(id,owner_user_id,request_id,pool_share_id,prepared,opponent_deck) VALUES($1,$2,$3,$4,$5,$6)',[runId,owner,requestId,'pool',JSON.stringify({singleGame:true,human:original,engineRevision:'test',aiPolicy:'wip-search-v1'}),JSON.stringify(original)])
  for(const [id,seat,kind] of [['human',1,'human'],['bot',2,'ai']]) await db.query('INSERT INTO ptp_solo_ai_participants VALUES($1,$2,$3,$4,$2,$5)',[runId,id,seat,kind,JSON.stringify(original)])
  await db.query("INSERT INTO ptp_solo_ai_matches VALUES($1,$2,1,0,'human','bot','human')",[matchId,runId])
  await db.query("INSERT INTO ptp_solo_ai_games(id,run_id,match_id,game_no,requested,result,record_json,record_hash,deck_snapshots) VALUES($1,$1,$2,1,true,'player1','{}',$3,$4)",[runId,matchId,'a'.repeat(64),JSON.stringify([original,original])])
  const {convertSoloToBo3,getSoloSideboard,saveSoloSideboard}=await import('./soloSideboard')
  const {launchSoloGame}=await import('./soloEvent')
  await assert.rejects(()=>convertSoloToBo3(runId,randomUUID()),/not found/)
  const {inGameSideboard}=await import('./inGameSideboard')
  const request={action:'convert',expiresAt:Date.now()+60000}
  await assert.rejects(()=>inGameSideboard(runId,randomUUID(),request),/not found/)
  const inGame=await inGameSideboard(runId,owner,request)
  assert.equal(inGame.state,'sideboarding')
  assert.deepEqual(inGame.score,[1,0])
  assert.equal('opponentReady' in inGame&&inGame.opponentReady,true)
  await convertSoloToBo3(runId,owner)
  assert.equal((await db.query('SELECT * FROM ptp_solo_ai_games')).rows.length,2,'conversion is idempotent')
  const data=await getSoloSideboard(runId,owner)
  assert.equal(data.gameNumber,2)
  await assert.rejects(()=>inGameSideboard(runId,owner,{action:'ready',gameId:randomUUID(),selection:data.selection,expiresAt:Date.now()+60000}),/moved on/)
  assert.equal(data.cards.filter(c=>c.type==='Base').length,2,'common bases do not need to be in the pool')
  const paused=await launchSoloGame(runId,owner,Date.now()+60000)
  assert.match(paused.launchUrl,/sideboard/,'direct launch cannot bypass sideboarding')
  await assert.rejects(()=>saveSoloSideboard(runId,data.gameId,owner,{...data.selection,deck:{[units[0]!.id]:29}}),/at least 30/)
  await assert.rejects(()=>saveSoloSideboard(runId,data.gameId,owner,{...data.selection,deck:{[units[0]!.id]:36}}),/copies/)
  const selection={...data.selection,leader:leaders[1]!.id,base:bases[1]!.id}
  await Promise.all([saveSoloSideboard(runId,data.gameId,owner,selection),saveSoloSideboard(runId,data.gameId,owner,selection)])
  const builds=(await db.query('SELECT * FROM card_pools ORDER BY created_at')).rows
  assert.equal(builds.length,2,'retries create just one alternate build')
  assert.equal(builds[1].parent_pool_id,poolId)
  const savedState=builds[1].deck_builder_state
  assert.equal(savedState.cardPositions[savedState.activeLeader].section,'leaders-bases','leader remains visible when reopening the deckbuilder')
  assert.equal(savedState.cardPositions[savedState.activeBase].section,'leaders-bases')
  assert.ok(Object.values(savedState.cardPositions).filter((p:any)=>p.section==='sideboard').every((p:any)=>p.enabled===false),'deckbuilder must not move sideboard cards back into the deck')
  assert.equal(savedState.deckCardIds.length,30)

  const games=(await db.query('SELECT * FROM ptp_solo_ai_games ORDER BY game_no')).rows
  assert.deepEqual(games[0].deck_snapshots[0],original,'game one retains its exact identity and cards')
  assert.equal(games[1].deck_snapshots[0].sourcePoolId,poolId)
  assert.equal(games[1].deck_snapshots[0].poolId,builds[1].id)
  assert.equal(games[1].deck_snapshots[0].leader,engine(leaders[1]!))
  assert.equal(games[1].deck_snapshots[0].base,engine(bases[1]!))
  assert.equal(games[1].deck_snapshots[0].deck[0].count,30)
  await assert.rejects(()=>db.query("UPDATE ptp_solo_ai_games SET deck_snapshots='[]' WHERE id=$1",[runId]),/immutable/)
  const realFetch=globalThis.fetch
  let runtimeDecks:any[]=[]
  globalThis.fetch=async (url,options)=>{
   const path=new URL(String(url)).pathname
   if(path==='/v1/support')return Response.json({engineRevision:'test',protocolVersion:1})
   if(path==='/v1/matches'){runtimeDecks=JSON.parse(String(options?.body)).decks;return Response.json({})}
   if(path==='/internal/launch')return Response.json({launchUrl:'http://localhost:4322/launch?code=test'})
   throw Error(`Unexpected engine request: ${path}`)
  }
  try {
   const launch=await launchSoloGame(runId,owner,Date.now()+60000,data.gameId)
   assert.match(launch.launchUrl,/launch/)
   assert.equal(runtimeDecks[0].leader,engine(leaders[1]!),'runtime loads the sideboarded leader')
   assert.equal(runtimeDecks[0].base,engine(bases[1]!),'runtime loads the sideboarded base')
   assert.deepEqual(runtimeDecks[0].cards,games[1].deck_snapshots[0].deck)
   const locked=await getSoloSideboard(runId,owner)
   assert.equal(locked.locked,true,'refresh offers resume instead of losing the committed deck')
  } finally {globalThis.fetch=realFetch}

  // Advance after game two: a saved alternative can be reused without duplicating it.
  await db.query("UPDATE ptp_solo_ai_games SET requested=true,result='player2',record_json='{}',record_hash=$2 WHERE id=$1",[data.gameId,'b'.repeat(64)])
  const {advanceSolo}=await import('./soloEvent'), {withTransaction}=await import('../db')
  await withTransaction(tx=>advanceSolo(tx,runId))
  const next=await getSoloSideboard(runId,owner)
  assert.equal(next.gameNumber,3)
  assert.equal(next.selection.leader,leaders[1]!.id)
  assert.equal(next.builds.length,2)
  const swap={...data.selection,deck:{[units[0]!.id]:29,[units[1]!.id]:1}}
  await saveSoloSideboard(runId,next.gameId,owner,swap,'pool')
  assert.equal((await db.query('SELECT * FROM card_pools')).rows.length,2,'card swaps retain build identity')
  const third=(await db.query('SELECT deck_snapshots FROM ptp_solo_ai_games WHERE id=$1',[next.gameId])).rows[0].deck_snapshots[0]
  assert.equal(third.poolId,poolId)
  assert.equal(third.deck.reduce((n:number,c:{count:number})=>n+c.count,0),30)
  process.env.PURRGIL_HOST_SERVICE_KEY='x'.repeat(32)
  const {POST}=await import('../../app/api/play/native/internal/concede-match/[matchId]/route')
  const concede=(subject:string)=>POST(new Request('http://localhost/internal/concede-match',{method:'POST',headers:{Authorization:`Bearer ${process.env.PURRGIL_HOST_SERVICE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({subject})}),{params:Promise.resolve({matchId:next.gameId})})
  assert.equal((await concede(randomUUID())).status,404)
  assert.equal((await concede(owner)).status,200)
  assert.equal((await concede(owner)).status,200)
  await withTransaction(tx=>advanceSolo(tx,runId))
  assert.equal((await db.query('SELECT winner FROM ptp_solo_ai_matches WHERE id=$1',[matchId])).rows[0].winner,'bot')
  await assert.rejects(()=>getSoloSideboard(runId,owner),/no next game/i)
  assert.equal((await inGameSideboard(data.gameId,owner,{action:'open',expiresAt:Date.now()+60000})).state,'complete')

 } finally {
  const {closePool}=await import('../db');await closePool();await db.end()
  await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);await admin.end();await rm(directory,{recursive:true,force:true})
 }
})
