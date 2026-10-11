import { nativeSession, uuid } from '@/src/services/play/native/http'
import { respondPod } from '@/src/services/pods/http'
import { watchPodGame } from '@/src/services/pods/podGames'

/** POST — spectate this table's live game (pod members only). Returns a one-use launch URL. */
export function POST(request: Request, context: { params: Promise<{ shareId: string; matchId: string }> }) {
  return respondPod(async () => {
    const user = await nativeSession(request, true), params = await context.params
    return watchPodGame(params.shareId, uuid(params.matchId), user.id, (user.exp ?? 0) * 1000)
  })
}
