// @ts-nocheck
/**
 * Draft Logic Utilities
 *
 * Handles pack generation and draft flow logic for multiplayer drafts.
 */

import type { SetCode, DraftCard, PassDirection, PickStatus } from '../types';
import type { RawCard } from './cardData';
import { generateBoosterPack, clearBeltCache } from './boosterPack';

// === TYPES ===

/** Pack structure from boosterPack generator */
interface Pack {
  cards: RawCard[];
}

/** Draft pack with DraftCard array */
interface DraftPack {
  cards: DraftCard[];
}

/** Result of generating draft packs */
export interface DraftPacksResult {
  /** All packs for all players: [playerIndex][packIndex] */
  packs: DraftPack[][];
  /** All leaders for all players: [playerIndex][leaderIndex] */
  leaders: DraftCard[][];
  /** Original 16-card packs before leader/base extraction, for tracking: [playerIndex][packIndex] */
  originalPacks: RawCard[][];
}

/** Player with pick status */
interface Player {
  pick_status: PickStatus | string;
}

/** Position coordinates for table layout */
interface PositionCoordinates {
  x: number;
  y: number;
}

// === PACK GENERATION ===

/** Options for generating draft packs */
interface DraftPacksOptions {
  /** Number of players (default 8) */
  playerCount?: number;
  /** For Chaos Draft: array of 3 set codes, one per pack round */
  chaosSets?: (SetCode | string)[];
}

/**
 * Process pre-generated box packs for draft
 * Takes packs from a 24-pack box and processes them for player distribution
 * (adds instance IDs, extracts leaders, removes bases)
 *
 * @param boxPacks - Pre-generated packs from the box (24 packs)
 * @param playerCount - Number of players (each gets 3 packs)
 * @returns { packs: playerPacks[][], leaders: playerLeaders[][], originalPacks: RawCard[][] }
 */
export function processBoxPacksForDraft(
  boxPacks: Pack[],
  playerCount: number,
  packsPerPlayer: number = 3
): DraftPacksResult {
  const totalPacksNeeded = playerCount * packsPerPlayer;

  if (boxPacks.length < totalPacksNeeded) {
    throw new Error(`Not enough packs in box: need ${totalPacksNeeded}, have ${boxPacks.length}`);
  }

  const allPlayerPacks: DraftPack[][] = [];
  const allPlayerLeaders: DraftCard[][] = [];
  const allOriginalPacks: RawCard[][] = [];

  // Global counter for unique instance IDs across the entire draft
  let instanceCounter = 0;

  for (let player = 0; player < playerCount; player++) {
    const playerPacks: DraftPack[] = [];
    const playerLeaders: DraftCard[] = [];
    const playerOriginalPacks: RawCard[] = [];

    for (let packNum = 0; packNum < packsPerPlayer; packNum++) {
      // Get pack from box (player 0 gets packs 0,1,2; player 1 gets 3,4,5; etc.)
      const packIndex = player * packsPerPlayer + packNum;
      const pack = boxPacks[packIndex];

      // Get cards array from pack (handle both { cards: [...] } and raw array)
      const packCards: RawCard[] = pack.cards || pack;

      // Save original pack for stat tracking (before leader/base extraction)
      playerOriginalPacks.push(packCards);

      // Add unique instance IDs to all cards in the pack
      const cardsWithInstanceIds = packCards.map(card => ({
        ...card,
        instanceId: `${card.id}_${instanceCounter++}`
      })) as unknown as DraftCard[];

      // Extract leader from pack
      const leaderIndex = cardsWithInstanceIds.findIndex(c => c.isLeader);
      if (leaderIndex >= 0) {
        const leader = cardsWithInstanceIds[leaderIndex];
        if (leader) {
          playerLeaders.push(leader);
          // Remove leader from pack for drafting
          cardsWithInstanceIds.splice(leaderIndex, 1);
        }
      }

      // Remove base from pack (bases are not drafted)
      const baseIndex = cardsWithInstanceIds.findIndex(c => c.isBase);
      if (baseIndex >= 0) {
        cardsWithInstanceIds.splice(baseIndex, 1);
      }

      // Keep the pack object format { cards: [...] } for consistency with sealed pools
      playerPacks.push({ cards: cardsWithInstanceIds });
    }

    allPlayerPacks.push(playerPacks);
    allPlayerLeaders.push(playerLeaders);
    allOriginalPacks.push(playerOriginalPacks);
  }

  return {
    packs: allPlayerPacks,  // [player][packNumber][cards]
    leaders: allPlayerLeaders,  // [player][leaders] - 3 leaders per player
    originalPacks: allOriginalPacks,  // [player][packNumber] - original 16-card packs for tracking
  };
}

/**
 * Generate draft packs for all players
 * Each player gets 3 packs, with leaders extracted separately
 *
 * @param setCode - Set code (SOR, SHD, etc.) - ignored if chaosSets provided
 * @param playerCountOrOptions - Number of players OR options object
 * @returns { packs: playerPacks[][], leaders: playerLeaders[][] }
 */
export function generateDraftPacks(
  setCode: SetCode | string,
  playerCountOrOptions: number | DraftPacksOptions = 8
): DraftPacksResult {
  // Handle both old signature (playerCount number) and new signature (options object)
  const options: DraftPacksOptions = typeof playerCountOrOptions === 'number'
    ? { playerCount: playerCountOrOptions }
    : playerCountOrOptions;

  const playerCount = options.playerCount ?? 8;
  const chaosSets = options.chaosSets;

  // Clear belt cache for fresh generation
  clearBeltCache();

  const packsPerPlayer = chaosSets?.length || 3;
  const allPlayerPacks: DraftPack[][] = [];
  const allPlayerLeaders: DraftCard[][] = [];
  const allOriginalPacks: RawCard[][] = [];

  // Global counter for unique instance IDs across the entire draft
  let instanceCounter = 0;

  for (let player = 0; player < playerCount; player++) {
    const playerPacks: DraftPack[] = [];
    const playerLeaders: DraftCard[] = [];
    const playerOriginalPacks: RawCard[] = [];

    for (let packNum = 0; packNum < packsPerPlayer; packNum++) {
      // For Chaos Draft, use a different set for each pack
      // Otherwise use the single setCode
      const packSetCode = chaosSets && chaosSets[packNum]
        ? chaosSets[packNum]
        : setCode;

      // Generate a pack
      const pack: Pack = generateBoosterPack([], packSetCode);

      // Save original 16-card pack for stat tracking (before leader/base extraction)
      playerOriginalPacks.push(pack.cards);

      // Add unique instance IDs to all cards in the pack
      // This prevents race conditions where the same base card ID exists in multiple packs
      // Note: RawCard uses cardId/number, DraftCard uses collectorSetAndNumber/collectorNumber
      // During migration, we cast through unknown to allow both formats
      const cardsWithInstanceIds = pack.cards.map(card => ({
        ...card,
        instanceId: `${card.id}_${instanceCounter++}`
      })) as unknown as DraftCard[];

      // Extract leader from pack
      const leaderIndex = cardsWithInstanceIds.findIndex(c => c.isLeader);
      if (leaderIndex >= 0) {
        const leader = cardsWithInstanceIds[leaderIndex];
        if (leader) {
          playerLeaders.push(leader);
          // Remove leader from pack for drafting
          cardsWithInstanceIds.splice(leaderIndex, 1);
        }
      }

      // Remove base from pack (bases are not drafted)
      const baseIndex = cardsWithInstanceIds.findIndex(c => c.isBase);
      if (baseIndex >= 0) {
        cardsWithInstanceIds.splice(baseIndex, 1);
      }

      // Keep the pack object format { cards: [...] } for consistency with sealed pools
      playerPacks.push({ cards: cardsWithInstanceIds });
    }

    allPlayerPacks.push(playerPacks);
    allPlayerLeaders.push(playerLeaders);
    allOriginalPacks.push(playerOriginalPacks);
  }

  return {
    packs: allPlayerPacks,  // [player][packNumber][cards]
    leaders: allPlayerLeaders,  // [player][leaders] - 3 leaders per player
    originalPacks: allOriginalPacks,  // [player][packNumber] - original 16-card packs for tracking
  };
}

// === PASS DIRECTION ===

/**
 * Get pass direction for a pack number
 * Pack 1: pass left, Pack 2: pass right, Pack 3: pass left
 *
 * @param packNumber - 1-indexed pack number
 * @returns 'left' or 'right'
 */
export function getPassDirection(packNumber: number): PassDirection {
  return packNumber % 2 === 1 ? 'left' : 'right';
}

/**
 * Calculate next seat in pass direction
 * In a clockwise-seated draft:
 * - Pass LEFT = clockwise = to the player on your left = decreasing seat number (1→8, 2→1)
 * - Pass RIGHT = counter-clockwise = to the player on your right = increasing seat number (1→2, 2→3)
 *
 * @param currentSeat - Current seat number (1-indexed)
 * @param direction - 'left' or 'right'
 * @param totalSeats - Total number of seats (default 8)
 * @returns Next seat number
 */
export function getNextSeat(currentSeat: number, direction: PassDirection, totalSeats: number = 8): number {
  if (direction === 'left') {
    // Left = clockwise = decreasing seat numbers (1 -> 8 -> 7 -> ... -> 2 -> 1)
    return currentSeat <= 1 ? totalSeats : currentSeat - 1;
  } else {
    // Right = counter-clockwise = increasing seat numbers (1 -> 2 -> 3 -> ... -> 8 -> 1)
    return currentSeat >= totalSeats ? 1 : currentSeat + 1;
  }
}

// === PLAYER STATUS ===

/**
 * Check if all players have made their pick
 *
 * @param players - Array of player objects with pick_status
 * @returns True if all players have picked
 */
export function allPlayersPicked(players: Player[]): boolean {
  return players.every(p => p.pick_status === 'picked');
}

// === LEADER DRAFT ===

/**
 * Get leader pass direction for leader draft round
 * Leader draft always passes RIGHT
 *
 * @param _round - 1-indexed round number (unused, kept for API compatibility)
 * @returns 'right'
 */
export function getLeaderPassDirection(_round: number): PassDirection {
  return 'right';
}

// === PICK COUNTING ===

/**
 * Calculate current pick number for timer display
 *
 * @param packNumber - Current pack (1-3)
 * @param pickInPack - Pick number within current pack (1-14)
 * @returns Overall pick number
 */
export function getOverallPickNumber(packNumber: number, pickInPack: number): number {
  const cardsPerPack = 14; // After removing leader and base
  return (packNumber - 1) * cardsPerPack + pickInPack;
}

/**
 * Get the number of cards in each draft pack (after removing leader and base)
 */
export function getCardsPerDraftPack(): number {
  // Original pack: 16 cards (1 leader + 1 base + 9 commons + 3 uncommons + 1 rare/legendary + 1 foil)
  // After removing leader and base: 14 cards
  return 14;
}

// === DISPLAY LAYOUT ===

/**
 * Rotate seat number to position current user at bottom
 *
 * @param seatNumber - Original seat number (1-8)
 * @param userSeat - Current user's seat number
 * @param totalSeats - Total seats (default 8)
 * @returns Display position (1-8, where user's seat maps to position 1)
 */
export function getDisplayPosition(seatNumber: number, userSeat: number, totalSeats: number = 8): number {
  // Calculate how many positions to rotate
  const rotation = userSeat - 1;
  // Apply inverse rotation to get display position
  let position = seatNumber - rotation;
  if (position <= 0) position += totalSeats;
  return position;
}

/**
 * Map display position to visual position around the table
 * Position 1 (current user) is at the bottom center
 *
 * Layout:
 *         [4]     [5]
 *     [3]             [6]
 *     [2]             [7]
 *         [1]  YOU
 */
export function getPositionCoordinates(displayPosition: number, _totalSeats: number = 8): PositionCoordinates {
  // These are relative positions for a circular layout
  // Position 1 is at the bottom (current user)
  const positions: Record<number, PositionCoordinates> = {
    1: { x: 50, y: 85 },   // Bottom center (YOU)
    2: { x: 15, y: 65 },   // Bottom-left
    3: { x: 10, y: 35 },   // Left
    4: { x: 25, y: 10 },   // Top-left
    5: { x: 75, y: 10 },   // Top-right
    6: { x: 90, y: 35 },   // Right
    7: { x: 85, y: 65 },   // Bottom-right
    8: { x: 50, y: 85 },   // Overlaps with position 1 for 7-player mode
  };

  return positions[displayPosition] ?? { x: 50, y: 50 };
}
