/**
 * Alpha testers have one Play setup: the homepage bundle's Play view, served on
 * the /lobby shell. The bundle reads its initial state from the URL:
 *   /lobby/constructed?format=premier|eternal|draft|sealed  opens Play on that format
 *   /lobby?pool=<shareId>                                     opens Play with that deck (its format and set)
 *   /lobby?invite=<token>                                     opens Play to join a private game
 * `set` and `limited` (eight, chaos) ride along for limited formats; bundles that
 * do not read them yet fall back to the newest set and six packs.
 */
type Query = Record<string, string | string[] | undefined>
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || undefined

export function playSetupPath(query: Query | URLSearchParams): string {
  const get = (key: string) => query instanceof URLSearchParams ? query.get(key)?.trim() || undefined : one(query[key])
  const invite = get('invite'), pool = get('pool')
  if (invite) return `/lobby?${new URLSearchParams({invite})}`
  if (pool) return `/lobby?${new URLSearchParams({pool})}`
  const format = get('format'), limited = get('limited'), set = get('set')
  const params = new URLSearchParams()
  if (format === 'premier' || format === 'eternal') params.set('format', format)
  else if (limited === 'draft' || format === 'draft') params.set('format', 'draft')
  else if (limited === 'six' || limited === 'eight' || limited === 'chaos' || format === 'sealed' || format === 'limited') params.set('format', 'sealed')
  if (params.get('format') === 'sealed' && (limited === 'eight' || limited === 'chaos')) params.set('limited', limited)
  if (set && /^[A-Za-z0-9]{2,6}$/.test(set) && (params.get('format') === 'draft' || params.get('format') === 'sealed')) params.set('set', set.toUpperCase())
  return `/lobby/constructed${params.size ? `?${params}` : ''}`
}
