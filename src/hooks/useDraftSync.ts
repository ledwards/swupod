// @ts-nocheck
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { pollState, loadDraft } from '../utils/draftApi'

// === TYPES ===

/** Draft player information */
interface DraftPlayer {
  seat: number;
  username: string | null;
  discordId: string | null;
  isBot: boolean;
  isHost: boolean;
  [key: string]: unknown;
}

/** Draft state from server */
interface DraftState {
  round?: number;
  pick?: number;
  pack?: unknown[];
  picks?: unknown[];
  [key: string]: unknown;
}

/** Full draft data */
interface Draft {
  id: string;
  shareId: string;
  status: 'waiting' | 'active' | 'completed' | 'cancelled';
  setCode: string;
  maxPlayers: number;
  isHost: boolean;
  isPlayer: boolean;
  players: DraftPlayer[];
  myPlayer: DraftPlayer | null;
  draftState: DraftState;
  timed: boolean;
  timerEnabled: boolean;
  timerSeconds: number;
  pickTimeoutSeconds: number;
  startedAt: string | null;
  completedAt: string | null;
  pickStartedAt: string | null;
  stateVersion: number;
  paused: boolean;
  pausedAt: string | null;
  pausedDurationSeconds: number;
  serverTimeOffsetMs?: number;
  [key: string]: unknown;
}

/** Poll state response */
interface PollStateResponse {
  changed: boolean;
  status: Draft['status'];
  draftState: DraftState;
  players: DraftPlayer[];
  myPlayer: DraftPlayer | null;
  timed: boolean;
  timerEnabled: boolean;
  timerSeconds: number;
  pickTimeoutSeconds: number;
  startedAt: string | null;
  completedAt: string | null;
  pickStartedAt: string | null;
  stateVersion: number;
  paused: boolean;
  pausedAt: string | null;
  pausedDurationSeconds: number;
  serverTimeOffsetMs?: number;
}

/** Options for useDraftSync hook */
interface UseDraftSyncOptions {
  pollInterval?: number;
  enabled?: boolean;
}

/** Return type for useDraftSync hook */
export interface UseDraftSyncReturn {
  draft: Draft | null;
  loading: boolean;
  error: string | null;
  deleted: boolean;
  refresh: () => Promise<void>;
  forcePoll: () => Promise<void>;
  isHost: boolean;
  isPlayer: boolean;
  players: DraftPlayer[];
  myPlayer: DraftPlayer | null;
  draftState: DraftState;
  status: string;
}

// === HOOK ===

/**
 * Hook for syncing draft state with the server
 *
 * @param shareId - Draft share ID
 * @param options - Options
 * @returns Draft state and controls
 */
export function useDraftSync(
  shareId: string | null,
  { pollInterval = 2000, enabled = true }: UseDraftSyncOptions = {}
): UseDraftSyncReturn {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleted, setDeleted] = useState(false)
  const stateVersionRef = useRef(0)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Initial load
  const loadInitial = useCallback(async () => {
    if (!shareId) return

    setLoading(true)
    setError(null)

    try {
      const data = await loadDraft(shareId) as Draft
      setDraft(data)
      stateVersionRef.current = data.stateVersion || 0
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [shareId])

  // Poll for updates
  const poll = useCallback(async () => {
    if (!shareId || !enabled || deleted) return

    try {
      const data = await pollState(shareId, stateVersionRef.current) as PollStateResponse

      if (data.changed) {
        // Update state
        setDraft(prev => prev ? {
          ...prev,
          status: data.status,
          draftState: data.draftState,
          players: data.players,
          myPlayer: data.myPlayer,
          timed: data.timed,
          timerEnabled: data.timerEnabled,
          timerSeconds: data.timerSeconds,
          pickTimeoutSeconds: data.pickTimeoutSeconds,
          startedAt: data.startedAt,
          completedAt: data.completedAt,
          pickStartedAt: data.pickStartedAt,
          stateVersion: data.stateVersion,
          paused: data.paused,
          pausedAt: data.pausedAt,
          pausedDurationSeconds: data.pausedDurationSeconds,
          serverTimeOffsetMs: data.serverTimeOffsetMs,
        } : null)
        stateVersionRef.current = data.stateVersion
      }
    } catch (err) {
      // Check if draft was deleted
      const errorMessage = err instanceof Error ? err.message : ''
      if (errorMessage === 'Draft not found') {
        setDeleted(true)
        return
      }
      // Don't set error for other poll failures - just retry
    }
  }, [shareId, enabled, deleted])

  // Start polling
  useEffect(() => {
    if (!shareId || !enabled || deleted) return

    const startPolling = (): void => {
      pollTimeoutRef.current = setTimeout(async () => {
        await poll()
        startPolling()
      }, pollInterval)
    }

    startPolling()

    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
      }
    }
  }, [shareId, enabled, deleted, pollInterval, poll])

  // Initial load
  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  // Manual refresh
  const refresh = useCallback(async (): Promise<void> => {
    await loadInitial()
  }, [loadInitial])

  // Force immediate poll with retry for state changes
  const forcePoll = useCallback(async (): Promise<void> => {
    await poll()
    // If state didn't change, retry once after a short delay
    // This handles the case where bot processing is still running
    setTimeout(async () => {
      await poll()
    }, 500)
  }, [poll])

  return {
    draft,
    loading,
    error,
    deleted,
    refresh,
    forcePoll,
    // Convenience accessors
    isHost: draft?.isHost || false,
    isPlayer: draft?.isPlayer || false,
    players: draft?.players || [],
    myPlayer: draft?.myPlayer || null,
    draftState: draft?.draftState || {},
    status: draft?.status || 'loading',
  }
}

export default useDraftSync
