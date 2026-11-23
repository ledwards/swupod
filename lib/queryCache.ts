// Tiny in-process TTL cache for expensive, platform-wide stats aggregates.
//
// The /me Meta tab asks the same all-time aggregates (whole-site, per set) on
// every visit. Those are heavy GROUP BYs over every built deck / draft pick. The
// s-maxage header only caches at the CDN edge — useless in local dev and on the
// first cold hit. This memoizes the COMPUTED RESULT in memory so repeated
// requests (across all users, since the data is platform-wide) are instant until
// the TTL lapses. Keyed by the full request params; safe because the payload has
// no per-user data.
//
// In-flight de-duplication: concurrent callers for the same key share one promise
// so a cold key doesn't fan out N identical heavy queries at once (exactly the
// /me Meta load pattern — ~10 parallel requests).

interface Entry<T> {
  expires: number
  value?: T
  pending?: Promise<T>
}

const store = new Map<string, Entry<unknown>>()

// Keys are the full query string (including per-day `until` and optional
// userId), so expired entries must be dropped, not just ignored on read —
// otherwise every key ever requested stays in memory until the next deploy.
const SWEEP_EVERY_MS = 60 * 1000
let lastSweep = 0

function sweepExpired(now: number): void {
  if (now - lastSweep < SWEEP_EVERY_MS) return
  lastSweep = now
  for (const [k, entry] of store) {
    if (!entry.pending && entry.expires <= now) store.delete(k)
  }
}

/** Number of cached keys (tests/diagnostics). */
export function queryCacheSize(): number {
  return store.size
}

export async function cachedAggregate<T>(key: string, ttlMs: number, compute: () => Promise<T>, nowFn: () => number = Date.now): Promise<T> {
  const now = nowFn()
  sweepExpired(now)
  const hit = store.get(key) as Entry<T> | undefined
  if (hit) {
    if (hit.value !== undefined && hit.expires > now) return hit.value
    if (hit.pending) return hit.pending
  }
  const pending = compute()
  store.set(key, { expires: now + ttlMs, pending })
  try {
    const value = await pending
    store.set(key, { expires: nowFn() + ttlMs, value })
    return value
  } catch (err) {
    // Don't cache failures — drop the entry so the next call retries.
    store.delete(key)
    throw err
  }
}

/** Default TTL for stats aggregates: 5 minutes (matches the s-maxage headers). */
export const STATS_AGGREGATE_TTL_MS = 5 * 60 * 1000
