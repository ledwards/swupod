import { body, nativeSession, respond, text } from '@/src/services/play/native/http'
import { invitation } from '@/src/services/play/native/privateMatches'
type Context = { params: Promise<{ token: string }> }
export function GET(request: Request, context: Context) {
  return respond(async () => { const session = await nativeSession(request); return invitation(text((await context.params).token, 'token'), session.id) })
}
export function POST(request: Request, context: Context) {
  return respond(async () => { const session = await nativeSession(request, true); const input = await body(request); return invitation(text((await context.params).token, 'token'), session.id, text(input.poolShareId, 'poolShareId')) })
}
export function DELETE(request: Request, context: Context) {
  return respond(async () => { const session = await nativeSession(request, true); return invitation(text((await context.params).token, 'token'), session.id, undefined, true) })
}
