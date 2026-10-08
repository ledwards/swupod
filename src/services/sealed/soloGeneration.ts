import { randomUUID, randomBytes } from 'node:crypto'
import type { TxClient } from '../../../lib/db'
import { getSetConfig } from '../../utils/setConfigs'
import { getUnavailableSetReason } from '../../utils/setAvailability'
import { getBaseSetCode, isCarboniteCode, isCarboniteSupported } from '../../utils/carboniteConstants'

export class SoloGenerationError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
type Input = Record<string, unknown>
type Pack = { cards: Record<string, unknown>[] }
function reject(message: string): never { throw new SoloGenerationError(400, message) }
function only(input: Input, keys: string[]) {
  if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(key=>!keys.includes(key))) reject('Unexpected generation fields.')
}
function uuid(value: unknown): string {
  if(typeof value!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))reject('Invalid generation ID.')
  return value
}
export function validatePrepare(input: Input, session: {is_admin?:boolean;is_beta_tester?:boolean}) {
  only(input,['setCode','packCount','requestId'])
  const {setCode,packCount}=input
  if(typeof setCode!=='string' || !/^[A-Z0-9]{3}(?:-CB)?$/.test(setCode))reject('Choose a single supported set.')
  const base=getBaseSetCode(setCode)
  if(!getSetConfig(base) || (isCarboniteCode(setCode)&&!isCarboniteSupported(base)))reject('This pack type is not supported.')
  const unavailable=getUnavailableSetReason(setCode,session)
  if(unavailable)throw new SoloGenerationError(403,unavailable)
  if(packCount!==6 && packCount!==8)reject('Sealed requires six or eight packs.')
  return {setCode,packCount,requestId:uuid(input.requestId)}
}
export function selectWindow(box: Pack[], count: number, start: unknown) {
  if(!Array.isArray(box)||box.length!==24||![6,8].includes(count))throw new Error('Invalid stored generation artifact')
  if(typeof start!=='number'||!Number.isInteger(start)||start<0||start+count>24)reject('Choose a consecutive window within the box.')
  const packs=box.slice(start,start+count)
  return {packs,cards:packs.flatMap(pack=>pack.cards),packIndices:Array.from({length:count},(_,i)=>start+i)}
}
const parse = (value:unknown): any => typeof value==='string'?JSON.parse(value):value
function prepared(row:Record<string,unknown>) {
  const boxPacks=parse(row.box_packs) as Pack[]
  return {generationId:String(row.id),shareId:String(row.share_id),setCode:String(row.set_code),isPublic:false,boxPacks,...selectWindow(boxPacks,Number(row.pack_count),0)}
}
/** Caller owns a transaction and authenticated user row lock. */
export async function prepareSoloGeneration(tx:TxClient,userId:string,input:Input,session:{is_admin?:boolean;is_beta_tester?:boolean}) {
  const request=validatePrepare(input,session)
  const existing=await tx.queryRow('SELECT * FROM ptp_solo_sealed_generations WHERE owner_user_id=$1 AND request_id=$2',[userId,request.requestId])
  if(existing) {
    if(existing.set_code!==request.setCode||Number(existing.pack_count)!==request.packCount)throw new SoloGenerationError(409,'Generation request already has different settings.')
    if(new Date(String(existing.expires_at)).getTime()<=Date.now())throw new SoloGenerationError(410,'This unopened pool expired. Open a new pool.')
    return prepared(existing)
  }
  const rate=await tx.queryRow("SELECT COUNT(*)::int AS count FROM ptp_solo_sealed_generations WHERE owner_user_id=$1 AND created_at>NOW()-INTERVAL '1 minute'",[userId])
  if(Number(rate?.count)>=6)throw new SoloGenerationError(429,'Please wait before generating another box.')
  const {initializeCardCache}=await import('../../utils/cardCache')
  const {generateSealedBox}=await import('../../utils/boosterPack')
  await initializeCardCache()
  const box=generateSealedBox([],request.setCode,24)
  const row=await tx.queryRow(`INSERT INTO ptp_solo_sealed_generations (id,owner_user_id,request_id,share_id,set_code,pack_count,box_packs)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[randomUUID(),userId,request.requestId,randomBytes(6).toString('base64url'),request.setCode,request.packCount,JSON.stringify(box)])
  if(!row)throw new Error('Generation artifact was not saved')
  return prepared(row)
}
/** Finalization has no browser card payload: evidence is derived only from the locked artifact. */
export async function finalizeSoloGeneration(tx:TxClient,userId:string,input:Input) {
  only(input,['generationId','windowStart','flowId'])
  if (input.flowId != null && (typeof input.flowId !== 'string' || input.flowId.length > 200)) reject('Invalid flow ID.')
  const id=uuid(input.generationId)
  const artifact=await tx.queryRow('SELECT * FROM ptp_solo_sealed_generations WHERE id=$1 AND owner_user_id=$2 FOR UPDATE',[id,userId])
  if(!artifact)throw new SoloGenerationError(404,'Generated pool not found.')
  const boxPacks=parse(artifact.box_packs) as Pack[]
  const selected=selectWindow(boxPacks,Number(artifact.pack_count),input.windowStart)
  const existing=await tx.queryRow('SELECT e.cards, p.share_id FROM ptp_native_pool_evidence e LEFT JOIN card_pools p ON p.id=e.source_pool_id WHERE e.source_pool_id=$1',[id])
  if(existing) {
    if(!existing.share_id)throw new SoloGenerationError(410,'This saved pool was deleted.')
    if(JSON.stringify(parse(existing.cards).map((c:{id:unknown})=>c.id))!==JSON.stringify(selected.cards.map(c=>c.id)))throw new SoloGenerationError(409,'This box already has a saved selection. Continue with the saved pool.')
  } else {
    if(new Date(String(artifact.expires_at)).getTime()<=Date.now())throw new SoloGenerationError(410,'This unopened pool expired. Open a new pool.')
    const date=new Date().toISOString().slice(0,10)
    const name=`${artifact.set_code} Sealed Pool (${artifact.pack_count}-pack) ${date}`
    await tx.query(`INSERT INTO card_pools (id,user_id,share_id,set_code,set_name,pool_type,name,cards,packs,box_packs,pack_indices,is_public)
      VALUES($1,$2,$3,$4,$5,'sealed',$6,$7,$8,$9,$10,false)`,[id,userId,artifact.share_id,artifact.set_code,getSetConfig(getBaseSetCode(String(artifact.set_code)))?.setName??artifact.set_code,name,JSON.stringify(selected.cards),JSON.stringify(selected.packs),JSON.stringify(boxPacks),selected.packIndices])
    await tx.query(`INSERT INTO ptp_native_pool_evidence (source_pool_id,owner_user_id,set_code,pool_type,pack_count,cards)
      VALUES($1,$2,$3,'sealed',$4,$5)`,[id,userId,artifact.set_code,artifact.pack_count,JSON.stringify(selected.cards)])
  }
  return {shareId:String(artifact.share_id),setCode:String(artifact.set_code),isPublic:false,boxPacks,...selected,newlyCreated:!existing}
}
