// Coverage for the platform-wide baseline cache (platformObservedCached).
//
// The platform pull distribution is identical for every user, so the Luck route
// memoizes it in-process instead of re-scanning card_generations per request.
// These tests pin the cache contract using an injected counting fetcher and an
// injected clock — no DB, no real aggregation.

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  platformObservedCached,
  __clearPlatformCache,
  PLATFORM_CACHE_TTL_MS,
} from './route'
import type { ObservedAggregate } from './route'

// Minimal distinct aggregate; `packsCracked` doubles as an identity tag.
const mk = (tag: number): ObservedAggregate => ({
  packsCracked: tag,
  rarity: {} as ObservedAggregate['rarity'],
  aspect: {} as ObservedAggregate['aspect'],
  perCard: new Map(),
})

/** A fetcher that counts how many times the (expensive) aggregate actually ran. */
function countingFetcher() {
  let calls = 0
  return {
    get calls() { return calls },
    fn: async () => mk(++calls),
  }
}

const flushMicrotasks = () => new Promise((r) => setImmediate(r))

describe('platformObservedCached', () => {
  beforeEach(() => __clearPlatformCache())

  it('runs the fetch once for repeated same-key calls within the TTL', async () => {
    const f = countingFetcher()
    const a = await platformObservedCached('opened', 'LAW', '2020-01-01', '2026-06-19', f.fn, 1000)
    const b = await platformObservedCached('opened', 'LAW', '2020-01-01', '2026-06-19', f.fn, 1000)
    assert.equal(f.calls, 1, 'second same-key call must hit the cache, not re-fetch')
    assert.equal(a, b, 'both callers get the same cached aggregate')
    assert.equal(a.packsCracked, 1)
  })

  it('coalesces concurrent misses onto a single in-flight fetch', async () => {
    const f = countingFetcher()
    const [a, b] = await Promise.all([
      platformObservedCached('opened', 'LAW', 's', 'u', f.fn, 1000),
      platformObservedCached('opened', 'LAW', 's', 'u', f.fn, 1000),
    ])
    assert.equal(f.calls, 1, 'simultaneous cold callers share one fetch (no thundering herd)')
    assert.equal(a, b)
  })

  it('keys independently on scope, setCode, since, and until', async () => {
    const f = countingFetcher()
    await platformObservedCached('opened', 'LAW', 's', 'u', f.fn, 1000)
    await platformObservedCached('kept', 'LAW', 's', 'u', f.fn, 1000)   // different scope
    await platformObservedCached('opened', 'SEC', 's', 'u', f.fn, 1000) // different set
    await platformObservedCached('opened', 'LAW', 's2', 'u', f.fn, 1000) // different since
    await platformObservedCached('opened', 'LAW', 's', 'u2', f.fn, 1000) // different until
    assert.equal(f.calls, 5, 'each distinct key fetches exactly once')
  })

  it('re-fetches once the entry has expired', async () => {
    const f = countingFetcher()
    await platformObservedCached('opened', 'LAW', 's', 'u', f.fn, 0)
    // Still fresh just before expiry.
    await platformObservedCached('opened', 'LAW', 's', 'u', f.fn, PLATFORM_CACHE_TTL_MS - 1)
    assert.equal(f.calls, 1, 'within TTL → cached')
    // Past expiry → re-fetch.
    const v = await platformObservedCached('opened', 'LAW', 's', 'u', f.fn, PLATFORM_CACHE_TTL_MS + 1)
    assert.equal(f.calls, 2, 'after TTL → re-fetch')
    assert.equal(v.packsCracked, 2)
  })

  it('does not cache a rejected fetch — the next call retries', async () => {
    __clearPlatformCache()
    let attempt = 0
    const fetch = async () => {
      attempt++
      if (attempt === 1) throw new Error('scan failed')
      return mk(attempt)
    }
    await assert.rejects(
      () => platformObservedCached('opened', 'LAW', 's', 'u', fetch, 1000),
      /scan failed/,
    )
    await flushMicrotasks() // let the eviction .catch run
    const v = await platformObservedCached('opened', 'LAW', 's', 'u', fetch, 1000)
    assert.equal(attempt, 2, 'rejected fetch was evicted, so the next call re-runs it')
    assert.equal(v.packsCracked, 2)
  })
})
