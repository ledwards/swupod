import { body, nativeSession, respond, text, uuid } from '@/src/services/play/native/http'
import { launchLocalPractice } from '@/src/services/play/native/localPractice'
export function POST(request: Request) {
  return respond(async () => {
    const session = await nativeSession(request, true)
    const input = await body(request)
    return launchLocalPractice(session.id, text(input.poolShareId, 'Deck'), uuid(input.requestId), Number(input.seat), (session.exp ?? 0) * 1000)
  })
}
