/**
 * Alpha testers have one Play setup: the homepage bundle's Play view, served at /play.
 * The bundle reads its initial state from the URL:
 *   /play?format=premier|eternal|draft|sealed  opens Play on that format
 *   /play?…&pool=<shareId>                     opens Play with that deck selected (the bundle checks its format and set)
 *   /play?invite=<token>                       opens Play to join a private game
 * `set` and `limited` (eight, chaos) ride along for limited formats; bundles that
 * do not read them yet fall back to the newest set and six packs.
 */
type Query = Record<string, string | string[] | undefined>
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || undefined

export function playSetupPath(query: Query | URLSearchParams): string {
  const get = (key: string) => query instanceof URLSearchParams ? query.get(key)?.trim() || undefined : one(query[key])
  const invite = get('invite'), pool = get('pool')
  if (invite) return `/play?${new URLSearchParams({invite})}`
  const format = get('format'), limited = get('limited'), set = get('set')
  const params = new URLSearchParams()
  if (format === 'premier' || format === 'eternal') params.set('format', format)
  else if (limited === 'draft' || format === 'draft') params.set('format', 'draft')
  else if (limited === 'six' || limited === 'eight' || limited === 'chaos' || format === 'sealed' || format === 'limited') params.set('format', 'sealed')
  if (params.get('format') === 'sealed' && (limited === 'eight' || limited === 'chaos')) params.set('limited', limited)
  if (set && /^[A-Za-z0-9]{2,6}$/.test(set) && (params.get('format') === 'draft' || params.get('format') === 'sealed')) params.set('set', set.toUpperCase())
  // Pools are limited decks: a pool link never carries a constructed format.
  if (pool) { if (params.get('format') === 'premier' || params.get('format') === 'eternal') params.delete('format'); params.set('pool', pool) }
  return `/play${params.size ? `?${params}` : ''}`
}

/** The pool row behind a build: its source pool and, for pod pools, the pod. */
export type PoolPlayRow = {
  pool_type?: string | null
  set_code?: string | null
  pod_id?: unknown
  pod_share_id?: unknown
  competitive?: boolean | null
  settings?: unknown
  /** How many packs the source pool opened: 3 for draft, 6 or 8 for sealed. */
  pack_count?: number | string | null
}

const parse = (value: unknown) => { if (typeof value !== 'string') return value; try { return JSON.parse(value) } catch { return null } }

/** What a draft pod does after the draft: the host's saved tournament rules, else what Create a Pod chose. Undefined for pods made before the choice existed. */
export function afterDraftOf(settings: unknown): 'none' | 'swiss' | 'elimination' | undefined {
  const s = (parse(settings) && typeof parse(settings) === 'object' ? parse(settings) : {}) as Record<string, unknown>
  const t = s.tournament && typeof s.tournament === 'object' ? s.tournament as Record<string, unknown> : undefined
  const value = t?.format ?? t?.afterDraft ?? s.afterDraft
  return value === 'none' || value === 'just_draft' ? 'none' : value === 'swiss' || value === 'elimination' ? value : undefined
}

/**
 * Where Play goes once a deck is built.
 * - Solo pools open Play on the deck's own tab with the deck selected.
 * - For alpha testers, a draft pod that chose None after the draft does the same.
 * - Otherwise pods keep their destination: competitive pods their Swiss page, others the pod page.
 *   Pods made before the After-the-draft choice existed count as None, except competitive
 *   pods, which keep their Swiss page.
 */
export function poolPlayRoute(shareId: string, pool: PoolPlayRow | null | undefined, alpha: boolean): {competitive: true} | {redirect: string} {
  const settings = parse(pool?.settings) as {isSolo?: boolean} | null
  const draft = pool?.pool_type === 'draft'
  const solo = (pool?.pool_type === 'sealed' && !pool.pod_id) || (draft && settings?.isSolo === true)
  const after = afterDraftOf(settings) ?? (pool?.competitive === true ? undefined : 'none')
  const justDraft = alpha && draft && !!pool?.pod_share_id && after === 'none'
  if (!justDraft && pool?.competitive === true && pool.pod_share_id) return {competitive: true}
  if (!solo && !justDraft && pool?.pod_share_id) return {redirect: `/${draft ? 'draft' : 'sealed'}/${encodeURIComponent(String(pool.pod_share_id))}/pod`}
  if (!alpha) return {redirect: `/play?pool=${encodeURIComponent(shareId)}`}
  const count = Number(pool?.pack_count ?? 0)
  return {redirect: playSetupPath(pool?.pool_type ? {pool: shareId, limited: draft ? 'draft' : count === 8 ? 'eight' : 'six', set: pool.set_code ?? undefined} : {pool: shareId})}
}
