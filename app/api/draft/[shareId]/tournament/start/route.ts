import { podSession, readJson, respondPod } from '@/src/services/pods/http'
import { startTournament } from '@/src/services/pods/tournamentDb'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'

/** POST /api/draft/:shareId/tournament/start — host starts Round 1 with these settings. */
export function POST(request: Request, context: { params: Promise<{ shareId: string }> }) {
  return respondPod(async () => {
    const session = await podSession(request, true)
    const { shareId } = await context.params
    const started = await startTournament(shareId, session.id, await readJson(request))
    await broadcastDraftState(shareId).catch(() => {})
    return { settings: started.settings }
  })
}
