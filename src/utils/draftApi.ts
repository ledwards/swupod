// @ts-nocheck
/**
 * Draft API Client
 *
 * API client for draft pod operations.
 * Uses httpClient for standardized request handling.
 */
import { httpClient, HttpError } from '../repositories/httpClient'

interface DraftSettings {
  maxPlayers?: number
  timerEnabled?: boolean
  timerSeconds?: number
  isPublic?: boolean
  competitive?: boolean
  flowId?: string | null
  settings?: {
    draftMode?: 'chaos' | 'standard'
    chaosSets?: string[]
    isSolo?: boolean
  }
}

interface CreateDraftResult {
  shareId: string
  shareUrl: string
}

interface DraftData {
  id: string
  shareId: string
  status: string
  hostId: string
  players: unknown[]
  draftState: Record<string, unknown>
}

interface JoinResult {
  seatNumber: number
}

interface LeaveResult {
  success: boolean
}

interface StartResult {
  success: boolean
}

interface RandomizeResult {
  success: boolean
}

interface UpdateResult {
  success: boolean
}

interface StateData {
  stateVersion: number
  status: string
  draftState: Record<string, unknown>
  players: unknown[]
}

interface SelectResult {
  success?: boolean
  stateChanged?: boolean
  message?: string
}

interface PickResult {
  success: boolean
}

interface PauseResult {
  paused: boolean
}

interface DropResult {
  dropped: boolean
  convertedToBot: boolean
}

/**
 * Create a new draft pod
 * @param setCode - Set code (e.g., 'SOR')
 * @param settings - Optional settings
 * @param settings.maxPlayers - Max players (default 8)
 * @param settings.timerEnabled - Enable timer (default true)
 * @param settings.timerSeconds - Timer duration (default 30)
 * @returns Created draft with shareId and shareUrl
 */
export async function createDraft(setCode: string, settings: DraftSettings = {}): Promise<CreateDraftResult> {
  try {
    return await httpClient.post<CreateDraftResult>('/draft', { setCode, ...settings })
  } catch (error) {
    console.error('Failed to create draft:', error)
    throw error
  }
}

/**
 * Load a draft pod by share ID
 * @param shareId - Share ID of the draft
 * @returns Draft data
 */
export async function loadDraft(shareId: string): Promise<DraftData> {
  if (!shareId || typeof shareId !== 'string') {
    throw new Error('Invalid shareId')
  }
  try {
    return await httpClient.get<DraftData>(`/draft/${shareId}`)
  } catch (error) {
    console.error('Failed to load draft:', error)
    throw error
  }
}

/**
 * Join a draft pod
 * @param shareId - Share ID of the draft
 * @returns Join result with seat number
 */
export async function joinDraft(shareId: string): Promise<JoinResult> {
  try {
    return await httpClient.post<JoinResult>(`/draft/${shareId}/join`, {})
  } catch (error) {
    console.error('Failed to join draft:', error)
    throw error
  }
}

/**
 * Leave a draft pod
 * @param shareId - Share ID of the draft
 * @returns Leave result
 */
export async function leaveDraft(shareId: string): Promise<LeaveResult> {
  try {
    return await httpClient.post<LeaveResult>(`/draft/${shareId}/leave`, {})
  } catch (error) {
    console.error('Failed to leave draft:', error)
    throw error
  }
}

/**
 * Start the draft (host only)
 * @param shareId - Share ID of the draft
 * @returns Start result
 */
export async function startDraft(shareId: string): Promise<StartResult> {
  try {
    return await httpClient.post<StartResult>(`/draft/${shareId}/start`, {})
  } catch (error) {
    console.error('Failed to start draft:', error)
    throw error
  }
}

/**
 * Randomize seat assignments (host only)
 * @param shareId - Share ID of the draft
 * @returns Randomize result
 */
export async function randomizeSeats(shareId: string): Promise<RandomizeResult> {
  try {
    return await httpClient.post<RandomizeResult>(`/draft/${shareId}/randomize`, {})
  } catch (error) {
    console.error('Failed to randomize seats:', error)
    throw error
  }
}

/**
 * Randomize pack order from the booster box (host only)
 * @param shareId - Share ID of the draft
 * @returns Randomize result
 */
export async function randomizePacks(shareId: string): Promise<RandomizeResult> {
  try {
    return await httpClient.post<RandomizeResult>(`/draft/${shareId}/randomize-packs`, {})
  } catch (error) {
    console.error('Failed to randomize packs:', error)
    throw error
  }
}

/**
 * Update draft settings (host only)
 * @param shareId - Share ID of the draft
 * @param settings - Settings to update
 * @returns Update result
 */
export async function updateSettings(shareId: string, settings: DraftSettings): Promise<UpdateResult> {
  try {
    return await httpClient.patch<UpdateResult>(`/draft/${shareId}/settings`, settings)
  } catch (error) {
    console.error('Failed to update settings:', error)
    throw error
  }
}

/**
 * Poll for state updates
 * @param shareId - Share ID of the draft
 * @param sinceVersion - Only return if state changed since this version
 * @returns State data
 */
export async function pollState(shareId: string, sinceVersion: number = 0): Promise<StateData> {
  try {
    return await httpClient.get<StateData>(`/draft/${shareId}/state?sinceVersion=${sinceVersion}`)
  } catch (error) {
    // Don't log "Draft not found" - it's expected when drafts are cancelled
    if (!(error instanceof Error) || !error.message?.includes('Draft not found')) {
      console.error('Failed to poll state:', error)
    }
    throw error
  }
}

/**
 * Select a card (staged pick)
 * The pick is finalized when all players have selected
 * @param shareId - Share ID of the draft
 * @param cardId - ID of the card to select, or null to unselect
 * @returns Selection result
 */
export async function selectCard(shareId: string, cardId: string | null): Promise<SelectResult> {
  if (!shareId || typeof shareId !== 'string') {
    throw new Error('Invalid shareId')
  }
  try {
    return await httpClient.post<SelectResult>(`/draft/${shareId}/select`, { cardId })
  } catch (error) {
    // Return special object for 409 (state changed) - caller should refresh
    if (error instanceof HttpError && error.status === 409) {
      return { stateChanged: true, message: error.message }
    }
    console.error('Failed to select card:', error)
    throw error
  }
}

/**
 * Make a draft pick
 * @param shareId - Share ID of the draft
 * @param cardId - ID of the card to pick
 * @returns Pick result
 */
export async function makePick(shareId: string, cardId: string): Promise<PickResult> {
  try {
    return await httpClient.post<PickResult>(`/draft/${shareId}/pick`, { cardId })
  } catch (error) {
    console.error('Failed to make pick:', error)
    throw error
  }
}

/**
 * Toggle pause state (host only)
 * @param shareId - Share ID of the draft
 * @returns Pause result with paused state
 */
export async function togglePause(shareId: string): Promise<PauseResult> {
  try {
    // This endpoint returns full response, not just data.data
    return await httpClient.post<PauseResult>(`/draft/${shareId}/pause`, undefined, { extractData: false })
  } catch (error) {
    console.error('Failed to toggle pause:', error)
    throw error
  }
}

/**
 * Delete a draft pod (host only)
 * @param shareId - Share ID of the draft
 * @returns Success status
 */
export async function deleteDraft(shareId: string): Promise<boolean> {
  try {
    await httpClient.delete(`/draft/${shareId}`)
    return true
  } catch (error) {
    console.error('Failed to delete draft:', error)
    return false
  }
}

/**
 * Drop from a draft pod (non-host only)
 * - During waiting: Removes player from lobby
 * - During active: Converts slot to bot that takes over picks
 * @param shareId - Share ID of the draft
 * @returns Drop result { dropped: true, convertedToBot: boolean }
 */
export async function dropFromDraft(shareId: string): Promise<DropResult> {
  try {
    return await httpClient.post<DropResult>(`/draft/${shareId}/drop`, {})
  } catch (error) {
    console.error('Failed to drop from draft:', error)
    throw error
  }
}
