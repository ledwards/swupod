// @ts-nocheck
/**
 * Card cache utility - preloads all cards for fast access.
 *
 * Backed by GET /api/cards via the memoized client loader (U5, foundations
 * hardening) — this module used to statically import src/utils/cardData,
 * which embedded the ~8 MB cards.json in every client bundle that touched it
 * (including the home page). Initialization is now a real async fetch;
 * callers that `await initializeCardCache()` (or check `isCacheInitialized()`)
 * before reading keep their exact behavior. Cold synchronous reads return []
 * and warm the cache in the background.
 */

import type { SetCode } from '../types';
import type { RawCard } from './cardData';

/**
 * Environment-forked data source. Both imports are dynamic so neither lands
 * in the eager module graph:
 * - Server: the local corrected dataset (src/utils/cardData) — synchronous
 *   data, no fetch. The bundler dead-code-eliminates this branch from client
 *   bundles (typeof window inlining), keeping cards.json out of them.
 * - Client: GET /api/cards via the memoized loader.
 */
async function loadCardSource(): Promise<RawCard[]> {
  if (typeof window === 'undefined') {
    const { getAllCards } = await import('./cardData');
    return getAllCards();
  }
  const { loadAllCards } = await import('./cardDataClient');
  return loadAllCards();
}

// Cache for all cards organized by set
const cardCache = new Map<SetCode, RawCard[]>();

// Flag to track if cache is initialized
let cacheInitialized = false;

// In-flight initialization (deduped across callers)
let initPromise: Promise<void> | null = null;

/** Cache statistics structure */
interface CacheStats {
  initialized: boolean;
  sets: Record<string, number>;
  totalCards: number;
}

/**
 * Initialize the card cache by loading all cards from /api/cards.
 * This should be called on app startup. Idempotent and deduped.
 */
export function initializeCardCache(): Promise<void> {
  if (cacheInitialized) {
    return Promise.resolve();
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = loadCardSource()
    .then((cards) => {
      cardCache.clear();
      for (const card of cards) {
        const setCode = card.set as SetCode;
        const existing = cardCache.get(setCode);
        if (existing) {
          existing.push(card);
        } else {
          cardCache.set(setCode, [card]);
        }
      }
      cacheInitialized = true;
    })
    .catch((error) => {
      console.error('Failed to initialize card cache:', error);
      initPromise = null; // allow retry on next call
      throw error;
    });

  return initPromise;
}

/**
 * Get cards for a specific set from cache.
 * Cold reads return [] and kick off initialization in the background —
 * check `isCacheInitialized()` or await `initializeCardCache()` first when
 * an empty result matters.
 * @param setCode - The set code
 * @returns Array of cards from that set
 */
export function getCachedCards(setCode: SetCode | string): RawCard[] {
  if (!cacheInitialized) {
    initializeCardCache().catch(() => {});
    return [];
  }
  return cardCache.get(setCode as SetCode) || [];
}

/**
 * Check if cache is initialized
 * @returns true if cache is initialized
 */
export function isCacheInitialized(): boolean {
  return cacheInitialized;
}

/**
 * Get cache statistics
 * @returns Cache stats
 */
export function getCacheStats(): CacheStats {
  const stats: CacheStats = {
    initialized: cacheInitialized,
    sets: {},
    totalCards: 0,
  };

  cardCache.forEach((cards, setCode) => {
    stats.sets[setCode] = cards.length;
    stats.totalCards += cards.length;
  });

  return stats;
}

// Server-side: warm the cache eagerly at module load so legacy synchronous
// getCachedCards callers (belts during pack generation) find it populated —
// the historical implementation initialized synchronously from cards.json.
// All HTTP entry points additionally `await initializeCardCache()` first.
if (typeof window === 'undefined') {
  initializeCardCache().catch(() => {});
}
