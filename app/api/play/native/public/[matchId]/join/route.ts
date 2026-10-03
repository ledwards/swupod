import { body, nativeSession, respond, text, uuid } from '@/src/services/play/native/http'
import { joinPublicMatch } from '@/src/services/play/native/publicMatches'
export function POST(request:Request,context:{params:Promise<{matchId:string}>}){return respond(async()=>{
  const session=await nativeSession(request,true),input=await body(request)
  return joinPublicMatch(uuid((await context.params).matchId),session.id,text(input.poolShareId,'poolShareId'),uuid(input.requestId))
})}
