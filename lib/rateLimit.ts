/**
 * In-memory rate limiter
 * 60 requests per minute per IP address
 *
 * Client IP derivation (U8): behind Railway there is exactly one trusted
 * proxy, which APPENDS the real client IP as the last hop of
 * x-forwarded-for. Earlier entries are client-controlled and trivially
 * spoofable, so we read the entry `TRUST_PROXY_HOPS` (default 1) from the
 * RIGHT — never the first hop. Set TRUST_PROXY_HOPS=0 when running bare
 * (no proxy): the header is then untrusted entirely and all traffic shares
 * one bucket.
 *
 * Accepted limitation: the store is per-process and resets on every
 * deploy/restart; multiple instances each enforce their own window. There
 * is no Redis in the stack, and this limiter is a nuisance brake, not a
 * security boundary.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const WINDOW_MS = 60 * 1000 // 1 minute
const MAX_REQUESTS = 60

const store = new Map<string, RateLimitEntry>()

// Cleanup expired entries every 5 minutes
// .unref() allows the process to exit even if this timer is active
const cleanupInterval = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key)
    }
  }
}, 5 * 60 * 1000)
if (typeof cleanupInterval?.unref === 'function') {
  cleanupInterval.unref()
}

/** Number of trusted proxy hops in front of the app (default 1 = Railway). */
function trustProxyHops(): number {
  const raw = process.env['TRUST_PROXY_HOPS']
  if (raw === undefined || raw === '') return 1
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1
}

/**
 * Derive the client IP from x-forwarded-for, trusting only the rightmost
 * `TRUST_PROXY_HOPS` entries (each trusted proxy appends exactly one). With
 * one trusted proxy the real client IP is the LAST entry — anything a client
 * prepends itself is ignored, so spoofed leading entries cannot fragment the
 * rate-limit key. Exported for tests.
 */
export function getClientIp(request: Request): string {
  const hops = trustProxyHops()
  if (hops === 0) {
    // No trusted proxy: the header is entirely client-controlled, so it
    // cannot identify anyone. Everything shares the direct bucket.
    return 'unknown'
  }
  const forwarded = request.headers.get('x-forwarded-for')
  if (!forwarded) return 'unknown'
  const entries = forwarded.split(',').map((entry) => entry.trim()).filter(Boolean)
  if (entries.length === 0) return 'unknown'
  // The hop appended by the outermost trusted proxy sits `hops` from the
  // right. Fewer entries than hops → the connection came through fewer
  // proxies than configured; take the leftmost available.
  return entries[Math.max(entries.length - hops, 0)] ?? 'unknown'
}

/**
 * Apply rate limiting to a request.
 * Returns a 429 Response if rate limited, or null if the request is allowed.
 */
export function applyRateLimit(request: Request): Response | null {
  const ip = getClientIp(request)
  const now = Date.now()

  let entry = store.get(ip)
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS }
    store.set(ip, entry)
  }

  entry.count++

  if (entry.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return new Response(
      JSON.stringify({ error: 'Too many requests. Please try again later.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  return null
}

// Export for testing
export { store as _store, WINDOW_MS, MAX_REQUESTS }
