import {getSession} from '@/lib/auth'
import {nativeSession,respond} from '@/src/services/play/native/http'
import {sharedPlay} from '@/src/services/play/native/sharedPlay'
import {PtpPlayError} from '@/src/services/play/playState'
export function GET(request:Request){return respond(async()=>{const session=getSession(request);if(session)await nativeSession(request);return sharedPlay(session?.id??null,{action:'state'})})}
export function POST(request:Request){return respond(async()=>{
 const session=await nativeSession(request,true)
 const raw=await request.text();if(raw.length>40000)throw new PtpPlayError(413,'too_large','Deck export is too large.')
 let input;try{input=JSON.parse(raw)}catch{throw new PtpPlayError(400,'invalid_json','Use a JSON object.')}
 return sharedPlay(session.id,input,(session.exp??0)*1000)
})}
