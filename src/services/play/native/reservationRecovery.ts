import {queryRow,withTransaction} from '../../../../lib/db'
import {PtpPlayError} from '../playState'
import {getMatch} from './privateMatches'
import {nativeConfig,runtimeStatus} from './runtimeClient'

export function recoveryAction(status:string,bots:unknown,seat:number):'cancel'|'forfeit'{
 return status==='waiting'||Array.isArray(bots)&&!!bots[1-seat]?'cancel':'forfeit'
}
async function current(userId:string){
 return queryRow(`SELECT m.id,m.status,s.seat FROM ptp_native_match_seats s JOIN ptp_native_matches m ON m.id=s.match_id WHERE s.user_id=$1 AND s.released_at IS NULL`,[userId])
}
export async function nativeReservation(userId:string){
 const row=await current(userId)
 if(!row)return null
 if(['complete','cancelled'].includes(String(row.status))){
  await withTransaction(async tx=>{await tx.query(`UPDATE ptp_native_match_seats SET released_at=NOW() WHERE match_id=$1 AND released_at IS NULL AND EXISTS(SELECT 1 FROM ptp_native_matches WHERE id=$1 AND status IN ('complete','cancelled'))`,[row.id])})
  return null
 }
 if(row.status==='waiting')return {matchId:String(row.id),action:'cancel' as const}
 const status=await runtimeStatus(nativeConfig(process.env,true),String(row.id))
 if(status.status==='complete'){await getMatch(String(row.id),userId);return null}
 return {matchId:String(row.id),action:recoveryAction(String(row.status),status.bots,Number(row.seat))}
}
export async function resolveNativeReservation(userId:string,matchId:string,action:unknown){
 const reservation=await nativeReservation(userId)
 if(!reservation)return {ok:true}
 if(reservation.matchId!==matchId||reservation.action!==action)throw new PtpPlayError(409,'reservation_changed','Your current game changed. Review it before continuing.')
 const cancelled=await withTransaction(async tx=>{
  const row=await tx.queryRow(`SELECT m.status FROM ptp_native_matches m JOIN ptp_native_match_seats s ON s.match_id=m.id WHERE m.id=$1 AND s.user_id=$2 AND s.released_at IS NULL FOR UPDATE OF m`,[matchId,userId])
  if(row?.status!=='waiting')return false
  await tx.query("UPDATE ptp_native_matches SET status='cancelled' WHERE id=$1",[matchId])
  await tx.query('UPDATE ptp_native_match_seats SET released_at=NOW() WHERE match_id=$1',[matchId])
  return true
 })
 if(cancelled)return {ok:true}
 const row=await current(userId)
 if(!row)return {ok:true}
 if(row.id!==matchId)throw new PtpPlayError(409,'reservation_changed','Your current game changed. Review it before continuing.')
 const config=nativeConfig(process.env,true)
 for(let attempt=0;attempt<3;attempt++){
  const status=await runtimeStatus(config,matchId)
  if(status.status==='complete'){await getMatch(matchId,userId);return {ok:true}}
  if(recoveryAction(String(row.status),status.bots,Number(row.seat))!==action)throw new PtpPlayError(409,'reservation_changed','Your current game changed. Review it before continuing.')
  const response=await fetch(`${config.baizeUrl}/v1/matches/${encodeURIComponent(matchId)}/seats/${row.seat}/actions`,{
   method:'POST',headers:{authorization:`Bearer ${config.baizeKey}`,'content-type':'application/json'},
   body:JSON.stringify({commandId:`reservation-${matchId}-${row.seat}`,expectedStep:status.step,concede:true}),signal:AbortSignal.timeout(12000),redirect:'error',
  })
  if(!response.ok&&response.status!==409)throw new PtpPlayError(503,'recovery_unavailable','Could not end the current game. Please try again.')
 }
 const result=await getMatch(matchId,userId)
 if(result.status!=='complete')throw new PtpPlayError(409,'game_updating','The game is still updating. Please try again.')
 return {ok:true}
}
