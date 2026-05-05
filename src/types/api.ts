// @ts-nocheck
/**
 * API-related type definitions
 */

import type { DraftPod, DraftPlayer } from './draft';
import type { CardPool } from './pool';

// === GENERIC API RESPONSES ===

/**
 * Standard API success response
 */
export interface ApiResponse<T = unknown> {
  data?: T;
  message?: string;
}

/**
 * Standard API error response
 */
export interface ApiError {
  error: string;
  message?: string;
  statusCode?: number;
}

/**
 * Paginated API response
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

// === POOL API ===

export interface CreatePoolRequest {
  setCode: string;
  cards: unknown[];
  packs?: unknown[];
  deckBuilderState?: unknown;
  isPublic?: boolean;
  shareId?: string;
  poolType?: 'sealed' | 'draft' | 'imported';
}

export interface CreatePoolResponse {
  id: string;
  shareId: string;
  shareUrl: string;
  createdAt: Date;
}

export interface UpdatePoolRequest {
  poolName?: string;
  deckBuilderState?: unknown;
  hidden?: boolean;
}

// === DRAFT API ===

export interface CreateDraftRequest {
  setCode: string;
  maxPlayers?: number;
  timerEnabled?: boolean;
  timerSeconds?: number;
}

export interface CreateDraftResponse {
  shareId: string;
  shareUrl: string;
}

export interface JoinDraftRequest {
  shareId: string;
}

export interface DraftStateResponse {
  pod: DraftPod;
  player: DraftPlayer;
  players: DraftPlayer[];
  stateVersion: number;
}

export interface MakePickRequest {
  cardId: string;
}

export interface MakePickResponse {
  success: boolean;
  message?: string;
}

// === USER API ===

export interface UserPoolsResponse {
  pools: CardPool[];
}

export interface ShowcaseLeader {
  id: string;
  cardId: string;
  setCode: string;
  cardName: string;
  cardSubtitle: string | null;
  variantType: string;
  sourceType: string;
  sourceShareId: string;
  generatedAt: Date;
}

export interface ShowcaseLeadersResponse {
  showcaseLeaders: ShowcaseLeader[];
  total: number;
  uniqueCount: number;
  limit: number;
  offset: number;
}

// === STATS API ===

export interface GenerationStats {
  treatment: string;
  count: number;
  percentage: number;
}

export interface SetStats {
  setCode: string;
  totalGenerations: number;
  byTreatment: GenerationStats[];
}

export interface StatsResponse {
  totalGenerations: number;
  bySets: SetStats[];
}

// === TRACKING API ===

export interface TrackGenerationRequest {
  card: unknown;
  options: {
    packType: 'booster' | 'leader';
    sourceType: 'sealed' | 'draft';
    sourceId: string;
    sourceShareId: string;
    slotType?: string;
    packIndex?: number;
    userId?: string;
  };
}

// === API HELPERS ===

/**
 * Type guard for API error responses
 */
export function isApiError(response: unknown): response is ApiError {
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response
  );
}

/**
 * Extract error message from API response
 */
export function getErrorMessage(response: unknown): string {
  if (isApiError(response)) {
    return response.message || response.error;
  }
  if (response instanceof Error) {
    return response.message;
  }
  return 'An unknown error occurred';
}
