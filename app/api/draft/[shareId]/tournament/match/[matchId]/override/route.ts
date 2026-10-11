import { podSession, readJson, respondPod } from '@/src/services/pods/http'
import { overrideMatchResult } from '@/src/services/pods/tournamentDb'
import { uuid } from '@/src/services/play/native/http'

/** POST {player1Wins, player2Wins} — the host fixes a match result. */
export function POST(request: Request, context: { params: Promise<{ shareId: string; matchId: string }> }) {
  return respondPod(async () => {
    const session = await podSession(request, true), params = await context.params
    const body = await readJson(request)
    return overrideMatchResult(params.shareId, session.id, uuid(params.matchId), Number(body.player1Wins), Number(body.player2Wins))
  })
}
