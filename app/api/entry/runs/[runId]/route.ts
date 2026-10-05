import {soloSession} from '@/lib/play/soloAuth'
import {queryRow} from '@/lib/db'
import {respond,uuid} from '@/src/services/play/native/http'
import {PtpPlayError} from '@/src/services/play/playState'
export function GET(request:Request,{params}:{params:Promise<{runId:string}>}) {return respond(async()=>{
 const session=await soloSession(request), {runId}=await params
 const run=await queryRow('SELECT pool_share_id,request_id,prepared FROM ptp_solo_ai_runs WHERE id=$1 AND owner_user_id=$2',[uuid(runId),session.id])
 if(!run)throw new PtpPlayError(404,'not_found','Tournament or game not found.')
 const prepared=typeof run.prepared==='string'?JSON.parse(run.prepared):run.prepared
 return {pool:String(run.pool_share_id),request:String(run.request_id),format:prepared.singleGame?'ai':prepared.eventFormat==='elimination'?'elimination':'swiss'}
})}
