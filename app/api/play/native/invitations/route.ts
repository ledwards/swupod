import { body, nativeSession, respond, text, uuid } from '@/src/services/play/native/http'
import { createInvitation } from '@/src/services/play/native/privateMatches'
export function POST(request: Request) {
  return respond(async () => {
    const session = await nativeSession(request, true)
    const input = await body(request)
    return createInvitation(session.id, text(input.poolShareId, 'poolShareId'), uuid(input.requestId), input.allowMismatch === true)
  })
}
