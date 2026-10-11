import { podSession, readJson, respondPod } from '@/src/services/pods/http'
import { saveTournamentSettings } from '@/src/services/pods/tournamentDb'

/** PUT /api/draft/:shareId/tournament/settings — host edits before Round 1. */
export function PUT(request: Request, context: { params: Promise<{ shareId: string }> }) {
  return respondPod(async () => {
    const session = await podSession(request, true)
    return { settings: await saveTournamentSettings((await context.params).shareId, session.id, await readJson(request)) }
  })
}
