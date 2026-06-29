// @ts-nocheck
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { loadDraft } from '../utils/draftApi'
import { estimateServerTimeOffsetMs } from '../utils/serverClock'

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
  matchmakingStatus?: string;
  currentRound?: number;
  deckBuildDeadline?: string | null;
  decksUnlocked?: boolean;
  rounds?: unknown[];
  serverTimeOffsetMs?: number;
  [key: string]: unknown;
}

/** Socket state update data */
interface SocketStateData {
  status: Draft['status'];
  draftState: DraftState;
  players: DraftPlayer[];
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
  matchmakingStatus?: string;
  currentRound?: number;
  deckBuildDeadline?: string | null;
  decksUnlocked?: boolean;
  rounds?: unknown[];
  serverNow?: string;
}

/** Options for useDraftSocket hook */
interface UseDraftSocketOptions {
  enabled?: boolean;
}

/** Return type for useDraftSocket hook */
export interface UseDraftSocketReturn {
  draft: Draft | null;
  loading: boolean;
  error: string | null;
  deleted: boolean;
  connected: boolean;
  refresh: () => Promise<void>;
  reconnect: () => void;
  isHost: boolean;
  isPlayer: boolean;
  players: DraftPlayer[];
  myPlayer: DraftPlayer | null;
  draftState: DraftState;
  status: string;
}

// === HOOK ===

/**
 * Hook for syncing draft state via WebSocket (Socket.io)
 *
 * WebSocket pushes public state changes instantly.
 * User-specific data (myPlayer, currentPack, leaders) is fetched via HTTP.
 *
 * @param shareId - Draft share ID
 * @param options - Options
 * @returns Draft state and controls
 */
export function useDraftSocket(
  shareId: string | null,
  { enabled = true }: UseDraftSocketOptions = {}
): UseDraftSocketReturn {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleted, setDeleted] = useState(false)
  const [connected, setConnected] = useState(false)

  const socketRef = useRef<Socket | null>(null)
  const stateVersionRef = useRef(0)

  // Fetch full draft state including user-specific data via HTTP
  const fetchDraft = useCallback(async (showLoading = true) => {
    if (!shareId) return
    if (showLoading) {
      setLoading(true)
    }
    setError(null)
    try {
      const data = await loadDraft(shareId) as Draft
      setDraft(data)
      stateVersionRef.current = data.stateVersion || 0
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }, [shareId])

  useEffect(() => {
    if (!shareId || !enabled) return

    // Initial load via HTTP
    fetchDraft()

    // Connect to Socket.io for real-time notifications
    const socket = io()
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      setError(null)
      socket.emit('join-draft', shareId)
      // Refresh to catch any broadcasts missed between initial fetch and socket connection
      fetchDraft(false)
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    socket.on('connect_error', (err: Error) => {
      console.error('Socket connection error:', err)
      setError('Connection error')
    })

    // When state changes, fetch fresh data via HTTP
    socket.on('state', async (data: SocketStateData) => {
      // Draft picks bump stateVersion, but matchmaking/game lifecycle updates
      // can broadcast without changing pod.state_version. Apply same-version
      // public state so live Swiss rows update immediately.
      const shouldFetchPrivateData = data.stateVersion > stateVersionRef.current
      if (data.stateVersion >= stateVersionRef.current) {
        stateVersionRef.current = Math.max(stateVersionRef.current, data.stateVersion)

        // Update public state immediately for responsiveness
        setDraft(prev => prev ? {
          ...prev,
          status: data.status,
          draftState: data.draftState,
          players: data.players,
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
          matchmakingStatus: data.matchmakingStatus,
          currentRound: data.currentRound,
          deckBuildDeadline: data.deckBuildDeadline,
          decksUnlocked: data.decksUnlocked,
          rounds: data.rounds,
          serverTimeOffsetMs: prev.serverTimeOffsetMs ?? estimateServerTimeOffsetMs(data.serverNow),
        } : null)

        if (!shouldFetchPrivateData) return

        // Fetch user-specific data via HTTP (uses auth cookie)
        try {
          const fullData = await loadDraft(shareId) as Draft
          setDraft(prev => prev ? {
            ...prev,
            myPlayer: fullData.myPlayer,
            isHost: fullData.isHost,
            isPlayer: fullData.isPlayer,
            serverTimeOffsetMs: fullData.serverTimeOffsetMs ?? prev.serverTimeOffsetMs,
          } : null)
        } catch (err) {
          console.error('Error fetching user data:', err)
        }
      }
    })

    socket.on('deleted', () => {
      setDeleted(true)
    })

    return () => {
      socket.emit('leave-draft', shareId)
      socket.disconnect()
    }
  }, [shareId, enabled, fetchDraft])

  // Manual refresh
  const refresh = useCallback(async (): Promise<void> => {
    await fetchDraft(false)
  }, [fetchDraft])

  // Force reconnect
  const reconnect = useCallback((): void => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current.connect()
    }
  }, [])

  return {
    draft,
    loading,
    error,
    deleted,
    connected,
    refresh,
    reconnect,
    // Convenience accessors
    isHost: draft?.isHost || false,
    isPlayer: draft?.isPlayer || false,
    players: draft?.players || [],
    myPlayer: draft?.myPlayer || null,
    draftState: draft?.draftState || {},
    status: draft?.status || 'loading',
  }
}

export default useDraftSocket
