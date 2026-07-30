// @ts-nocheck
/**
 * Draft-related type definitions
 */

import type { DraftCard, SetCode } from './card';
import type { DraftPack } from './pack';

// === DRAFT ENUMS ===

export type DraftPhase = 'lobby' | 'leader_preview' | 'leader_draft' | 'pack_draft' | 'complete';

export type DraftStatus = 'waiting' | 'active' | 'paused' | 'completed';

export type PickStatus = 'waiting' | 'picking' | 'picked' | 'timeout';

export type PassDirection = 'left' | 'right';

// === DRAFT STATE ===

/**
 * Draft state machine - stored in draft_pods.draft_state
 */
export interface DraftState {
  phase: DraftPhase;
  /** Current pack number (1-3) */
  packNumber: number;
  /** Current pick within the pack (1-14) */
  pickInPack: number;
  /** Current leader draft round (1-2) */
  leaderRound: number;
  /** Direction packs pass (alternates each pack) */
  passDirection: PassDirection;
  /** When the current pick timer started */
  timerStartedAt: Date | null;
}

// === DRAFT POD ===

/**
 * Draft pod - a multiplayer draft session
 */
export interface DraftPod {
  id: string;
  shareId: string;
  hostId: string;
  setCode: SetCode;
  setName: string;
  status: DraftStatus;
  maxPlayers: number;
  currentPlayers: number;
  timerEnabled: boolean;
  timerSeconds: number;
  timed: boolean;
  draftState: DraftState;
  /** All packs for all players: [playerIndex][packIndex] */
  allPacks: DraftPack[][] | null;
  /** Incrementing version for optimistic updates */
  stateVersion: number;
  startedAt: Date | null;
  completedAt: Date | null;
  pickStartedAt: Date | null;
  paused: boolean;
  pausedAt: Date | null;
  pausedDurationSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Draft pod database row (snake_case)
 */
export interface DraftPodRow {
  id: string;
  share_id: string;
  host_id: string;
  set_code: string;
  set_name: string;
  status: string;
  max_players: number;
  current_players: number;
  timer_enabled: boolean;
  timer_seconds: number;
  timed: boolean;
  draft_state: DraftState | string;
  all_packs: DraftPack[][] | string | null;
  state_version: number;
  started_at: Date | null;
  completed_at: Date | null;
  pick_started_at: Date | null;
  paused: boolean;
  paused_at: Date | null;
  paused_duration_seconds: number;
  created_at: Date;
  updated_at: Date;
}

// === DRAFT PLAYER ===

/**
 * Draft player - a participant in a draft pod
 */
export interface DraftPlayer {
  id: string;
  podId: string;
  userId: string | null;
  seatNumber: number;
  pickStatus: PickStatus;
  currentPack: DraftCard[] | null;
  draftedCards: DraftCard[];
  draftedLeaders: DraftCard[];
  leaders: DraftCard[];
  selectedCardId: string | null;
  lastPickAt: Date | null;
  lastHeartbeat: Date;
  joinedAt: Date;

  // Derived/computed
  isBot: boolean;
  displayName: string;
}

/**
 * Draft player database row (snake_case)
 */
export interface DraftPlayerRow {
  id: string;
  pod_id: string;
  user_id: string | null;
  seat_number: number;
  pick_status: string;
  current_pack: DraftCard[] | string | null;
  drafted_cards: DraftCard[] | string;
  drafted_leaders: DraftCard[] | string;
  leaders: DraftCard[] | string | null;
  selected_card_id: string | null;
  last_pick_at: Date | null;
  last_heartbeat: Date;
  joined_at: Date;
}

// === DRAFT ACTIONS ===

/**
 * A pick action during draft
 */
export interface DraftPick {
  /** instanceId of the card being picked */
  cardId: string;
  playerId: string;
  timestamp: Date;
}

/**
 * Result of processing a pick
 */
export interface PickResult {
  success: boolean;
  message?: string;
  advancedPhase?: boolean;
  newPhase?: DraftPhase;
}

// === DRAFT HELPERS ===

/**
 * Get pass direction for a pack number
 */
export function getPassDirection(packNumber: number): PassDirection {
  // Pack 1: left, Pack 2: right, Pack 3: left
  return packNumber % 2 === 1 ? 'left' : 'right';
}

/**
 * Check if a draft is active (not waiting or completed)
 */
export function isDraftActive(status: DraftStatus): boolean {
  return status === 'active' || status === 'paused';
}

/**
 * Check if a player is a bot
 */
export function isBot(player: DraftPlayer): boolean {
  return player.userId === null;
}

/**
 * Get the seat number of the player receiving a pack from this seat
 */
export function getNextSeat(
  currentSeat: number,
  direction: PassDirection,
  totalPlayers: number
): number {
  if (direction === 'left') {
    return currentSeat === totalPlayers ? 1 : currentSeat + 1;
  } else {
    return currentSeat === 1 ? totalPlayers : currentSeat - 1;
  }
}
