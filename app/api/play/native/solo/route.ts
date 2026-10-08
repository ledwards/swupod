import {parseAiStyle} from '@/src/services/play/solo/aiStyles'
import {soloSession} from '@/lib/play/soloAuth'
import {launchSoloAi} from '@/lib/play/soloAi'
import {soloReplayLaunch,retrySoloGame} from '@/lib/play/soloRecords'
import {soloStatus} from '@/lib/play/soloStatus'
import {body,respond,text,uuid} from '@/src/services/play/native/http'
import {PtpPlayError} from '@/src/services/play/playState'
export function GET(request:Request){return respond(async()=>{
 const session=await soloSession(request),params=new URL(request.url).searchParams
 return soloStatus(session.id,text(params.get('pool'),'Saved deck'),params.has('request')?uuid(params.get('request')):undefined,params.get('format')==='elimination'?'elimination':params.get('format')==='swiss'?'swiss':undefined)
})}
export function POST(request:Request){return respond(async()=>{
 const session=await soloSession(request,true),input=await body(request)
 if(input.action==='retry')return retrySoloGame(uuid(input.gameId),session.id)
 if(input.action==='replay')return soloReplayLaunch(uuid(input.gameId),session.id,(session.exp??0)*1000)
 if(input.matchBestOf!==undefined&&input.matchBestOf!==1&&input.matchBestOf!==3)throw new PtpPlayError(400,'invalid_match_length','Choose BO1 or BO3.')
 if(input.eventFormat!==undefined&&input.eventFormat!=='swiss'&&input.eventFormat!=='elimination')throw new PtpPlayError(400,'invalid_event_format','Choose Swiss or elimination.')
 if(input.action!==undefined&&input.action!=='play'&&input.action!=='prepare')throw new PtpPlayError(400,'invalid_action','Unknown solo action.')
 return launchSoloAi(session.id,text(input.poolShareId,'Saved deck'),uuid(input.requestId),(session.exp??0)*1000,session,{prepareOnly:input.action==='prepare',...(input.matchBestOf!==undefined?{matchBestOf:input.matchBestOf as 1|3}:{}),eventFormat:input.eventFormat==='elimination'?'elimination':'swiss',...(input.aiStyle!==undefined?{aiStyle:parseAiStyle(input.aiStyle)}:{})})
})}
