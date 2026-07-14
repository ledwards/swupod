// @ts-nocheck
/**
 * Card-related type definitions
 */

// === ENUMS & UNIONS ===

export type SetCode = 'SOR' | 'SHD' | 'TWI' | 'JTL' | 'LOF' | 'SEC' | 'LAW' | 'ASH';

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Legendary' | 'Special';

export type CardType = 'Leader' | 'Base' | 'Unit' | 'Event' | 'Upgrade' | 'Unknown';

export type Aspect = 'Vigilance' | 'Command' | 'Aggression' | 'Cunning' | 'Villainy' | 'Heroism';

export type Arena = 'Ground' | 'Space';

export type VariantType = 'Normal' | 'Foil' | 'Hyperspace' | 'Hyperspace Foil' | 'Showcase'
  | 'Standard Prestige' | 'Foil Prestige' | 'Serialized Prestige'
  // Stopgap variant for GC 2026 promo cards (see src/data/promoPacks/gc2026-cards.json).
  | 'GC 2026 Promo';

// === CARD INTERFACES ===

/**
 * Base card interface - the core card structure from the API
 */
export interface Card {
  // Identity
  /** Internal API ID - unique per variant (e.g., "42080") */
  id: string;
  /** Display ID in SET-NUMBER format (e.g., "SEC-1029") - formerly "cardId" */
  collectorSetAndNumber: string;
  /** Just the collector number portion (e.g., "1029") - formerly "number" */
  collectorNumber: string;

  // Core properties
  name: string;
  subtitle: string | null;
  set: SetCode;
  rarity: Rarity;
  type: CardType;

  // Gameplay
  aspects: Aspect[];
  traits: string[];
  arenas: Arena[];
  cost: number;
  power: number | null;
  hp: number | null;
  frontText: string;
  backText: string | null;
  epicAction: string | null;
  keywords: string[];

  // Metadata
  artist: string;
  unique: boolean;
  doubleSided: boolean;

  // Variant flags
  variantType: VariantType;
  isLeader: boolean;
  isBase: boolean;
  isFoil: boolean;
  isHyperspace: boolean;
  isShowcase: boolean;
  isPrestige: boolean;
  prestigeTier: string | null;

  // Assets
  imageUrl: string;
  backImageUrl: string | null;

  // Pricing (optional)
  marketPrice: number | null;
  lowPrice: number | null;

  // Spoiler-season placeholders
  isPlaceholder?: boolean;
  spoilerStatus?: 'placeholder' | 'spoiled';
  sourceId?: string | null;
  placeholderVersion?: string;
  placeholderKind?: 'bucket-slot';
  placeholderGroup?: 'leader' | 'base' | 'main';
  placeholderBucketId?: string;
  placeholderBucketLabel?: string;
  placeholderSlotIndex?: number;
  placeholderTargetCount?: number;
  placeholderRemainingCount?: number;
  placeholderConfidence?: string;
  inferredFields?: string[];
}

/**
 * Card with draft instance tracking - used during draft to distinguish
 * multiple copies of the same card across different packs
 */
export interface DraftCard extends Card {
  /** Unique instance ID for draft (format: "{id}_{counter}") */
  instanceId: string;

  // Pick metadata (added when card is drafted)
  pickNumber?: number;
  packNumber?: number;
  pickInPack?: number;
  leaderRound?: number;
}

/**
 * Card position in deck builder
 */
export interface CardPosition {
  card: Card;
  section: 'deck' | 'sideboard' | 'pool';
  enabled: boolean;
  visible: boolean;
  x: number;
  y: number;
}

/**
 * Legacy card format - for backwards compatibility during migration
 * Maps old field names to new ones
 */
export interface LegacyCard extends Omit<Card, 'collectorSetAndNumber' | 'collectorNumber'> {
  /** @deprecated Use collectorSetAndNumber instead */
  cardId: string;
  /** @deprecated Use collectorNumber instead */
  number: string;
}

/**
 * Type guard to check if a card is a DraftCard
 */
export function isDraftCard(card: Card | DraftCard): card is DraftCard {
  return 'instanceId' in card;
}

/**
 * Type guard to check if a card is a legacy card format
 */
export function isLegacyCard(card: unknown): card is LegacyCard {
  return typeof card === 'object' && card !== null && 'cardId' in card;
}

/**
 * Convert legacy card format to new format
 */
export function normalizeLegacyCard(card: LegacyCard): Card {
  const { cardId, number, ...rest } = card;
  return {
    ...rest,
    collectorSetAndNumber: cardId,
    collectorNumber: number,
  };
}
