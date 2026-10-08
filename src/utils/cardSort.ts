// @ts-nocheck
/**
 * Card Sorting Utilities
 *
 * Helper functions for sorting cards in the deck builder.
 */

import type { Card, Arena, SortOption } from '../types';

// === CARD LIKE INTERFACES ===

/** Minimal card interface for sorting */
interface SortableCard {
  type?: string;
  arenas?: Arena[] | null;
  cost?: number | null;
  name?: string;
  aspects?: string[];
}

/** Card entry with position (used in deck builder) */
interface CardEntry {
  position: {
    card: SortableCard;
  };
}

// === TYPE ORDER FUNCTIONS ===

/**
 * Get the sort order for a card based on its type.
 * Ground Units: 1, Space Units: 2, Upgrades: 3, Events: 4, Other: 99
 */
export function getCardTypeOrder(card: SortableCard): number {
  if (card.type === 'Unit') {
    if (card.arenas?.includes('Ground')) return 1;
    if (card.arenas?.includes('Space')) return 2;
    return 1;
  }
  if (card.type === 'Upgrade') return 3;
  if (card.type === 'Event') return 4;
  return 99;
}

/**
 * Get the sort order for a type string (legacy format).
 * Used when only the type string is available.
 */
export function getTypeStringOrder(type: string): number {
  if (type === 'Unit' || type === 'Ground Unit') return 1;
  if (type === 'Space Unit') return 2;
  if (type === 'Upgrade') return 3;
  if (type === 'Event') return 4;
  return 99;
}

// === GROUP KEY SORTING ===

/** Type order mapping for sorting */
const TYPE_ORDER: Record<string, number> = {
  'Ground Units': 1,
  'Space Units': 2,
  'Units': 1.5,
  'Upgrades': 3,
  'Events': 4,
  'Other': 5
};

/** Primary aspect order for sorting */
const PRIMARY_ASPECT_ORDER: Record<string, number> = {
  'Vigilance': 0,
  'Command': 100,
  'Aggression': 200,
  'Cunning': 300,
  'Villainy': 400,
  'Heroism': 500
};

/** Secondary aspect order for dual-aspect cards */
const SECONDARY_ASPECT_ORDER: Record<string, number> = {
  'Villainy': 0,
  'Heroism': 1
};

/** Primary aspects (non-alignment) */
const PRIMARY_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning'];

/**
 * Get aspect sort order for a group key
 */
function getAspectSortOrder(key: string): number {
  let aspectName = key;
  if (key === 'ZZZ_Neutral') return 999;

  const match = key.match(/^[A-Z]_(.+)$/);
  const matchedGroup = match?.[1];
  if (matchedGroup) aspectName = matchedGroup;

  const aspects = aspectName.includes(' ') ? aspectName.split(' ').sort() : [aspectName];
  const isDual = aspects.length === 2;

  if (isDual) {
    const primary = aspects.find(a => PRIMARY_ASPECTS.includes(a));
    const secondary = aspects.find(a => ['Villainy', 'Heroism'].includes(a));

    if (primary && secondary) {
      return (PRIMARY_ASPECT_ORDER[primary] ?? 999) + (SECONDARY_ASPECT_ORDER[secondary] ?? 0);
    }

    const firstAspect = aspects[0] ?? '';
    if (firstAspect && PRIMARY_ASPECTS.includes(firstAspect)) {
      return (PRIMARY_ASPECT_ORDER[firstAspect] ?? 999) + 2;
    }
    return firstAspect ? (PRIMARY_ASPECT_ORDER[firstAspect] ?? 999) : 999;
  } else {
    const aspect = aspects[0] ?? '';
    if (aspect && PRIMARY_ASPECTS.includes(aspect)) {
      return (PRIMARY_ASPECT_ORDER[aspect] ?? 999) + 3;
    }
    return aspect ? (PRIMARY_ASPECT_ORDER[aspect] ?? 999) : 999;
  }
}

/**
 * Sort group keys based on sort option.
 * Handles cost (numeric), type (predefined order), and aspect (complex ordering).
 *
 * @param keys - Array of group keys to sort
 * @param sortOption - 'cost', 'type', or 'aspect'
 * @param costThreshold - The cost value that represents "X+" (default '8+')
 * @returns Sorted array of group keys
 */
export function sortGroupKeys(
  keys: string[],
  sortOption: SortOption | string,
  costThreshold: string = '8+'
): string[] {
  const thresholdValue = parseInt(costThreshold, 10) || 8;

  return [...keys].sort((a, b) => {
    if (sortOption === 'cost') {
      const costA = a === costThreshold ? thresholdValue : parseInt(a, 10);
      const costB = b === costThreshold ? thresholdValue : parseInt(b, 10);
      return costA - costB;
    }

    if (sortOption === 'type') {
      return (TYPE_ORDER[a] ?? 99) - (TYPE_ORDER[b] ?? 99);
    }

    // Aspect sorting
    return getAspectSortOrder(a) - getAspectSortOrder(b);
  });
}

// === GROUP KEY GENERATION ===

interface GetGroupKeyOptions {
  showAspectPenalties?: boolean;
  leaderCard?: Card | null;
  baseCard?: Card | null;
  calculateAspectPenalty?: (card: SortableCard, leader: Card, base: Card) => number;
  getAspectKey?: (card: SortableCard) => string;
}

/**
 * Create a function to get the group key for a card based on sort option.
 * Used for grouping cards by cost, type, or aspect.
 *
 * @param sortOption - 'cost', 'type', or 'aspect'
 * @param options - Configuration options
 * @returns Function that returns the group key for a card
 */
export function createGetGroupKey(
  sortOption: SortOption | string,
  {
    showAspectPenalties = false,
    leaderCard = null,
    baseCard = null,
    calculateAspectPenalty = () => 0,
    getAspectKey = () => 'Other'
  }: GetGroupKeyOptions = {}
): (card: SortableCard) => string {
  return (card: SortableCard): string => {
    if (sortOption === 'cost') {
      const baseCost = card.cost ?? 999;
      const penalty = (showAspectPenalties && leaderCard && baseCard)
        ? calculateAspectPenalty(card, leaderCard, baseCard)
        : 0;
      const cost = baseCost + penalty;
      if (cost >= 8) return '8+';
      return String(cost);
    } else if (sortOption === 'type') {
      if (card.type === 'Unit') {
        if (card.arenas?.includes('Ground')) return 'Ground Units';
        if (card.arenas?.includes('Space')) return 'Space Units';
        return 'Units';
      }
      if (card.type === 'Upgrade') return 'Upgrades';
      if (card.type === 'Event') return 'Events';
      return 'Other';
    } else {
      // Aspect grouping (default)
      return getAspectKey(card);
    }
  };
}

// === SORT FUNCTIONS ===

type AspectKeyFn = (card: SortableCard) => string;

/**
 * Create a default sort function for flat card display.
 * Sorts by: aspect, then cost, then type, then name.
 *
 * @param getDefaultAspectSortKey - Function to get aspect sort key
 * @returns Comparator function for sorting card entries
 */
export function createDefaultSortFn(
  getDefaultAspectSortKey: AspectKeyFn
): (a: CardEntry, b: CardEntry) => number {
  return (a: CardEntry, b: CardEntry): number => {
    const cardA = a.position.card;
    const cardB = b.position.card;

    const aspectKeyA = getDefaultAspectSortKey(cardA);
    const aspectKeyB = getDefaultAspectSortKey(cardB);
    const aspectCompare = aspectKeyA.localeCompare(aspectKeyB);
    if (aspectCompare !== 0) return aspectCompare;

    const costA = cardA.cost ?? 999;
    const costB = cardB.cost ?? 999;
    if (costA !== costB) return costA - costB;

    const aOrder = getCardTypeOrder(cardA);
    const bOrder = getCardTypeOrder(cardB);
    if (aOrder !== bOrder) return aOrder - bOrder;

    return (cardA.name ?? '').toLowerCase().localeCompare((cardB.name ?? '').toLowerCase());
  };
}

/**
 * Create a sort function for cards within groups.
 * Sorts by different criteria based on the sort option.
 *
 * @param sortOption - 'cost', 'type', or 'aspect'
 * @param getDefaultAspectSortKey - Function to get aspect sort key
 * @returns Comparator function for sorting card entries
 */
export function createGroupCardSortFn(
  sortOption: SortOption | string,
  getDefaultAspectSortKey: AspectKeyFn
): (a: CardEntry, b: CardEntry) => number {
  return (a: CardEntry, b: CardEntry): number => {
    const cardA = a.position.card;
    const cardB = b.position.card;

    if (sortOption === 'cost') {
      // Within cost group: aspect, type, name
      const aspectKeyA = getDefaultAspectSortKey(cardA);
      const aspectKeyB = getDefaultAspectSortKey(cardB);
      const aspectCompare = aspectKeyA.localeCompare(aspectKeyB);
      if (aspectCompare !== 0) return aspectCompare;

      const aOrder = getCardTypeOrder(cardA);
      const bOrder = getCardTypeOrder(cardB);
      if (aOrder !== bOrder) return aOrder - bOrder;
    } else if (sortOption === 'type') {
      // Within type group: aspect, cost, name
      const aspectKeyA = getDefaultAspectSortKey(cardA);
      const aspectKeyB = getDefaultAspectSortKey(cardB);
      const aspectCompare = aspectKeyA.localeCompare(aspectKeyB);
      if (aspectCompare !== 0) return aspectCompare;

      const costA = cardA.cost ?? 999;
      const costB = cardB.cost ?? 999;
      if (costA !== costB) return costA - costB;
    } else {
      // Within aspect group: cost, type, name
      const costA = cardA.cost ?? 999;
      const costB = cardB.cost ?? 999;
      if (costA !== costB) return costA - costB;

      const aOrder = getCardTypeOrder(cardA);
      const bOrder = getCardTypeOrder(cardB);
      if (aOrder !== bOrder) return aOrder - bOrder;
    }

    return (cardA.name ?? '').toLowerCase().localeCompare((cardB.name ?? '').toLowerCase());
  };
}
