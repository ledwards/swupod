import {authorizeRecordService} from '@/src/services/play/native/gameRecords'
import {respond,uuid} from '@/src/services/play/native/http'
import {sharedIdentity,sharedPlay} from '@/src/services/play/native/sharedPlay'
import {PtpPlayError} from '@/src/services/play/playState'
export function POST(request:Request){return respond(async()=>{
 authorizeRecordService(request)
 const raw=await request.text();if(raw.length>45000)throw new PtpPlayError(413,'too_large','Request is too large.')
 const input=JSON.parse(raw),subject=input.subject===null?null:uuid(input.subject)
 if(subject)await sharedIdentity(subject)
 else if(input.action!=='state')throw new PtpPlayError(401,'unauthorized','Sign in to play.')
 return sharedPlay(subject,input,Math.min(Number(input.expiresAt)||0,Date.now()+6*3600000))
})}
