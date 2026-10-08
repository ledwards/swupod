import { soloSession } from '@/lib/play/soloAuth'
import { getSoloSideboard, continueSoloSideboard } from '@/lib/play/soloSideboard'
import { respond, body, uuid, text } from '@/src/services/play/native/http'
export function GET(request: Request) {
  return respond(async () => {
    const user = await soloSession(request)
    return getSoloSideboard(uuid(new URL(request.url).searchParams.get('run')), user.id)
  })
}
export function POST(request: Request) {
  return respond(async () => {
    const user = await soloSession(request,true), input = await body(request,16384)
    return continueSoloSideboard(uuid(input.runId),uuid(input.gameId),user.id,(user.exp??0)*1000,input.selection,
      input.buildShareId ? text(input.buildShareId,'Saved build') : undefined)
  })
}
