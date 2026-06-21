import { after } from 'next/server'
import { buildLimitedContext } from '@/src/analytics/limitedEvents'

function posthogKey() {
  return process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY || ''
}

function posthogHost() {
  return (process.env.POSTHOG_HOST || process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '')
}

export function isPostHogServerEnabled() {
  return Boolean(posthogKey())
}

export async function captureServerEvent(
  event: string,
  distinctId: string | null | undefined,
  properties: Record<string, unknown> = {}
) {
  const apiKey = posthogKey()
  if (!apiKey || !event || !distinctId || typeof fetch !== 'function') return false

  try {
    const response = await fetch(`${posthogHost()}/capture/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        distinct_id: distinctId,
        // Segment swupod within the shared mega-project.
        properties: { ...properties, surface: 'swupod' },
      }),
    })
    return response.ok
  } catch (error) {
    console.warn('[posthog] capture failed', error)
    return false
  }
}

export function captureServerEventLater(
  event: string,
  distinctId: string | null | undefined,
  properties: Record<string, unknown> = {}
) {
  const run = () =>
    captureServerEvent(event, distinctId, properties).catch(error => {
      console.warn('[posthog] capture failed', error)
    })
  // On Vercel serverless the function can freeze the instant the response is
  // sent, dropping un-awaited work. `after()` keeps the capture alive past the
  // response flush. Outside a request scope (scripts/tests) `after()` throws —
  // fall back to plain fire-and-forget.
  try {
    after(run)
  } catch {
    run()
  }
}

export function buildLimitedServerProperties(properties: Record<string, unknown> = {}) {
  const limitedContext = buildLimitedContext(properties)
  const sanitized = { ...properties }
  for (const key of [
    'shareId',
    'poolShareId',
    'podShareId',
    'draftShareId',
    'matchId',
    'poolId',
    'podId',
    'share_id',
    'pool_id',
    'pod_id',
    'match_id',
    'currentUrl',
    'current_url',
  ]) {
    delete sanitized[key]
  }
  return {
    ...sanitized,
    ...limitedContext,
  }
}

export function captureLimitedServerEvent(
  event: string,
  distinctId: string | null | undefined,
  properties: Record<string, unknown> = {}
) {
  captureServerEventLater(event, distinctId, buildLimitedServerProperties(properties))
}
