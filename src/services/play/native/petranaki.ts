import { PtpPlayError } from '../playState'
import { nativeConfig, validateLaunchUrl } from './runtimeClient'
/** Analysis admission is separate from competitive match/deck/result tables. */
export async function launchPetranakiPractice(subject: string, requestId: string, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch, expiresAt = Date.now() + 6 * 3600000) {
  if (env.PTP_PETRANAKI_ENABLED !== 'true') throw new PtpPlayError(503, 'petranaki_disabled', 'Petranaki practice is paused.')
  const config = nativeConfig(env)
  const response = await fetchImpl(`${config.gatewayUrl}/internal/petranaki/practice`, {
    method: 'POST', headers: { Authorization: `Bearer ${config.gatewayKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ issuer: 'ptp', subject, requestId, expiresAt }), redirect: 'error', signal: AbortSignal.timeout(20000), cache: 'no-store',
  })
  if (!response.ok) throw new PtpPlayError(503, 'petranaki_unavailable', 'Petranaki practice is unavailable. Retry with the same request.')
  const data = await response.json()
  if (data.engine !== 'petranaki' || data.kind !== 'analysis') throw new Error('Invalid Petranaki launch identity')
  const launchUrl = validateLaunchUrl(data.launchUrl, config.publicOrigin)
  const parsed = new URL(launchUrl)
  if (parsed.pathname !== '/petranaki/player/index.html' || parsed.search || !new URLSearchParams(parsed.hash.slice(1)).has('token')) throw new Error('Invalid Petranaki launch destination')
  return { engine: 'petranaki', kind: 'analysis', launchUrl }
}
