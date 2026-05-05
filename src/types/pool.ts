// @ts-nocheck
/**
 * Pool and deck builder type definitions
 */

import type { Card, CardPosition, SetCode } from './card';
import type { BoosterPack } from './pack';

// === POOL TYPES ===

export type PoolType = 'sealed' | 'draft' | 'imported';

/**
 * Card pool - a sealed or draft pool
 */
export interface CardPool {
  id: string;
  userId: string | null;
  shareId: string;
  setCode: SetCode;
  setName: string;
  poolType: PoolType;
  name: string;
  cards: Card[];
  packs: BoosterPack[] | null;
  deckBuilderState: DeckBuilderState | null;
  isPublic: boolean;
  hidden: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Card pool database row (snake_case)
 */
export interface CardPoolRow {
  id: string;
  user_id: string | null;
  share_id: string;
  set_code: string;
  set_name: string;
  pool_type: string;
  name: string;
  cards: Card[] | string;
  packs: BoosterPack[] | string | null;
  deck_builder_state: DeckBuilderState | string | null;
  is_public: boolean;
  hidden: boolean;
  created_at: Date;
  updated_at: Date;
}

// === DECK BUILDER TYPES ===

export type ViewMode = 'grid' | 'list';

export type SortOption = 'aspect' | 'cost' | 'type' | 'name' | 'rarity';

/**
 * Deck builder state - saved in card_pools.deck_builder_state
 */
export interface DeckBuilderState {
  poolName: string;
  leaderCard: Card | null;
  baseCard: Card | null;
  cardPositions: Record<string, CardPosition>;
  deckCardCount: number;
  poolCardCount: number;
  viewMode: ViewMode;
  poolSortOption: SortOption;
  deckSortOption: SortOption;
  showAspectPenalties: boolean;
}

/**
 * A complete deck ready for export
 */
export interface Deck {
  leader: Card;
  base: Card;
  /** Main deck cards (should be ~50 cards) */
  mainDeck: Card[];
  /** Sideboard cards */
  sideboard: Card[];
}

// === DECK VALIDATION ===

/**
 * Deck validation result
 */
export interface DeckValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  cardCount: number;
}

/**
 * Validate a deck for legal play
 */
export function validateDeck(deck: Deck): DeckValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check leader
  if (!deck.leader) {
    errors.push('Deck must have a leader');
  } else if (!deck.leader.isLeader) {
    errors.push('Selected leader is not a leader card');
  }

  // Check base
  if (!deck.base) {
    errors.push('Deck must have a base');
  } else if (!deck.base.isBase) {
    errors.push('Selected base is not a base card');
  }

  // Check card count
  const cardCount = deck.mainDeck.length;
  if (cardCount < 50) {
    errors.push(`Deck has ${cardCount} cards, needs at least 50`);
  } else if (cardCount > 50) {
    warnings.push(`Deck has ${cardCount} cards, exactly 50 recommended`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    cardCount,
  };
}

// === POOL HELPERS ===

/**
 * Get total card count in a pool
 */
export function getPoolCardCount(pool: CardPool): number {
  return pool.cards.length;
}

/**
 * Get cards from pool that are in the deck
 */
export function getDeckCards(state: DeckBuilderState): Card[] {
  return Object.values(state.cardPositions)
    .filter(pos => pos.section === 'deck' && pos.enabled)
    .map(pos => pos.card);
}

/**
 * Get cards from pool that are in the sideboard
 */
export function getSideboardCards(state: DeckBuilderState): Card[] {
  return Object.values(state.cardPositions)
    .filter(pos => pos.section === 'sideboard')
    .map(pos => pos.card);
}
