import { body, nativeSession, respond, text, uuid } from '@/src/services/play/native/http'
import { findPublicMatch, listPublicMatches } from '@/src/services/play/native/publicMatches'
import { assertPlayAvailable } from '@/src/services/play/maintenance'
export function GET(request:Request){return respond(async()=>listPublicMatches((await nativeSession(request)).id))}
export function POST(request:Request){return respond(async()=>{
  assertPlayAvailable()
  const session=await nativeSession(request,true),input=await body(request)
  return findPublicMatch(session.id,text(input.poolShareId,'poolShareId'),uuid(input.requestId))
})}
