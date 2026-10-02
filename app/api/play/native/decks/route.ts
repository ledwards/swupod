import { nativeSession, respond, text } from '@/src/services/play/native/http'
import { nativeDecks } from '@/src/services/play/native/decks'
export function GET(request:Request){return respond(async()=>{
  const session=await nativeSession(request),pool=new URL(request.url).searchParams.get('pool')
  const result = await nativeDecks(session.id,pool===null?undefined:text(pool,'pool'))
  return {...result, localAiTesting: result.localTesting && (session.is_beta_tester === true || session.is_admin === true)}
})}
