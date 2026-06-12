// @ts-nocheck
/**
 * Shared analytics vocabulary for limited matchmaking-density instrumentation.
 *
 * Keep this module browser-safe: it is imported by client components and
 * server routes. Avoid Node-only APIs here.
 */

export const LimitedAnalyticsEvents = {
  LIMITED_FLOW_STARTED: 'limited_flow_started',
  LIMITED_POD_CREATED: 'limited_pod_created',
  LIMITED_POD_JOINED: 'limited_pod_joined',
  LIMITED_POD_INVITE_COPIED: 'limited_pod_invite_copied',
  LIMITED_POD_STARTED: 'limited_pod_started',
  LIMITED_POD_COMPLETED: 'limited_pod_completed',
  LIMITED_POOL_CREATED: 'limited_pool_created',
  LIMITED_DECK_BUILDER_OPENED: 'limited_deck_builder_opened',
  LIMITED_DECK_BUILT: 'limited_deck_built',
  LIMITED_PLAY_PAGE_VIEWED: 'limited_play_page_viewed',
  LIMITED_PLAY_ACTION_USED: 'limited_play_action_used',
  LIMITED_MATCH_RESULT_REPORTED: 'limited_match_result_reported',
} as const

export const LimitedPlayActions = {
  COPY_DECK_LINK: 'copy_deck_link',
  COPY_DECK_JSON: 'copy_deck_json',
  DOWNLOAD_DECK_JSON: 'download_deck_json',
  GENERATE_DECK_IMAGE: 'generate_deck_image',
  GENERATE_POOL_IMAGE: 'generate_pool_image',
  OPEN_KARABAST: 'open_karabast',
  WAYFINDER_CREATE_PRIVATE_LOBBY: 'wayfinder_create_private_lobby',
  WAYFINDER_CREATE_PUBLIC_LOBBY: 'wayfinder_create_public_lobby',
  WAYFINDER_JOIN_PRIVATE_LOBBY: 'wayfinder_join_private_lobby',
  WAYFINDER_JOIN_PUBLIC_GAME: 'wayfinder_join_public_game',
  POST_TO_DISCORD: 'post_to_discord',
  CHAT_OPEN: 'chat_open',
  CHAT_SEND: 'chat_send',
  PRACTICE_HAND_DRAW: 'practice_hand_draw',
  MATCH_REPORT_OPEN: 'match_report_open',
  MATCH_RESULT_SUBMIT: 'match_result_submit',
} as const

const VALID_FORMATS = new Set(['draft', 'sealed'])
const VALID_MODES = new Set(['solo', 'group'])

export function normalizeLimitedFormat(format: unknown): 'draft' | 'sealed' | null {
  if (format === 'sealed_pod') return 'sealed'
  if (format === 'pool') return null
  if (typeof format !== 'string') return null
  const normalized = format.trim().toLowerCase()
  return VALID_FORMATS.has(normalized) ? normalized as 'draft' | 'sealed' : null
}

export function normalizeLimitedMode(mode: unknown): 'solo' | 'group' | null {
  if (typeof mode !== 'string') return null
  const normalized = mode.trim().toLowerCase()
  return VALID_MODES.has(normalized) ? normalized as 'solo' | 'group' : null
}

export function inferLimitedMode({
  poolType,
  podId,
  draftShareId,
  isSolo,
}: {
  poolType?: unknown
  podId?: unknown
  draftShareId?: unknown
  isSolo?: unknown
} = {}): 'solo' | 'group' {
  if (isSolo === true) return 'solo'
  if (poolType === 'sealed_pod') return 'group'
  if (podId || draftShareId) return 'group'
  return 'solo'
}

export function routeTemplateFromPath(path: unknown): string | null {
  if (typeof path !== 'string' || !path.trim()) return null
  let pathname = path.trim()
  try {
    if (/^https?:\/\//i.test(pathname)) {
      pathname = new URL(pathname).pathname
    }
  } catch {
    return null
  }
  return pathname
    .replace(/\/pool\/[^/?#]+\/deck\/play$/, '/pool/[shareId]/deck/play')
    .replace(/\/pool\/[^/?#]+\/deck$/, '/pool/[shareId]/deck')
    .replace(/\/draft\/[^/?#]+\/pod$/, '/draft/[shareId]/pod')
    .replace(/\/draft\/[^/?#]+$/, '/draft/[shareId]')
    .replace(/\/sealed\/[^/?#]+\/pod$/, '/sealed/[shareId]/pod')
    .replace(/\/sealed\/[^/?#]+$/, '/sealed/[shareId]')
}

export function hashAnalyticsId(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (!raw) return null

  // FNV-1a 64-bit using BigInt. This is intentionally small and browser-safe;
  // the goal is to prevent raw share IDs from entering product analytics.
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  for (let i = 0; i < raw.length; i++) {
    hash ^= BigInt(raw.charCodeAt(i))
    hash = BigInt.asUintN(64, hash * prime)
  }
  return `h_${hash.toString(36)}`
}

function cleanNullish(properties: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined)
  )
}

export function buildLimitedContext(input: Record<string, unknown> = {}) {
  const format = normalizeLimitedFormat(input.format ?? input.pool_type ?? input.poolType)
  const mode = normalizeLimitedMode(input.mode) || inferLimitedMode({
    poolType: input.pool_type ?? input.poolType,
    podId: input.pod_id ?? input.podId ?? input.podShareId ?? input.draftShareId,
    draftShareId: input.draftShareId,
    isSolo: input.isSolo,
  })

  const routeTemplate = input.route_template || input.routeTemplate
    || routeTemplateFromPath(input.source_route || input.sourceRoute || input.current_url || input.currentUrl)

  return cleanNullish({
    format,
    mode,
    set_code: input.set_code ?? input.setCode ?? null,
    route_template: routeTemplate,
    source_route: routeTemplate,
    flow_id: input.flow_id ?? input.flowId ?? null,
    pod_id_hash: input.pod_id_hash ?? input.podIdHash ?? hashAnalyticsId(input.pod_id ?? input.podId ?? input.podShareId ?? input.draftShareId),
    pool_id_hash: input.pool_id_hash ?? input.poolIdHash ?? hashAnalyticsId(input.pool_id ?? input.poolId ?? input.poolShareId ?? input.shareId),
    match_id_hash: input.match_id_hash ?? input.matchIdHash ?? hashAnalyticsId(input.match_id ?? input.matchId),
  })
}

export function getOrCreateLimitedFlowId(key = 'default'): string | null {
  if (typeof window === 'undefined') return null
  const storageKey = `limitedFlowId:${key}`
  const existing = window.sessionStorage.getItem(storageKey)
  if (existing) return existing

  const id = typeof window.crypto?.randomUUID === 'function'
    ? window.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  window.sessionStorage.setItem(storageKey, id)
  return id
}

export function clearLimitedFlowId(key = 'default') {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(`limitedFlowId:${key}`)
}
