import {soloGameReadySql} from './soloGameGate'
import {createHash} from 'node:crypto'
import {query,queryRow,withTransaction} from '../db'
import {nativeConfig,runtimeStatus,terminalOutcome,validateLaunchUrl} from '../../src/services/play/native/runtimeClient'
import {validateGameRecord,normalizeRecordDeck,canonicalJson,readBounded,type GameRecord} from '../../src/services/play/native/gameRecords'
import {PtpPlayError} from '../../src/services/play/playState'
import {advanceSolo,ensureSoloRuntime,ownedRun,parsed} from './soloEvent'

export async function reconcileSoloGames(runId?:string){
 // Admission switches must not prevent existing games from saving their results.
 let config
 try{config=nativeConfig(process.env,true)}catch{return}
 const pending=await withTransaction(tx=>tx.queryRows(`UPDATE ptp_solo_ai_games SET next_check_at=NOW()+INTERVAL '2 minutes'
 WHERE id IN (SELECT pending.id FROM ptp_solo_ai_games pending WHERE result IS NULL AND requested AND next_check_at<=NOW() AND ${soloGameReadySql('pending')}
 AND ($1::uuid IS NULL OR run_id=$1) ORDER BY next_check_at LIMIT 4 FOR UPDATE SKIP LOCKED) RETURNING id,run_id`,[runId??null]))
 for(const game of pending){
  try{
   const setup=await ensureSoloRuntime(String(game.id))
   const status=await runtimeStatus(config,String(game.id))
   if(status.status!=='complete'){
    const viewResponse=await fetch(`${config.baizeUrl}/v1/matches/${game.id}/seats/0`,{headers:{Authorization:`Bearer ${config.baizeKey}`},signal:AbortSignal.timeout(12000),redirect:'error',cache:'no-store'})
    if(!viewResponse.ok)throw Error('AI status unavailable')
    const view=await viewResponse.json()
    await query("UPDATE ptp_solo_ai_games SET error=$2,next_check_at=NOW()+INTERVAL '4 seconds' WHERE id=$1",[game.id,view.aiError?'The experimental AI paused. Retry to continue.':null]);continue
   }
   const response=await fetch(`${config.baizeUrl}/v1/matches/${game.id}/record`,{headers:{Authorization:`Bearer ${config.baizeKey}`},signal:AbortSignal.timeout(60000),redirect:'error',cache:'no-store'})
   if(!response.ok)throw Error('Archive pending')
   const record=validateGameRecord(await readBounded(response),String(game.id),parsed(setup.prepared).engineRevision)
   if(canonicalJson(record.setup.decks.map(normalizeRecordDeck))!==canonicalJson([setup.deck1,setup.deck2].map(v=>normalizeRecordDeck(parsed(v)))))throw Error('Deck record mismatch')
   const expectedBots=[setup.kind1==='ai'?parsed(setup.prepared).aiPolicy:null,setup.kind2==='ai'?parsed(setup.prepared).aiPolicy:null]
   if(canonicalJson((record.setup as any).bots)!==canonicalJson(expectedBots))throw Error('AI policy mismatch')
   const result=terminalOutcome(record.terminal),serialized=canonicalJson(record),hash=createHash('sha256').update(serialized).digest('hex')
   await withTransaction(async tx=>{
    await tx.queryRow('SELECT id FROM ptp_solo_ai_runs WHERE id=$1 FOR UPDATE',[game.run_id])
    const old=await tx.queryRow('SELECT record_hash FROM ptp_solo_ai_games WHERE id=$1 FOR UPDATE',[game.id])
    if(old?.record_hash&&old.record_hash!==hash)throw Error('Conflicting record')
    await tx.query('UPDATE ptp_solo_ai_games SET result=$2,record_json=$3,record_hash=$4,error=NULL WHERE id=$1 AND result IS NULL',[game.id,result,serialized,hash])
    await advanceSolo(tx,String(game.run_id))
   })
  }catch{
   await query("UPDATE ptp_solo_ai_games SET error='The game service or archive is unavailable. Your game is safe to retry.',next_check_at=NOW()+INTERVAL '15 seconds' WHERE id=$1 AND result IS NULL",[game.id])
  }
 }
}
export async function soloGameRecord(gameId:string,userId:string){
 const row=await queryRow(`SELECT g.record_json,g.record_hash,g.run_id,g.deck_snapshots FROM ptp_solo_ai_games g JOIN ptp_solo_ai_runs r ON r.id=g.run_id WHERE g.id=$1 AND r.owner_user_id=$2`,[gameId,userId])
 if(!row)throw new PtpPlayError(404,'record_not_found','Game record not found.')
 if(!row.record_json)throw new PtpPlayError(409,'archive_pending','The completed game record is still being saved. Retry shortly.')
 return {record:parsed(row.record_json) as GameRecord,recordHash:String(row.record_hash),runId:String(row.run_id),deckSnapshots:parsed(row.deck_snapshots)}
}
export async function soloReplayLaunch(gameId:string,userId:string,expiresAt:number){
 const archived=await soloGameRecord(gameId,userId),run=await ownedRun(archived.runId,userId),config=nativeConfig(process.env,true)
 const response=await fetch(`${config.gatewayUrl}/internal/launch`,{method:'POST',headers:{Authorization:`Bearer ${config.gatewayKey}`,'Content-Type':'application/json'},
  body:JSON.stringify({mode:'replay',...(!parsed(run.prepared)?.singleGame?{eventFormat:parsed(run.prepared)?.eventFormat==='elimination'?'elimination':'swiss'}:{}),isolated:true,issuer:'ptp',subject:userId,matchId:gameId,seat:0,returnUrl:`${config.hostOrigin}/runs/${run.id}`,expiresAt:Math.min(expiresAt,Date.now()+6*60*60_000)}),signal:AbortSignal.timeout(12000),redirect:'error'})
 if(!response.ok)throw new PtpPlayError(503,'replay_unavailable','Replay is temporarily unavailable.')
 return {launchUrl:validateLaunchUrl((await response.json()).launchUrl,config.publicOrigin)}
}

/** Explicit recovery preserves the frozen decks, accepted commands and score. */
export async function retrySoloGame(gameId:string,userId:string){
 const row=await queryRow(`SELECT g.id FROM ptp_solo_ai_games g JOIN ptp_solo_ai_runs r ON r.id=g.run_id WHERE g.id=$1 AND r.owner_user_id=$2 AND g.requested AND g.result IS NULL`,[gameId,userId])
 if(!row)throw new PtpPlayError(404,'game_not_found','Active game not found.')
 await ensureSoloRuntime(gameId)
 const config=nativeConfig(process.env,true)
 const response=await fetch(`${config.baizeUrl}/v1/matches/${gameId}/ai/retry`,{method:'POST',headers:{Authorization:`Bearer ${config.baizeKey}`},signal:AbortSignal.timeout(12000),redirect:'error'})
 if(!response.ok)throw new PtpPlayError(503,'retry_unavailable','The game service is unavailable. Retry shortly.')
 await query('UPDATE ptp_solo_ai_games SET error=NULL,next_check_at=NOW() WHERE id=$1 AND result IS NULL',[gameId])
 return {ok:true}
}
