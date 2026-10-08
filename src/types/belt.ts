// @ts-nocheck
/**
 * Belt system type definitions
 *
 * The belt metaphor: Each card slot type has a "belt" that dispenses cards.
 * Belts maintain a "hopper" that refills from a "filling pool" when depleted.
 */

import type { Card, SetCode } from './card';

// === BELT TYPES ===

export type BeltType =
  | 'leader'
  | 'base'
  | 'commonA'
  | 'commonB'
  | 'uncommon'
  | 'rareLegendary'
  | 'foil'
  | 'showcaseLeader'
  | 'hyperspaceLeader'
  | 'hyperspaceBase'
  | 'hyperspaceCommon'
  | 'hyperspaceUncommon'
  | 'hyperspaceRareLegendary'
  | 'hyperfoil';

export type BeltAssignment = 'A' | 'B';

// === BELT INTERFACES ===

/**
 * Base belt interface - common methods all belts implement
 */
export interface Belt<T extends Card = Card> {
  /** Get the next card from the belt */
  next(): T | null;

  /** Preview upcoming cards without removing them */
  peek(count: number): T[];

  /** Current number of cards in the hopper */
  readonly size: number;

  /** Whether the belt is empty and cannot produce more cards */
  readonly isEmpty: boolean;
}

/**
 * Hopper belt - a belt with a refillable hopper
 */
export interface HopperBelt<T extends Card = Card> extends Belt<T> {
  /** Current hopper size */
  readonly hopperSize: number;

  /** Refill the hopper from the filling pool */
  refillHopper(): void;
}

// === BELT CONFIGURATION ===

/**
 * Configuration for creating a belt
 */
export interface BeltConfig {
  setCode: SetCode;
  cards: Card[];
  /** Number of recent cards to check for deduplication */
  dedupWindow?: number;
}

/**
 * Leader belt configuration
 */
export interface LeaderBeltConfig extends BeltConfig {
  /** Common leaders (higher frequency) */
  commonLeaders: Card[];
  /** Rare leaders (lower frequency) */
  rareLeaders: Card[];
  /** Probability of serving a rare leader (default: 1/6) */
  rareLeaderProbability?: number;
}

/**
 * Common belt configuration
 */
export interface CommonBeltConfig extends BeltConfig {
  /** Belt assignment (A or B) for this belt instance */
  assignment: BeltAssignment;
}

/**
 * Rare/Legendary belt configuration
 */
export interface RareLegendaryBeltConfig extends BeltConfig {
  /** Rare cards */
  rares: Card[];
  /** Legendary cards */
  legendaries: Card[];
  /** Ratio of rare:legendary (e.g., 6 = 6:1 ratio) */
  rareToLegendaryRatio: number;
}

// === BELT STATE ===

/**
 * Serializable belt state for debugging/analytics
 */
export interface BeltState {
  type: BeltType;
  hopperSize: number;
  fillingPoolSize: number;
  recentCardIds: string[];
}

// === BELT ASSIGNMENT MAPS ===

/**
 * Card ID to belt assignment mapping
 */
export type CardBeltAssignments = Record<string, BeltAssignment>;

/**
 * Belt assignments for a set
 */
export interface SetBeltAssignments {
  setCode: SetCode;
  /** Map of card ID to belt assignment */
  assignments: CardBeltAssignments;
}
