// @ts-nocheck
/**
 * Central type exports for the application
 *
 * Import types from here:
 *   import type { Card, DraftCard, SetCode } from '@/src/types'
 */

// Card types
export type {
  SetCode,
  Rarity,
  CardType,
  Aspect,
  Arena,
  VariantType,
  Card,
  DraftCard,
  CardPosition,
  LegacyCard,
} from './card';

export {
  isDraftCard,
  isLegacyCard,
  normalizeLegacyCard,
} from './card';

// Pack types
export type {
  PackSlot,
  BoosterPack,
  DraftPack,
  SealedPool,
  LeaderPack,
  PackGenerationConfig,
  RarityWeights as PackRarityWeights,
} from './pack';

export {
  isValidBoosterPack,
  isValidDraftPack,
} from './pack';

// Belt types
export type {
  BeltType,
  BeltAssignment,
  Belt,
  HopperBelt,
  BeltConfig,
  LeaderBeltConfig,
  CommonBeltConfig,
  RareLegendaryBeltConfig,
  BeltState,
  CardBeltAssignments,
  SetBeltAssignments,
} from './belt';

// User types
export type {
  User,
  UserRow,
  JWTPayload,
  Session,
  AuthContextValue,
} from './user';

export {
  rowToUser,
  hasBetaAccess,
  isAdmin,
} from './user';

// Draft types
export type {
  DraftPhase,
  DraftStatus,
  PickStatus,
  PassDirection,
  DraftState,
  DraftPod,
  DraftPodRow,
  DraftPlayer,
  DraftPlayerRow,
  DraftPick,
  PickResult,
} from './draft';

export {
  getPassDirection,
  isDraftActive,
  isBot,
  getNextSeat,
} from './draft';

// Pool types
export type {
  PoolType,
  CardPool,
  CardPoolRow,
  ViewMode,
  SortOption,
  DeckBuilderState,
  Deck,
  DeckValidation,
} from './pool';

export {
  validateDeck,
  getPoolCardCount,
  getDeckCards,
  getSideboardCards,
} from './pool';

// Set config types
export type {
  LeaderBaseCounts,
  CardCounts,
  PackRules,
  RarityWeightMap,
  RarityWeights,
  UpgradeProbabilities,
  BeltRatios,
  SetConfig,
} from './setConfig';

export {
  isBlockASet,
  hasHyperspaceVariants,
  hasShowcaseVariants,
  hasPrestigeVariants,
  getRareToLegendaryRatio,
} from './setConfig';

// API types
export type {
  ApiResponse,
  ApiError,
  PaginatedResponse,
  CreatePoolRequest,
  CreatePoolResponse,
  UpdatePoolRequest,
  CreateDraftRequest,
  CreateDraftResponse,
  JoinDraftRequest,
  DraftStateResponse,
  MakePickRequest,
  MakePickResponse,
  UserPoolsResponse,
  ShowcaseLeader,
  ShowcaseLeadersResponse,
  GenerationStats,
  SetStats,
  StatsResponse,
  TrackGenerationRequest,
} from './api';

export {
  isApiError,
  getErrorMessage,
} from './api';
