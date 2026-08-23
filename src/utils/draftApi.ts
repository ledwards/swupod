// @ts-nocheck
/**
 * Draft API Client
 *
 * API client for draft pod operations.
 * Uses httpClient for standardized request handling.
 */
import { httpClient, HttpError } from '../repositories/httpClient'
import { estimateServerTimeOffsetMs } from './serverClock'

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
  serverNow?: string
  serverTimeOffsetMs?: number
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
  serverNow?: string
  serverTimeOffsetMs?: number
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
    const requestStartedAtMs = Date.now()
    return withServerTimeOffset(
      await httpClient.get<DraftData>(`/draft/${shareId}`),
      requestStartedAtMs,
    )
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
 * Open picking after the leader preview (host only).
 * Flips the draft from 'leader_preview' to 'leader_draft' and starts timers.
 * @param shareId - Share ID of the draft
 * @returns Start result
 */
export async function beginPicking(shareId: string): Promise<StartResult> {
  try {
    return await httpClient.post<StartResult>(`/draft/${shareId}/begin-picking`, {})
  } catch (error) {
    console.error('Failed to begin picking:', error)
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
    const requestStartedAtMs = Date.now()
    return withServerTimeOffset(
      await httpClient.get<StateData>(`/draft/${shareId}/state?sinceVersion=${sinceVersion}`),
      requestStartedAtMs,
    )
  } catch (error) {
    // Don't log "Draft not found" - it's expected when drafts are cancelled
    if (!(error instanceof Error) || !error.message?.includes('Draft not found')) {
      console.error('Failed to poll state:', error)
    }
    throw error
  }
}

function withServerTimeOffset<T extends { serverNow?: string; serverTimeOffsetMs?: number }>(
  data: T,
  clientReferenceAtMs: number = Date.now(),
): T {
  return {
    ...data,
    // Use the request start time as the client reference so network delay makes
    // the visible timer conservative instead of showing extra seconds.
    serverTimeOffsetMs: estimateServerTimeOffsetMs(data?.serverNow, clientReferenceAtMs),
  }
}

/**
 * Select a card (staged pick)
 * The pick is finalized when all players have selected
 * @param shareId - Share ID of the draft
 * @param cardId - ID of the card to select, or null to unselect
 * @returns Selection result
 */
/**
 * True when a select rejection means the client's local view of the deal is STALE
 * (out of sync with the server) rather than a hard error to surface. Both cases
 * collapse to the same remedy — refresh the draft state and let the player re-pick
 * from the server's current cards:
 *   - 409: the server explicitly signalled the state changed under us.
 *   - 400 "Leader/Card not available": we sent a card the server no longer has on
 *     our list because our pack/leader view hadn't caught up to the latest deal.
 *     (This is the "Leader not available" red banner — really a stale screen, not a
 *     dead end; a refresh re-syncs the correct cards.)
 * An UNRELATED 400 (e.g. a validation error) is NOT treated as stale, so we never
 * silently refresh-and-loop on an error the player actually needs to see.
 */
export function isStaleSelectionError(error: unknown): boolean {
  if (!(error instanceof HttpError)) return false
  if (error.status === 409) return true
  if (error.status === 400 && /not available/i.test(error.message)) return true
  return false
}

export async function selectCard(shareId: string, cardId: string | null): Promise<SelectResult> {
  if (!shareId || typeof shareId !== 'string') {
    throw new Error('Invalid shareId')
  }
  try {
    return await httpClient.post<SelectResult>(`/draft/${shareId}/select`, { cardId })
  } catch (error) {
    // A stale local view of the deal is not a hard error — signal the caller to
    // refresh and re-sync (handleSelect treats stateChanged as a silent refresh)
    // instead of throwing a dead error banner the player can't act on.
    if (isStaleSelectionError(error)) {
      return { stateChanged: true, message: error instanceof Error ? error.message : undefined }
    }
    console.error('Failed to select card:', error)
    throw error
  }
}

/**
 * Confirm the staged selection, committing it as this round's pick.
 *
 * The second half of the two-step pick: `selectCard` stages, this locks in.
 * A 409 means the round moved on (timeout, or nothing staged any more) — the
 * caller should refresh rather than surface a dead error.
 *
 * @param shareId - Share ID of the draft
 * @returns Confirmation result, or { stateChanged: true } if it went stale
 */
export async function confirmSelection(shareId: string): Promise<SelectResult> {
  if (!shareId || typeof shareId !== 'string') {
    throw new Error('Invalid shareId')
  }
  try {
    return await httpClient.post<SelectResult>(`/draft/${shareId}/confirm`, {})
  } catch (error) {
    if (isStaleSelectionError(error)) {
      return { stateChanged: true, message: error instanceof Error ? error.message : undefined }
    }
    console.error('Failed to confirm selection:', error)
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
