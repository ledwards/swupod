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

// ---------------------------------------------------------------------------
// Durable variant: the result is stored in the stat_cache table.
//
// The in-process cache above was not enough for the QA aggregates. A cold request
// takes over two minutes, the browser gives up first, and a deploy empties the Map,
// so in practice every visit recomputed everything and still showed nothing (21
// requests in the week to 2026-11-20, none succeeded). Here a result is computed
// once, survives deploys, and is refreshed in the background once it is a day old,
// so a visit reads one row. Concurrent requests for a key share one computation.
// ---------------------------------------------------------------------------

export const DURABLE_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 1 day

export type StoredStat = { payload: unknown; computedAt: number }
export type StatStore = {
  load: (key: string) => Promise<StoredStat | null>
  save: (key: string, payload: unknown) => Promise<void>
}

const dbStore: StatStore = {
  async load(key) {
    const { queryRow } = await import('./db')
    const row = await queryRow('SELECT payload, computed_at FROM stat_cache WHERE key = $1', [key]) as
      { payload: unknown; computed_at: string | Date } | null
    return row ? { payload: row.payload, computedAt: new Date(row.computed_at).getTime() } : null
  },
  async save(key, payload) {
    const { query } = await import('./db')
    await query(
      `INSERT INTO stat_cache (key, payload, computed_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
      [key, JSON.stringify(payload)]
    )
  },
}

const inFlight = new Map<string, Promise<unknown>>()

function computeOnce<T>(key: string, compute: () => Promise<T>, store: StatStore): Promise<T> {
  const running = inFlight.get(key)
  if (running) return running as Promise<T>
  const p = (async () => {
    const data = await compute()
    await store.save(key, data)
    return data
  })().finally(() => inFlight.delete(key))
  inFlight.set(key, p)
  return p
}

export async function statCachedDurable<T>(
  key: string,
  compute: () => Promise<T>,
  opts: { maxAgeMs?: number; store?: StatStore; now?: () => number } = {}
): Promise<T> {
  const store = opts.store ?? dbStore
  const maxAgeMs = opts.maxAgeMs ?? DURABLE_MAX_AGE_MS
  const stored = await store.load(key)
  if (!stored) return computeOnce(key, compute, store)
  if ((opts.now ?? Date.now)() - stored.computedAt > maxAgeMs) {
    // Serve what we have; refresh without making this request wait.
    computeOnce(key, compute, store).catch(e => console.error(`stat refresh failed for ${key}:`, e))
  }
  return stored.payload as T
}
