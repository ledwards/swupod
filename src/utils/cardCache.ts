// @ts-nocheck
/**
 * Card cache utility - preloads all cards for fast access
 */

import type { SetCode } from '../types';
import { getAllCards, getCardsBySet, type RawCard } from './cardData';

// Cache for all cards organized by set
const cardCache = new Map<SetCode, RawCard[]>();

// Flag to track if cache is initialized
let cacheInitialized = false;

// All supported set codes
const ALL_SETS: SetCode[] = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW', 'ASH'];

/** Cache statistics structure */
interface CacheStats {
  initialized: boolean;
  sets: Record<string, number>;
  totalCards: number;
}

/**
 * Initialize the card cache by loading all cards
 * This should be called on app startup
 * Since card data is loaded synchronously from JSON, this is instant
 */
export function initializeCardCache(): Promise<void> {
  if (cacheInitialized) {
    return Promise.resolve();
  }

  try {
    // Trigger loading of all cards
    getAllCards();

    // Organize cards by set
    ALL_SETS.forEach(setCode => {
      const setCards = getCardsBySet(setCode);
      cardCache.set(setCode, setCards);
    });

    cacheInitialized = true;
    // Return resolved promise immediately since data is already loaded
    return Promise.resolve();
  } catch (error) {
    console.error('Failed to initialize card cache:', error);
    return Promise.reject(error);
  }
}

/**
 * Get cards for a specific set from cache
 * Auto-initializes on first access so callers never get empty results
 * @param setCode - The set code
 * @returns Array of cards from that set
 */
export function getCachedCards(setCode: SetCode | string): RawCard[] {
  if (!cacheInitialized) {
    initializeCardCache();
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
