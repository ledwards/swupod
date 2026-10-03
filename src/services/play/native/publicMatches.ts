import { randomUUID, randomBytes } from 'node:crypto'
import { withTransaction, type TxClient } from '../../../../lib/db'
import { PtpPlayError } from '../playState'
import { lockPlayAdmission } from './admission'
import { freezeSavedDeck } from './savedDeck'
import { nativeConfig } from './runtimeClient'
import type { NativeDeckVersion } from '../deckVersions'
const parsed = (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : value) as NativeDeckVersion
const select = `SELECT m.id,m.status,m.visibility,m.created_at,s.seat,v.snapshot FROM ptp_native_matches m
  JOIN ptp_native_match_seats s ON s.match_id=m.id JOIN ptp_play_deck_versions v ON v.id=s.deck_version_id`
function summary(row: Record<string,unknown>) {
  const deck=parsed(row.snapshot)
  return {matchId:String(row.id),status:String(row.status),visibility:String(row.visibility),seat:Number(row.seat),setCode:deck.setCode,poolType:deck.poolType,packCount:deck.packCount,poolShareId:deck.poolShareId}
}
async function own(tx:TxClient,matchId:string,userId:string) {
  const row=await tx.queryRow(`${select} WHERE m.id=$1 AND s.user_id=$2`,[matchId,userId])
  if(!row)throw new PtpPlayError(404,'match_not_found','Match not found.')
  return summary(row)
}
// Serialize public selection with cancellation. Native/private/legacy admissions
// additionally share user locks and the unique active-seat constraint.
async function lock(tx:TxClient,userId:string) {
  await tx.query("SELECT pg_advisory_xact_lock(hashtext('ptp-native-public'))")
  await lockPlayAdmission(tx,userId)
}
export async function listPublicMatches(userId:string) {
  nativeConfig(process.env,true)
  return withTransaction(async tx=>{
    const rows=await tx.queryRows(`${select} WHERE m.visibility='public' AND m.status='waiting' AND s.seat=0 ORDER BY m.created_at,m.id LIMIT 100`)
    const current=await tx.queryRow(`${select} WHERE s.user_id=$1 AND s.released_at IS NULL`,[userId])
    return {entries:rows.map(row=>{const deck=parsed(row.snapshot);return {matchId:String(row.id),setCode:deck.setCode,poolType:deck.poolType,packCount:deck.packCount,createdAt:row.created_at}}),availability:current?summary(current):null}
  })
}
export const findPublicMatch=(userId:string,poolShareId:string,requestId:string)=>admit(userId,poolShareId,requestId)
export const joinPublicMatch=(matchId:string,userId:string,poolShareId:string,requestId:string)=>admit(userId,poolShareId,requestId,matchId)
async function admit(userId:string,poolShareId:string,requestId:string,target?:string) {
  const config=nativeConfig(process.env,true)
  return withTransaction(async tx=>{
    await lock(tx,userId)
    const receipt=await tx.queryRow('SELECT * FROM ptp_native_public_requests WHERE user_id=$1 AND request_id=$2',[userId,requestId])
    if(receipt){
      if(receipt.pool_share_id!==poolShareId || (receipt.target_match_id??undefined)!==target)throw new PtpPlayError(409,'request_conflict','This request was already used for a different selection.')
      return own(tx,String(receipt.match_id),userId)
    }
    const recent=await tx.queryRow("SELECT COUNT(*)::int AS count FROM ptp_native_public_requests WHERE user_id=$1 AND created_at>NOW()-INTERVAL '1 minute'",[userId])
    if(Number(recent?.count)>=6)throw new PtpPlayError(429,'rate_limited','Please wait before entering another public table.')
    nativeConfig() // Existing receipts remain resumable while new admission is off.
    const active=await tx.queryRow('SELECT match_id FROM ptp_native_match_seats WHERE user_id=$1 AND released_at IS NULL',[userId])
    if(active)throw new PtpPlayError(409,'already_playing','Resume or cancel your existing table first.')
    const legacy=await tx.queryRow(`SELECT 1 FROM ptp_play_matches WHERE (player1_user_id=$1 OR player2_user_id=$1) AND status IN ('matched','launch_ready','in_progress')
      UNION ALL SELECT 1 FROM ptp_play_queue_entries WHERE user_id=$1 AND status='queued' AND expires_at>NOW() LIMIT 1`,[userId])
    if(legacy)throw new PtpPlayError(409,'already_playing','Finish your existing game or leave its queue first.')
    const deck=await freezeSavedDeck(tx,userId,poolShareId,config.supportPath)
    const rows=await tx.queryRows(`${select} WHERE m.visibility='public' AND m.status='waiting' AND s.seat=0 ${target?'AND m.id=$1':''} ORDER BY m.created_at,m.id FOR UPDATE OF m`,target?[target]:[])
    const candidate=rows.find(row=>{
      const first=parsed(row.snapshot)
      return first.setCode===deck.snapshot.setCode && first.poolType===deck.snapshot.poolType && first.packCount===deck.snapshot.packCount && first.validationVersion===deck.snapshot.validationVersion
    })
    if(target&&!candidate)throw new PtpPlayError(409,rows.length?'format_mismatch':'match_unavailable',rows.length?'Choose the same set, format, pack count and supported engine version.':'That table is no longer available.')
    let id:string
    if(candidate){
      id=String(candidate.id)
      await tx.query('INSERT INTO ptp_native_match_seats(match_id,seat,user_id,deck_version_id) VALUES($1,1,$2,$3)',[id,userId,deck.id])
      await tx.query("UPDATE ptp_native_matches SET status='starting' WHERE id=$1",[id])
    }else{
      id=randomUUID()
      await tx.query("INSERT INTO ptp_native_matches(id,creator_user_id,request_id,invite_hash,visibility) VALUES($1,$2,$3,$4,'public')",[id,userId,requestId,randomBytes(32).toString('hex')])
      await tx.query('INSERT INTO ptp_native_match_seats(match_id,seat,user_id,deck_version_id) VALUES($1,0,$2,$3)',[id,userId,deck.id])
    }
    await tx.query('INSERT INTO ptp_native_public_requests(user_id,request_id,pool_share_id,target_match_id,match_id) VALUES($1,$2,$3,$4,$5)',[userId,requestId,poolShareId,target??null,id])
    return own(tx,id,userId)
  })
}
export async function cancelPublicMatch(matchId:string,userId:string) {
  nativeConfig(process.env,true)
  return withTransaction(async tx=>{
    await lock(tx,userId)
    const match=await tx.queryRow("SELECT * FROM ptp_native_matches WHERE id=$1 AND creator_user_id=$2 AND visibility='public' FOR UPDATE",[matchId,userId])
    if(!match)throw new PtpPlayError(404,'match_not_found','Match not found.')
    if(match.status!=='cancelled'){
      if(match.status!=='waiting')throw new PtpPlayError(409,'cannot_cancel','A player has joined. Resume your game.')
      await tx.query("UPDATE ptp_native_matches SET status='cancelled' WHERE id=$1",[matchId])
      await tx.query('UPDATE ptp_native_match_seats SET released_at=NOW() WHERE match_id=$1',[matchId])
    }
    return own(tx,matchId,userId)
  })
}
