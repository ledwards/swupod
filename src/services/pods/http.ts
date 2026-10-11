import { getSession, type Session } from '../../../lib/auth'
import { queryRow } from '../../../lib/db'
import { PtpPlayError } from '../play/playState'
import { PodTournamentError } from './tournamentDb'

/** Signed-in, current-version alpha tester or admin: pods' play features are alpha-only like the rest of native play. */
export async function podSession(request: Request, mutation = false): Promise<Session> {
  if (mutation) {
    const origin = request.headers.get('origin'), host = request.headers.get('host')
    if (origin && host && new URL(origin).host !== host) throw new PodTournamentError(403, 'invalid_origin', 'Request origin is not allowed.')
  }
  const session = getSession(request)
  if (!session) throw new PodTournamentError(401, 'unauthorized', 'Sign in first.')
  const user = await queryRow('SELECT auth_version,is_admin,is_alpha_tester FROM users WHERE id=$1', [session.id])
  if (!user || user.auth_version !== session.auth_version) throw new PodTournamentError(401, 'session_expired', 'Sign in again.')
  if (!user.is_admin && !user.is_alpha_tester) throw new PodTournamentError(403, 'alpha_required', 'Not available yet.')
  return session
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (text.length > 4096) throw new PodTournamentError(413, 'body_too_large', 'Request is too large.')
  try { const v = text ? JSON.parse(text) : {}; return v && typeof v === 'object' && !Array.isArray(v) ? v : {} }
  catch { throw new PodTournamentError(400, 'invalid_input', 'Invalid JSON.') }
}

export async function respondPod(action: () => Promise<unknown>): Promise<Response> {
  const headers = { 'cache-control': 'no-store' }
  try { return Response.json(await action(), { headers }) }
  catch (error) {
    if (error instanceof PodTournamentError || error instanceof PtpPlayError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers })
    console.error('[PodTournament]', error instanceof Error ? error.message : 'error')
    return Response.json({ error: 'Something went wrong. Try again.', code: 'pod_unavailable' }, { status: 503, headers })
  }
}
