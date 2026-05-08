// @ts-nocheck
/**
 * Pool API Client
 *
 * API client for card pool operations.
 * Uses httpClient for standardized request handling.
 */
import { httpClient } from '../repositories/httpClient'
import type { RawCard } from './cardData'
import type { SetCode } from '../types'

interface DeckBuilderState {
  deck?: RawCard[]
  pool?: RawCard[]
  leader?: RawCard | null
  base?: RawCard | null
  [key: string]: unknown
}

interface Pack {
  cards: RawCard[]
}

interface PoolData {
  setCode: SetCode | string
  cards: RawCard[]
  packs?: Pack[]
  deckBuilderState?: DeckBuilderState
  isPublic?: boolean
  shareId?: string
  boxPacks?: Pack[]
  packIndices?: number[]
  hidden?: boolean
  name?: string | null
  poolType?: string
  parentPoolId?: string | null
  forceNew?: boolean
}

interface SavedPool extends PoolData {
  shareId: string
  shareUrl: string
  hasBox?: boolean
  shuffledPacks?: boolean
  alreadyExists?: boolean
  parentShareId?: string | null
  buildCount?: number
}

interface RandomizeResult {
  packs: Pack[]
  cards: RawCard[]
  packIndices: number[]
  shuffledPacks: boolean
}

interface ClaimResult {
  claimed: boolean
  alreadyOwned?: boolean
}

interface PoolsResponse {
  pools?: SavedPool[]
  total?: number
  limit?: number
  offset?: number
}

/**
 * Save a card pool to the database
 * @param poolData - Pool data
 * @returns Saved pool with shareId and shareUrl
 */
export async function savePool(poolData: PoolData): Promise<SavedPool> {
  try {
    return await httpClient.post('/pools', poolData)
  } catch (error) {
    console.error('Failed to save pool:', error)
    throw error
  }
}

/**
 * Load a pool by share ID
 * @param shareId - Share ID of the pool
 * @returns Pool data
 */
export async function loadPool(shareId: string): Promise<SavedPool> {
  try {
    return await httpClient.get(`/pools/${shareId}`)
  } catch (error) {
    console.error('Failed to load pool:', error)
    throw error
  }
}

/**
 * Update a pool (e.g., deck builder state)
 * @param shareId - Share ID of the pool
 * @param updates - Fields to update
 * @returns Updated pool data
 */
export async function updatePool(shareId: string, updates: Partial<PoolData>): Promise<SavedPool> {
  try {
    return await httpClient.put(`/pools/${shareId}`, updates)
  } catch (error) {
    console.error('Failed to update pool:', error)
    throw error
  }
}

/**
 * Delete a pool
 * @param shareId - Share ID of the pool
 * @returns Success status
 */
export async function deletePool(shareId: string): Promise<boolean> {
  try {
    await httpClient.delete(`/pools/${shareId}`)
    return true
  } catch (error) {
    console.error('Failed to delete pool:', error)
    return false
  }
}

/**
 * Claim an anonymous pool (set user_id to current user)
 * @param shareId - Share ID of the pool
 * @returns Claim result { claimed: boolean, alreadyOwned?: boolean }
 */
export async function claimPool(shareId: string): Promise<ClaimResult> {
  try {
    return await httpClient.post(`/pools/${shareId}/claim`, {})
  } catch (error) {
    console.error('Failed to claim pool:', error)
    throw error
  }
}

/**
 * Fetch all pools for a user
 * @param userId - User ID
 * @returns Array of pool objects
 */
export async function fetchUserPools(userId: string): Promise<SavedPool[]> {
  try {
    const data: PoolsResponse | SavedPool[] = await httpClient.get(`/pools/user/${userId}`)
    // API returns { pools: [...], total, limit, offset } or just pools array
    if (Array.isArray(data)) {
      return data
    }
    return data?.pools || []
  } catch (error) {
    console.error('Failed to fetch user pools:', error)
    throw error
  }
}

/**
 * Randomize packs from the booster box
 * @param shareId - Share ID of the pool
 * @returns New packs, cards, and indices
 */
export async function randomizePacks(shareId: string): Promise<RandomizeResult> {
  try {
    return await httpClient.post(`/pools/${shareId}/randomize`, {})
  } catch (error) {
    console.error('Failed to randomize packs:', error)
    throw error
  }
}
