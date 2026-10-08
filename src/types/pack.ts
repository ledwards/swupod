// @ts-nocheck
/**
 * Pack-related type definitions
 */

import type { Card, DraftCard } from './card';

// === PACK SLOT TYPES ===

export type PackSlot =
  | 'leader'
  | 'base'
  | 'common'
  | 'uncommon'
  | 'rare_legendary'
  | 'foil';

// === PACK STRUCTURES ===

/**
 * Standard booster pack (16 cards)
 * Composition: 1 leader, 1 base, 9 commons, 3 uncommons, 1 rare/legendary, 1 foil
 */
export interface BoosterPack {
  cards: Card[];
}

/**
 * Draft pack (14 cards - leader and base removed)
 * Each card has instanceId for uniqueness during draft
 */
export interface DraftPack {
  cards: DraftCard[];
}

/**
 * Sealed pool (6 booster packs)
 */
export interface SealedPool {
  packs: BoosterPack[];
  /** Flattened list of all cards across all packs */
  cards: Card[];
}

/**
 * Leader pack for draft (separate from booster packs)
 */
export interface LeaderPack {
  leaders: DraftCard[];
}

// === PACK GENERATION CONFIG ===

/**
 * Configuration for pack generation probabilities
 */
export interface PackGenerationConfig {
  /** Probability of leader upgrading to hyperspace variant */
  leaderToHyperspace: number;
  /** Probability of leader upgrading to showcase variant */
  leaderToShowcase: number;
  /** Probability of base upgrading to hyperspace variant */
  baseToHyperspace: number;
  /** Probability of foil slot upgrading to hyperfoil */
  foilToHyperfoil: number;
  /** Probability of 3rd uncommon upgrading to hyperspace rare/legendary */
  thirdUCToHyperspaceRL: number;
  /** Probability of 1st uncommon upgrading to hyperspace uncommon */
  firstUCToHyperspaceUC: number;
  /** Probability of 2nd uncommon upgrading to hyperspace uncommon */
  secondUCToHyperspaceUC: number;
  /** Probability of common upgrading to hyperspace common */
  commonToHyperspace: number;
  // NOTE: Rare slot NEVER upgrades to Hyperspace. HS rares only appear via UC3 upgrade.
  /** Probability of rare upgrading to prestige (LAW+) */
  rareToPrestige: number;
}

/**
 * Rarity weights for weighted random selection
 */
export interface RarityWeights {
  Common?: number;
  Uncommon?: number;
  Rare?: number;
  Legendary?: number;
  Special?: number;
}

// === PACK VALIDATION ===

/**
 * Validate a booster pack has correct composition
 */
export function isValidBoosterPack(pack: BoosterPack): boolean {
  if (!pack.cards || pack.cards.length !== 16) {
    return false;
  }

  const leaders = pack.cards.filter(c => c.isLeader);
  const bases = pack.cards.filter(c => c.isBase);

  return leaders.length === 1 && bases.length === 1;
}

/**
 * Validate a draft pack has correct composition
 */
export function isValidDraftPack(pack: DraftPack): boolean {
  if (!pack.cards || pack.cards.length !== 14) {
    return false;
  }

  // Draft packs should not contain leaders or bases
  const hasLeader = pack.cards.some(c => c.isLeader);
  const hasBase = pack.cards.some(c => c.isBase);

  return !hasLeader && !hasBase;
}
