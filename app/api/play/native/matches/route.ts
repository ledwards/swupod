import { nativeSession, respond } from '@/src/services/play/native/http'
import { listNativeMatches } from '@/src/services/play/native/privateMatches'
export function GET(request: Request) {
  return respond(async () => { const session = await nativeSession(request); return listNativeMatches(session.id) })
}
