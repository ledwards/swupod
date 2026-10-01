import { PtpPlayError } from '../playState'
import type { NativeDeckVersion } from '../deckVersions'
export interface NativeConfig { baizeUrl: string; baizeKey: string; gatewayUrl: string; gatewayKey: string; publicOrigin: string; hostOrigin: string; inviteKey: string; supportPath: string }
export function nativeConfig(env: NodeJS.ProcessEnv = process.env, existingSessions = false): NativeConfig {
  if (!existingSessions && env.PTP_NATIVE_PLAY_ENABLED !== 'true') throw new PtpPlayError(503, 'native_disabled', 'Native play is disabled.')
  const required = ['BAIZE_PVP_URL','BAIZE_PVP_SERVICE_KEY','PURRGIL_INTERNAL_URL','PURRGIL_HOST_SERVICE_KEY','PURRGIL_PUBLIC_ORIGIN','PTP_PUBLIC_ORIGIN','PTP_NATIVE_INVITE_KEY','PTP_NATIVE_SUPPORT_PATH'] as const
  if (required.some(k => !env[k])) throw new PtpPlayError(503, 'native_unconfigured', 'Native play configuration is incomplete.')
  const url = (value: string, originOnly = false) => {
    const parsed = new URL(value)
    if (parsed.username || parsed.password || parsed.search || parsed.hash || !['http:', 'https:'].includes(parsed.protocol)
      || (originOnly && parsed.pathname !== '/') || (env.NODE_ENV === 'production' && parsed.protocol !== 'https:' && !parsed.hostname.endsWith('.railway.internal'))) {
      throw new PtpPlayError(503, 'native_unconfigured', 'Native play configuration has an invalid URL.')
    }
    return originOnly ? parsed.origin : value.replace(/\/$/, '')
  }
  return { baizeUrl: url(env.BAIZE_PVP_URL!), baizeKey: env.BAIZE_PVP_SERVICE_KEY!, gatewayUrl: url(env.PURRGIL_INTERNAL_URL!), gatewayKey: env.PURRGIL_HOST_SERVICE_KEY!, publicOrigin: url(env.PURRGIL_PUBLIC_ORIGIN!, true), hostOrigin: url(env.PTP_PUBLIC_ORIGIN!, true), inviteKey: env.PTP_NATIVE_INVITE_KEY!, supportPath: env.PTP_NATIVE_SUPPORT_PATH! }
}
export function validateLaunchUrl(value: unknown, origin: string): string {
  const url = typeof value === 'string' ? new URL(value) : null
  if (!url || url.origin !== origin || url.username || url.password) throw new Error('Unexpected game launch destination')
  return url.href
}
export function terminalOutcome(status: { status?: unknown; returns?: unknown }): 'player1' | 'player2' | 'draw' | null {
  if (status.status !== 'complete') return null
  const values = status.returns
  if (!Array.isArray(values) || values.length !== 2 || values.some(v => typeof v !== 'number' || !Number.isFinite(v))) throw new Error('Invalid terminal result')
  return values[0] === values[1] ? 'draw' : values[0] > values[1] ? 'player1' : 'player2'
}
async function request(base: string, path: string, key: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: body === undefined ? null : JSON.stringify(body), signal: AbortSignal.timeout(12000), redirect: 'error', cache: 'no-store' })
  if (response.status === 400 && path === '/v1/matches' && body !== undefined) throw new PtpPlayError(409, 'runtime_rejected', 'The engine rejected this deck setup. Choose or update a supported deck and create a new invitation.')
  if (response.status === 404) throw new PtpPlayError(404, 'runtime_not_found', 'Game service has not created this match yet.')
  if (!response.ok) throw new PtpPlayError(503, 'runtime_unavailable', 'Game service is unavailable; your reserved match is safe to retry.')
  return await response.json() as Record<string, unknown>
}
export function createRuntime(config: NativeConfig, matchId: string, decks: NativeDeckVersion[]) {
  return request(config.baizeUrl, '/v1/matches', config.baizeKey, { matchId, issuer: 'ptp', decks: decks.map(deck => ({ leader: deck.leader, base: deck.base, cards: deck.deck })) })
}
export async function runtimeStatus(config: NativeConfig, matchId: string) {
  const result = await request(config.baizeUrl, `/v1/matches/${encodeURIComponent(matchId)}`, config.baizeKey)
  if (result.matchId !== matchId || result.issuer !== 'ptp' || typeof result.engineRevision !== 'string' || !Number.isSafeInteger(result.step)) throw new Error('Invalid runtime match identity')
  return result
}
export async function issueLaunch(config: NativeConfig, matchId: string, userId: string, seat: number, sessionExpiresAt: number) {
  const response = await request(config.gatewayUrl, '/internal/launch', config.gatewayKey, { issuer: 'ptp', subject: userId, matchId, seat, returnUrl: `${config.hostOrigin}/play/native?match=${encodeURIComponent(matchId)}`, expiresAt: Math.min(sessionExpiresAt, Date.now() + 6 * 60 * 60_000) })
  return { launchUrl: validateLaunchUrl(response.launchUrl, config.publicOrigin), expiresIn: 60 }
}

export async function verifyRuntimeRevision(config: NativeConfig, expected: string) {
  const support = await request(config.baizeUrl, '/v1/support', config.baizeKey)
  if (support.engineRevision !== expected || support.protocolVersion !== 1) throw new PtpPlayError(503, 'engine_revision_mismatch', 'The configured engine does not match the reviewed card support version.')
}
export async function authorizeHandoff(config: NativeConfig, userId: string, handoff: string) {
  const response = await request(config.gatewayUrl, '/internal/authorize', config.gatewayKey, { issuer: 'ptp', subject: userId, handoff })
  const destination = validateLaunchUrl(response.completeUrl, config.publicOrigin)
  if (new URL(destination).pathname !== '/complete') throw new Error('Unexpected game completion destination')
  return destination
}

export async function revokeSessions(config: NativeConfig, userId: string): Promise<void> {
  const response = await fetch(`${config.gatewayUrl}/internal/revoke`, { method: 'POST', headers: { authorization: `Bearer ${config.gatewayKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ issuer: 'ptp', subject: userId }), signal: AbortSignal.timeout(1500), redirect: 'error' })
  if (!response.ok) throw new Error('Game-session revocation unavailable')
}
