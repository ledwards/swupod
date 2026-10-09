import {nativeSession,respond,text} from '@/src/services/play/native/http'
import {syncCompetitiveGames} from '@/src/services/play/native/competitive'
export function POST(request:Request,context:{params:Promise<{shareId:string}>}){
 return respond(async()=>{const user=await nativeSession(request,true);return syncCompetitiveGames(text((await context.params).shareId,'Pod'),user.id)})
}
