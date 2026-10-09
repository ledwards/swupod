import {nativeSession,respond,uuid,text} from '@/src/services/play/native/http'
import {launchCompetitiveGame} from '@/src/services/play/native/competitive'
export function POST(request:Request,context:{params:Promise<{shareId:string;matchId:string}>}){
 return respond(async()=>{
  const user=await nativeSession(request,true),params=await context.params
  return launchCompetitiveGame(text(params.shareId,'Pod'),uuid(params.matchId),user.id,(user.exp??0)*1000)
 })
}
