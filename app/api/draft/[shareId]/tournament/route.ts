import { getSession } from '@/lib/auth'
import { loadHubView } from '@/src/services/pods/hubLoader'
import { respondPod } from '@/src/services/pods/http'

/** GET /api/draft/:shareId/tournament — the pod page: seats, decks, rounds, standings. Advances the event as a side effect. */
export function GET(request: Request, context: { params: Promise<{ shareId: string }> }) {
  return respondPod(async () => loadHubView((await context.params).shareId, getSession(request)?.id ?? null))
}
