'use client'
/**
 * Client-side card data loader (U5, foundations hardening).
 *
 * Client components must NEVER import src/utils/cardData (it statically pulls
 * the ~8 MB cards.json into the bundle — the CI bundle-size guard enforces
 * this). Fetch per-set chunks from GET /api/cards instead; responses carry
 * long-lived Cache-Control headers and are additionally memoized at module
 * scope so repeat mounts don't refetch.
 */

import type { RawCard } from './cardData'

const cache = new Map<string, Promise<RawCard[]>>()

async function fetchCards(setParam: string): Promise<RawCard[]> {
  const res = await fetch(`/api/cards?set=${encodeURIComponent(setParam)}`)
  if (!res.ok) {
    throw new Error(`Failed to load card data (${res.status})`)
  }
  const body = await res.json()
  return (body?.data?.cards ?? []) as RawCard[]
}

/**
 * Load the corrected cards for one set. Memoized per set; a failed fetch is
 * evicted from the cache so the next call retries.
 */
export function loadCardsBySet(setCode: string): Promise<RawCard[]> {
  let promise = cache.get(setCode)
  if (!promise) {
    promise = fetchCards(setCode).catch((err) => {
      cache.delete(setCode)
      throw err
    })
    cache.set(setCode, promise)
  }
  return promise
}

/** Load the full corrected card list. Memoized. */
export function loadAllCards(): Promise<RawCard[]> {
  return loadCardsBySet('all')
}
