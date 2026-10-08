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

export async function cachedAggregate<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = store.get(key) as Entry<T> | undefined
  if (hit) {
    if (hit.value !== undefined && hit.expires > now) return hit.value
    if (hit.pending) return hit.pending
  }
  const pending = compute()
  store.set(key, { expires: now + ttlMs, pending })
  try {
    const value = await pending
    store.set(key, { expires: Date.now() + ttlMs, value })
    return value
  } catch (err) {
    // Don't cache failures — drop the entry so the next call retries.
    store.delete(key)
    throw err
  }
}

/** Default TTL for stats aggregates: 5 minutes (matches the s-maxage headers). */
export const STATS_AGGREGATE_TTL_MS = 5 * 60 * 1000
