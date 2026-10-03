import { nativeSession, respond, uuid } from '@/src/services/play/native/http'
import { memberGameRecord } from '@/src/services/play/native/gameRecords'
export function GET(request: Request, context: { params: Promise<{ matchId: string }> }) {
  return respond(async () => { const session = await nativeSession(request); return memberGameRecord(uuid((await context.params).matchId), session.id) })
}
