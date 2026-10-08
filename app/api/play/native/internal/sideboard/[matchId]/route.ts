import {respond,uuid,body,text} from '@/src/services/play/native/http'
import {authorizeRecordService} from '@/src/services/play/native/gameRecords'
import {inGameSideboard} from '@/lib/play/inGameSideboard'
import {PtpPlayError} from '@/src/services/play/playState'
export function POST(request:Request,context:{params:Promise<{matchId:string}>}) {
 return respond(async()=>{
  authorizeRecordService(request)
  const input=await body(request,16384)
  if(!['open','convert','ready'].includes(String(input.action))||!Number.isFinite(input.expiresAt)||Number(input.expiresAt)<=Date.now())throw new PtpPlayError(400,'invalid_input','Invalid sideboarding request.')
  return inGameSideboard(uuid((await context.params).matchId),uuid(input.subject),{action:String(input.action),expiresAt:Number(input.expiresAt),...(input.gameId?{gameId:uuid(input.gameId)}:{}),selection:input.selection,...(input.buildShareId?{buildShareId:text(input.buildShareId,'Saved build')}:{})})
 })
}
