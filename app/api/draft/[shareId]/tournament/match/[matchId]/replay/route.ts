import { nativeSession, uuid } from '@/src/services/play/native/http'
import { readJson, respondPod } from '@/src/services/pods/http'
import { replayPodGame } from '@/src/services/pods/podGames'

/** POST { gameId } — replay a finished, recorded game of this table. Returns a one-use launch URL. */
export function POST(request: Request, context: { params: Promise<{ shareId: string; matchId: string }> }) {
  return respondPod(async () => {
    const user = await nativeSession(request, true), params = await context.params
    const body = await readJson(request)
    return replayPodGame(params.shareId, uuid(params.matchId), uuid(body.gameId), user.id, (user.exp ?? 0) * 1000)
  })
}
