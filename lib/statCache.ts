// In-process TTL cache for expensive QA / stats aggregates.
//
// The QA endpoints (/api/stats/generations, /api/public/pack-quality) run ~10–40
// full-table aggregations over card_generations (2.3M+ rows) per request — ~60s on
// large sets. The set/date inputs are effectively fixed (a handful of set codes, one
// start date), and the data changes slowly, so the results are very cacheable.
//
// Railway runs a single long-lived container, so this module-level Map is shared
// across all requests and users: only the FIRST request per key per TTL pays the
// cost; everyone else is instant. Pair with `npm run qa-warm` on a schedule to keep
// it hot so no real user ever hits a cold computation.

type Entry = { data: unknown; expires: number }

const store = new Map<string, Entry>()
const DEFAULT_TTL_MS = 30 * 60 * 1000 // 30 minutes

export function statCacheGet<T = unknown>(key: string): T | null {
  const e = store.get(key)
  if (!e) return null
  if (Date.now() > e.expires) {
    store.delete(key)
    return null
  }
  return e.data as T
}

export function statCacheSet(key: string, data: unknown, ttlMs: number = DEFAULT_TTL_MS): void {
  store.set(key, { data, expires: Date.now() + ttlMs })
}

/** Read-through helper: return cached value or compute, cache, and return it. */
export async function statCached<T>(key: string, compute: () => Promise<T>, ttlMs: number = DEFAULT_TTL_MS): Promise<T> {
  const hit = statCacheGet<T>(key)
  if (hit !== null) return hit
  const data = await compute()
  statCacheSet(key, data, ttlMs)
  return data
}
