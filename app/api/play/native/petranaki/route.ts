import { body, nativeSession, respond, uuid } from '@/src/services/play/native/http'
import { launchPetranakiPractice } from '@/src/services/play/native/petranaki'
export function POST(request: Request) {
  return respond(async () => {
    const session = await nativeSession(request, true)
    const input = await body(request)
    return launchPetranakiPractice(session.id, uuid(input.requestId), process.env, fetch, (session.exp ?? 0) * 1000)
  })
}
