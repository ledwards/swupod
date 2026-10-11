import { podSession, readJson, respondPod } from '@/src/services/pods/http'
import { saveDecksPublic } from '@/src/services/pods/tournamentDb'

/** PUT /api/draft/:shareId/decks-public — host only: every pod member can open every deck and pool, or only their own. */
export function PUT(request: Request, context: { params: Promise<{ shareId: string }> }) {
  return respondPod(async () => {
    const session = await podSession(request, true)
    const body = await readJson(request)
    return saveDecksPublic((await context.params).shareId, session.id, body.decksPublic === true)
  })
}
