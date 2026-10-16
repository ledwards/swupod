import { randomUUID } from 'node:crypto'
import { PtpPlayError } from '../../src/services/play/playState'
import { NativeDeckEligibilityError } from '../../src/services/play/deckVersions'
import { PackWarsUnsupportedError } from '../../src/services/play/packWarsDeck'
import { body, text, uuid } from '../../src/services/play/native/http'
import type { Session } from '../auth'
import type { SoloOptions } from './soloAi'

/**
 * `/api/formats/pack-wars/[shareId]/ai`: Pack Wars vs the AI, one game, aspect
 * penalties on (Workstream C1). Alpha only, behind PTP_PACK_WARS_NATIVE_ENABLED.
 *
 * GET  → `{ready: true}` or `{ready: false, code, message, cards?}` (cards: names the engine can't play yet)
 * POST `{leaderId, baseId, requestId?}` → `{url, runId, requestId}`, or `{message, code, cards?}` with an error status.
 * A retry with the same `requestId` resumes the same game; omit it to start a new one.
 */
export interface PackWarsAiDeps {
  enabled: () => boolean
  session: (request: Request, mutation?: boolean) => Promise<Session>
  launch: (userId: string, shareId: string, requestId: string, expiresAt: number, session: Session, options: SoloOptions) => Promise<Record<string, unknown>>
  readiness: (userId: string, shareId: string) => Promise<Record<string, unknown>>
}
type Context = { params: Promise<{ shareId: string }> }

function errorResponse(error: unknown): Response {
  const headers = { 'cache-control': 'no-store' }
  if (error instanceof PackWarsUnsupportedError) return Response.json({ message: error.message, code: error.code, cards: error.cards }, { status: error.status, headers })
  if (error instanceof PtpPlayError) return Response.json({ message: error.message, code: error.code }, { status: error.status, headers })
  if (error instanceof NativeDeckEligibilityError) return Response.json({ message: error.message, code: error.code }, { status: 409, headers })
  // No upstream responses, credentials or deck payloads in client errors.
  return Response.json({ message: 'Pack Wars against the AI is unavailable right now. Try again.', code: 'native_unavailable' }, { status: 503, headers })
}
async function respond(action: () => Promise<unknown>): Promise<Response> {
  try { return Response.json(await action(), { headers: { 'cache-control': 'no-store' } }) }
  catch (error) { return errorResponse(error) }
}
function gate(deps: PackWarsAiDeps) {
  // Indistinguishable from a missing route while the switch is off.
  if (!deps.enabled()) throw new PtpPlayError(404, 'not_found', 'Not found.')
}

export function packWarsAiHandlers(deps: PackWarsAiDeps) {
  return {
    GET: (request: Request, context: Context) => respond(async () => {
      gate(deps)
      const session = await deps.session(request)
      const { shareId } = await context.params
      return deps.readiness(session.id, text(shareId, 'Pack Wars pool'))
    }),
    POST: (request: Request, context: Context) => respond(async () => {
      gate(deps)
      const session = await deps.session(request, true)
      const { shareId } = await context.params
      const input = await body(request)
      if (Object.keys(input).some(key => !['leaderId', 'baseId', 'requestId'].includes(key))) throw new PtpPlayError(400, 'invalid_input', 'Unexpected fields.')
      const leaderId = text(input.leaderId, 'Leader'), baseId = text(input.baseId, 'Base')
      const requestId = input.requestId === undefined ? randomUUID() : uuid(input.requestId)
      const launched = await deps.launch(session.id, text(shareId, 'Pack Wars pool'), requestId, (session.exp ?? 0) * 1000, session, { singleGame: true, packWars: { leaderId, baseId } })
      if (typeof launched.launchUrl !== 'string') throw new Error('Launch expected')
      return { url: launched.launchUrl, runId: launched.runId, requestId }
    }),
  }
}
