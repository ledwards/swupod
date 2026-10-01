import { body, nativeSession, respond, uuid } from '@/src/services/play/native/http'
import { rematch } from '@/src/services/play/native/rematches'
import { PtpPlayError } from '@/src/services/play/playState'
type Context = { params: Promise<{ matchId: string }> }
export function GET(request: Request, context: Context) {
  return respond(async () => { const session = await nativeSession(request); return rematch(uuid((await context.params).matchId),session.id) })
}
export function POST(request: Request, context: Context) {
  return respond(async () => { const session = await nativeSession(request,true); const input = await body(request); if (typeof input.accept !== 'boolean') throw new PtpPlayError(400,'invalid_input','accept must be a boolean.'); return rematch(uuid((await context.params).matchId),session.id,input.accept) })
}
