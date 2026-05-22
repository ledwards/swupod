// @ts-nocheck
/**
 * Card data utilities
 * This module handles loading and managing card data from the definition file
 * Card fixes are applied at runtime to ensure all code uses corrected data
 */

import type { SetCode, Rarity, CardType } from '../types';

// JSON import with assertion
import cardDataRaw from '../data/cards.json' with { type: 'json' };
import { applyCardFixes } from './cardFixes';

// === RAW CARD TYPE ===
// Represents the actual shape of cards as they exist in cards.json
// Note: Using legacy field names (cardId, number) until ID migration is complete

/** Raw card as stored in cards.json (before ID field rename) */
interface RawCard {
  id: string;
  cardId: string;
  number: string;
  name: string;
  subtitle: string | null;
  set: SetCode;
  rarity: Rarity;
  type: CardType;
  aspects: string[];
  traits: string[];
  arenas: string[];
  cost: number;
  power: number | null;
  hp: number | null;
  frontText: string;
  backText: string | null;
  epicAction: string | null;
  keywords: string[];
  artist: string;
  unique: boolean;
  doubleSided: boolean;
  variantType: string;
  isLeader: boolean;
  isBase: boolean;
  isFoil: boolean;
  isHyperspace: boolean;
  isShowcase: boolean;
  isPrestige: boolean;
  prestigeTier: string | null;
  imageUrl: string;
  backImageUrl: string | null;
  marketPrice: number | null;
  lowPrice: number | null;
}

/** Processed card data structure */
interface ProcessedCardData {
  cards: RawCard[];
  metadata: {
    fixesApplied?: number;
    [key: string]: unknown;
  };
}

// Apply fixes once at module load
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const processedData: ProcessedCardData = applyCardFixes(cardDataRaw as any) as ProcessedCardData;

/**
 * Get all cards for a specific set
 * @param setCode - The set code (e.g., 'SOR', 'SHD', etc.)
 * @returns Array of cards from that set
 */
export function getCardsBySet(setCode: SetCode | string): RawCard[] {
  if (!processedData.cards || processedData.cards.length === 0) {
    return [];
  }
  return processedData.cards.filter((card) => card.set === setCode);
}

/**
 * Check whether a set has any real cards in the local data.
 * Carbonite variants (`-CB` suffix) share their base set's cards.
 * @param setCode - The set code (e.g., 'ASH', 'LAW-CB')
 * @returns true if at least one card exists for the set
 */
export function hasCardsForSet(setCode: SetCode | string): boolean {
  const baseCode = String(setCode).replace(/-CB$/, '');
  return getCardsBySet(baseCode).length > 0;
}

/**
 * Get all cards
 * @returns All cards in the database
 */
export function getAllCards(): RawCard[] {
  return processedData.cards || [];
}

/**
 * Get metadata about the card data
 * @returns Metadata including fix count
 */
export function getCardMetadata(): ProcessedCardData['metadata'] {
  return processedData.metadata || {};
}

/**
 * Get cards filtered by rarity
 * @param cards - Cards to filter
 * @param rarity - Rarity to filter by (Common, Uncommon, Rare, Legendary)
 * @returns Filtered cards
 */
export function filterByRarity(cards: RawCard[], rarity: Rarity | string): RawCard[] {
  return cards.filter((card) => card.rarity === rarity);
}

/**
 * Get cards filtered by type
 * @param cards - Cards to filter
 * @param type - Type to filter by (Leader, Base, Unit, etc.)
 * @returns Filtered cards
 */
export function filterByType(cards: RawCard[], type: CardType | string): RawCard[] {
  return cards.filter((card) => card.type === type);
}

/**
 * Get leader cards
 * @param cards - Cards to filter
 * @returns Leader cards
 */
export function getLeaders(cards: RawCard[]): RawCard[] {
  return cards.filter((card) => card.isLeader === true || card.type === 'Leader');
}

/**
 * Get base cards
 * @param cards - Cards to filter
 * @returns Base cards
 */
export function getBases(cards: RawCard[]): RawCard[] {
  return cards.filter((card) => card.isBase === true || card.type === 'Base');
}

// Re-export the RawCard type for consumers
export type { RawCard };
