import { nativeSession, respond, uuid } from '@/src/services/play/native/http'
import { getMatch } from '@/src/services/play/native/privateMatches'
export function GET(request: Request, context: { params: Promise<{ matchId: string }> }) {
  return respond(async () => { const session = await nativeSession(request); return getMatch(uuid((await context.params).matchId), session.id) })
}
