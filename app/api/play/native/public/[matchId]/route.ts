import { nativeSession, respond, uuid } from '@/src/services/play/native/http'
import { cancelPublicMatch } from '@/src/services/play/native/publicMatches'
export function DELETE(request:Request,context:{params:Promise<{matchId:string}>}){return respond(async()=>{
  const session=await nativeSession(request,true)
  return cancelPublicMatch(uuid((await context.params).matchId),session.id)
})}
