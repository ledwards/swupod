import { nativeSession, uuid } from '@/src/services/play/native/http'
import { respondPod } from '@/src/services/pods/http'
import { launchPodGame } from '@/src/services/pods/podGames'

/** POST — launch or resume the viewer's current game at this table. Returns a one-use launch URL. */
export function POST(request: Request, context: { params: Promise<{ shareId: string; matchId: string }> }) {
  return respondPod(async () => {
    const user = await nativeSession(request, true), params = await context.params
    return launchPodGame(params.shareId, uuid(params.matchId), user.id, (user.exp ?? 0) * 1000)
  })
}
