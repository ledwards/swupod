import {soloSession} from '@/lib/play/soloAuth'
import {launchSoloAi} from '@/lib/play/soloAi'
import {soloReplayLaunch,retrySoloGame} from '@/lib/play/soloRecords'
import {soloStatus} from '@/lib/play/soloStatus'
import {body,respond,text,uuid} from '@/src/services/play/native/http'
import {PtpPlayError} from '@/src/services/play/playState'
export function GET(request:Request){return respond(async()=>{
 const session=await soloSession(request),params=new URL(request.url).searchParams
 return soloStatus(session.id,text(params.get('pool'),'Saved deck'),params.has('request')?uuid(params.get('request')):undefined)
})}
export function POST(request:Request){return respond(async()=>{
 const session=await soloSession(request,true),input=await body(request)
 if(input.action==='retry')return retrySoloGame(uuid(input.gameId),session.id)
 if(input.action==='replay')return soloReplayLaunch(uuid(input.gameId),session.id,(session.exp??0)*1000)
 if(input.action!==undefined&&input.action!=='play')throw new PtpPlayError(400,'invalid_action','Unknown solo action.')
 return launchSoloAi(session.id,text(input.poolShareId,'Saved deck'),uuid(input.requestId),(session.exp??0)*1000,session)
})}
