import {authorizeRecordService} from '@/src/services/play/native/gameRecords'
import {body,respond,uuid} from '@/src/services/play/native/http'
import {getCosmeticState,validateCosmeticLoadout} from '@/lib/eventCosmetics'
import {queryRow} from '@/lib/db'
import {PtpPlayError} from '@/src/services/play/playState'
export function GET(request:Request){return respond(async()=>{
  authorizeRecordService(request)
  return getCosmeticState(uuid(new URL(request.url).searchParams.get('subject')))
})}
export function POST(request:Request){return respond(async()=>{
  authorizeRecordService(request)
  const input=await body(request);const subject=uuid(input.subject)
  const state=await getCosmeticState(subject)
  if(!Number.isInteger(input.version)||input.version!==state.version)throw new PtpPlayError(409,'loadout_changed','Your collection changed. Refresh and try again.')
  let loadout
  try{loadout=validateCosmeticLoadout(input.loadout,state.catalog,state.access)}catch{throw new PtpPlayError(403,'cosmetic_locked','This selection is unavailable or locked.')}
  const updated=state.version===0
    ?await queryRow('INSERT INTO event_cosmetic_loadouts(user_id,items) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO NOTHING RETURNING version',[subject,JSON.stringify(loadout)])
    :await queryRow('UPDATE event_cosmetic_loadouts SET items=$2::jsonb,version=version+1,updated_at=now() WHERE user_id=$1 AND version=$3 RETURNING version',[subject,JSON.stringify(loadout),state.version])
  if(!updated)throw new PtpPlayError(409,'loadout_changed','Your collection changed. Refresh and try again.')
  return {loadout,version:Number(updated.version)}
})}
