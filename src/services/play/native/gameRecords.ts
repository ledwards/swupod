import { createHash, timingSafeEqual } from 'node:crypto'
import { query, queryRow, withTransaction } from '../../../../lib/db'
import { PtpPlayError } from '../playState'
import { nativeConfig, validateLaunchUrl } from './runtimeClient'

type JsonObject = Record<string, any>
export interface GameRecord {
  schemaVersion: 1; game: 'swu'; matchId: string; issuer: string; engineRevision: string; protocolVersion: 1
  createdAtMs: number | null
  setup: { decks: JsonObject[]; seed: string }
  commands: { seat: number; command: { commandId: string; expectedStep: number; index: number | null; concede: boolean }; action: unknown; acceptedAtMs: number | null }[]
  frames: { step: number; views: JsonObject[] }[]
  terminal: JsonObject
}
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}
function invalid(): never { throw new Error('Invalid authoritative game record') }
const object = (value: unknown): value is JsonObject => value!==null && typeof value==='object' && !Array.isArray(value)
const timestamp = (value: unknown) => value===null || (Number.isSafeInteger(value) && Number(value)>=0)
/** The runtime calls its array cards; frozen host snapshots call it deck. */
export function normalizeRecordDeck(value: unknown) {
  if(!object(value) || typeof value.leader!=='string' || !value.leader || typeof value.base!=='string' || !value.base) invalid()
  const entries=value.cards??value.deck
  if(!Array.isArray(entries) || !entries.length) invalid()
  const seen=new Set<string>()
  const cards=entries.map((entry:unknown)=>{
    if(!object(entry)||typeof entry.id!=='string'||!entry.id||!Number.isSafeInteger(entry.count)||entry.count<1||entry.count>255||seen.has(entry.id)) invalid()
    seen.add(entry.id);return {id:entry.id as string,count:entry.count as number}
  }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)
  return {leader:value.leader,base:value.base,cards}
}
export function validateGameRecord(value: unknown, matchId: string, revision: string): GameRecord {
  const r = value as GameRecord
  if (!r || r.schemaVersion!==1 || r.game!=='swu' || r.issuer!=='ptp' || r.matchId!==matchId || r.engineRevision!==revision || r.protocolVersion!==1
    || !r.setup || !Array.isArray(r.setup.decks) || r.setup.decks.length!==2 || typeof r.setup.seed!=='string'
    || !/^(0|[1-9][0-9]{0,19})$/.test(r.setup.seed) || BigInt(r.setup.seed)>18446744073709551615n || !timestamp(r.createdAtMs)
    || !Array.isArray(r.commands) || r.commands.length>20001 || !Array.isArray(r.frames) || r.frames.length!==r.commands.length+1
    || r.terminal?.status!=='complete' || r.terminal.matchId!==matchId || r.terminal.issuer!=='ptp' || r.terminal.engineRevision!==revision || r.terminal.protocolVersion!==1
    || !['rules','concession'].includes(r.terminal.reason) || r.terminal.step!==r.commands.length || !Array.isArray(r.terminal.returns) || r.terminal.returns.length!==2
    || r.terminal.returns.some((n:unknown)=>typeof n!=='number'||!Number.isFinite(n))) invalid()
  r.setup.decks.forEach(normalizeRecordDeck)
  const ids=new Set<string>()
  for (const [step,frame] of r.frames.entries()) {
    if(!frame || frame.step!==step || !Array.isArray(frame.views) || frame.views.length!==2) invalid()
    const final=step===r.commands.length
    frame.views.forEach((view,seat)=>{
      if(!object(view) || view.seat!==seat || view.step!==step || view.matchId!==matchId || view.issuer!=='ptp' || view.engineRevision!==revision || view.protocolVersion!==1
        || !object(view.observation) || view.observation.player!==seat || !Array.isArray(view.events)
        || view.events.some((event:unknown)=>!object(event)||event.step!==step)
        || view.status!==(final?'complete':'in_progress')
        || (final && (view.to_move!==null || view.reason!==r.terminal.reason || canonicalJson(view.returns)!==canonicalJson(r.terminal.returns)))) invalid()
    })
    if(final) continue
    const entry=r.commands[step], command=entry?.command
    if(!entry || !command || ![0,1].includes(entry.seat) || command.expectedStep!==step || typeof command.commandId!=='string'
      || !/^[a-zA-Z0-9_-]{1,100}$/.test(command.commandId) || ids.has(command.commandId) || !timestamp(entry.acceptedAtMs) || typeof command.concede!=='boolean') invalid()
    ids.add(command.commandId)
    if(command.concede) {
      if(command.index!==null || entry.action!==null || step!==r.commands.length-1 || r.terminal.reason!=='concession'
        || canonicalJson(r.terminal.returns)!==canonicalJson(entry.seat===0?[-1,1]:[1,-1])) invalid()
    } else {
      const view=frame.views[entry.seat], index=command.index
      if(!view || view.to_move!==entry.seat || !Number.isSafeInteger(index) || index===null || index<0 || !Array.isArray(view.action_values)
        || index>=view.action_values.length || canonicalJson(view.action_values[index])!==canonicalJson(entry.action)) invalid()
    }
  }
  if((r.commands.at(-1)?.command.concede??false)!==(r.terminal.reason==='concession')) invalid()
  return r
}
export function trainingExamples(record: GameRecord, recordHash: string) {
  return record.commands.flatMap((entry,i)=>{
    if(entry.command.concede) return []
    const before=record.frames[i]?.views[entry.seat]
    if(!before) invalid()
    return [{schemaVersion:1,game:'swu',recordHash,engineRevision:record.engineRevision,step:i,seat:entry.seat,
      observation:before.observation,legalActions:before.action_values,selectedIndex:entry.command.index,
      selectedAction:entry.action,reward:record.terminal.returns[entry.seat],terminalReason:record.terminal.reason,
      acceptedAtMs:entry.acceptedAtMs}]
  })
}
async function readBounded(response: Response): Promise<unknown> {
  const reader=response.body?.getReader();if(!reader) throw new Error('Empty game record')
  const chunks:Uint8Array[]=[];let length=0
  while(true){const item=await reader.read();if(item.done)break;length+=item.value.byteLength
    if(length>128*1024*1024){await reader.cancel();throw new Error('Game record exceeds archival limit; runtime must retain it')}
    chunks.push(item.value)}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
/** Fetch outside transactions, then persist once. Failure never removes engine data. */
export async function archiveNativeGame(matchId: string): Promise<void> {
  if(await queryRow('SELECT match_id FROM ptp_native_game_records WHERE match_id=$1',[matchId])) return
  const match=await queryRow("SELECT engine_revision,result,terminal_step::integer AS terminal_step FROM ptp_native_matches WHERE id=$1 AND status='complete'",[matchId])
  if(!match?.engine_revision) throw new PtpPlayError(409,'record_not_complete','The game record is available after completion.')
  const config=nativeConfig(process.env,true)
  const response=await fetch(`${config.baizeUrl}/v1/matches/${encodeURIComponent(matchId)}/record`,{headers:{authorization:`Bearer ${config.baizeKey}`},signal:AbortSignal.timeout(60000),redirect:'error',cache:'no-store'})
  if(!response.ok) throw new Error('Authoritative game record unavailable')
  const record=validateGameRecord(await readBounded(response),matchId,String(match.engine_revision))
  const result=record.terminal.returns[0]===record.terminal.returns[1]?'draw':record.terminal.returns[0]>record.terminal.returns[1]?'player1':'player2'
  if(record.terminal.step!==match.terminal_step || result!==match.result) invalid()
  const snapshots=await queryRow(`SELECT jsonb_agg(v.snapshot ORDER BY s.seat) AS decks FROM ptp_native_match_seats s
    JOIN ptp_play_deck_versions v ON v.id=s.deck_version_id WHERE s.match_id=$1`,[matchId])
  const decks=snapshots?.decks as JsonObject[]
  if(!Array.isArray(decks)||canonicalJson(decks.map(normalizeRecordDeck))!==canonicalJson(record.setup.decks.map(normalizeRecordDeck))) invalid()
  const serialized=canonicalJson(record), hash=createHash('sha256').update(serialized).digest('hex')
  await withTransaction(async tx=>{
    await tx.query(`INSERT INTO ptp_native_game_records(match_id,schema_version,engine_revision,record_hash,record_json,byte_count)
      VALUES($1,1,$2,$3,$4,$5) ON CONFLICT(match_id) DO NOTHING`,[matchId,record.engineRevision,hash,serialized,Buffer.byteLength(serialized)])
    const stored=await tx.queryRow('SELECT record_hash FROM ptp_native_game_records WHERE match_id=$1',[matchId])
    if(stored?.record_hash!==hash) throw new Error('Conflicting authoritative game record')
    await tx.query('UPDATE ptp_native_matches SET archive_error=NULL WHERE id=$1',[matchId])
  })
}
export async function memberGameRecord(matchId:string,userId:string) {
  const member=await queryRow('SELECT m.status FROM ptp_native_matches m JOIN ptp_native_match_seats s ON s.match_id=m.id WHERE m.id=$1 AND s.user_id=$2',[matchId,userId])
  if(!member) throw new PtpPlayError(404,'record_not_found','Game record not found.')
  if(member.status!=='complete') throw new PtpPlayError(409,'record_not_complete','The game record is available after completion.')
  let row=await queryRow('SELECT record_hash,record_json FROM ptp_native_game_records WHERE match_id=$1',[matchId])
  if(!row){try { await archiveNativeGame(matchId) } catch { throw new PtpPlayError(503,'archive_pending','The game record is still being saved. Retry shortly.') };row=await queryRow('SELECT record_hash,record_json FROM ptp_native_game_records WHERE match_id=$1',[matchId])}
  if(!row)throw new PtpPlayError(503,'archive_pending','The game record is still being saved. Retry shortly.')
  return {matchId,recordHash:String(row.record_hash),record:row.record_json as GameRecord}
}
export async function reconcileNativeArchives():Promise<{archived:number;failures:number}> {
  try { nativeConfig(process.env,true) } catch { return {archived:0,failures:0} }
  let archived=0,failures=0
  const rows=await withTransaction(tx=>tx.queryRows(`UPDATE ptp_native_matches m SET next_archive_at=NOW()+INTERVAL '2 minutes'
    WHERE m.id IN (SELECT m2.id FROM ptp_native_matches m2 WHERE m2.status='complete' AND m2.next_archive_at<=NOW()
      AND NOT EXISTS(SELECT 1 FROM ptp_native_game_records r WHERE r.match_id=m2.id)
      ORDER BY m2.next_archive_at LIMIT 5 FOR UPDATE OF m2 SKIP LOCKED) RETURNING m.id`))
  for(const row of rows){try{await archiveNativeGame(String(row.id));archived++}catch{failures++;await query("UPDATE ptp_native_matches SET archive_error='archive_pending' WHERE id=$1",[row.id])}}
  return {archived,failures}
}
export function authorizeRecordService(request:Request) {
  const key=process.env.PURRGIL_HOST_SERVICE_KEY, supplied=request.headers.get('authorization')??''
  if(!key||key.length<32)throw new PtpPlayError(503,'record_service_unconfigured','Record service unavailable.')
  const a=Buffer.from(supplied),b=Buffer.from(`Bearer ${key}`)
  if(a.length!==b.length||!timingSafeEqual(a,b))throw new PtpPlayError(401,'unauthorized','Unauthorized.')
}
export async function issueReplayLaunch(matchId:string,userId:string,expiresAt:number) {
  await memberGameRecord(matchId,userId)
  const seat=await queryRow('SELECT seat FROM ptp_native_match_seats WHERE match_id=$1 AND user_id=$2',[matchId,userId])
  const config=nativeConfig(process.env,true)
  const response=await fetch(`${config.gatewayUrl}/internal/launch`,{method:'POST',headers:{authorization:`Bearer ${config.gatewayKey}`,'content-type':'application/json'},
    body:JSON.stringify({mode:'replay',issuer:'ptp',subject:userId,matchId,seat:seat!.seat,returnUrl:`${config.hostOrigin}/play?match=${matchId}`,expiresAt:Math.min(expiresAt,Date.now()+6*60*60_000)}),signal:AbortSignal.timeout(12000),redirect:'error'})
  if(!response.ok)throw new PtpPlayError(503,'replay_unavailable','Replay is temporarily unavailable.')
  const result=await response.json()
  return {launchUrl:validateLaunchUrl(result.launchUrl,config.publicOrigin)}
}
