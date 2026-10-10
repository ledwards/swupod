import {requireAlphaAccess} from '@/lib/auth'
import {uuid,respond} from '@/src/services/play/native/http'
import {soloReplayLaunch} from '@/lib/play/soloRecords'
import {issueReplayLaunch} from '@/src/services/play/native/gameRecords'
export async function GET(request:Request,{params}:{params:Promise<{gameId:string}>}){
 let destination:string|undefined
 const error=await respond(async()=>{
  const user=await requireAlphaAccess(request),id=uuid((await params).gameId)
  const replay=new URL(request.url).searchParams.get('kind')==='solo'
   ?await soloReplayLaunch(id,user.id,(user.exp??0)*1000)
   :await issueReplayLaunch(id,user.id,(user.exp??0)*1000)
  destination=replay.launchUrl
  return {ok:true}
 })
 return destination?Response.redirect(destination,303):error
}
