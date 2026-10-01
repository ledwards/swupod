import { nativeSession, respond, uuid } from '@/src/services/play/native/http'
import { issueReplayLaunch } from '@/src/services/play/native/gameRecords'
export function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  return respond(async () => { const session = await nativeSession(request, true); return issueReplayLaunch(uuid((await context.params).matchId), session.id, (session.exp ?? 0) * 1000) })
}
