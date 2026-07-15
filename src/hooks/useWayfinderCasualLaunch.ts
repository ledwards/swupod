'use client'

/**
 * Casual open-game launcher (Lobby V1, U5) — mirrors
 * useWayfinderPracticeLaunch with `openGameId` correlation instead of the
 * practice ids (U2/U6 contract). The claim endpoint tells this seat what to
 * do; the Companion intents do the Karabast work.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type CasualLaunchMessageType = 'success' | 'error' | 'info'

export interface CasualClaim {
  action: 'create_lobby' | 'wait_for_lobby' | 'join_lobby' | 'open_lobby' | 'lobby_link'
  attemptId?: string
  lobbyName?: string
  lobbyUrl?: string
  gameStatus: string
}

interface UseWayfinderCasualLaunchOptions {
  openGameShareId: string | null
  poolShareId: string | null
  companionCapable: boolean
  deckUrl?: string | null
  onMessage?: (text: string, type: CasualLaunchMessageType) => void
}

export function buildWayfinderCasualCreatePayload(opts: {
  openGameShareId: string
  poolShareId: string
  deckUrl: string
  lobbyName: string
  visibility: 'public' | 'private'
}) {
  return {
    type: 'wayfinder:casual-create-game',
    privacy: opts.visibility,
    openInNewTab: true,
    deckUrl: opts.deckUrl,
    lobbyName: opts.lobbyName,
    openGameId: opts.openGameShareId,
    poolShareId: opts.poolShareId,
    callbackContext: {
      openGameId: opts.openGameShareId,
      poolShareId: opts.poolShareId,
      lifecycleUrl: '/api/plugin/v1/practice/match-game/lifecycle',
      resultUrl: '/api/plugin/v1/match/result',
    },
  }
}

export function buildWayfinderCasualJoinPayload(opts: {
  openGameShareId: string
  poolShareId: string
  deckUrl: string
  lobbyUrl: string
}) {
  return {
    type: 'wayfinder:casual-join-game',
    openInNewTab: true,
    lobbyUrl: opts.lobbyUrl,
    deckUrl: opts.deckUrl,
    openGameId: opts.openGameShareId,
    poolShareId: opts.poolShareId,
    callbackContext: {
      openGameId: opts.openGameShareId,
      poolShareId: opts.poolShareId,
      lifecycleUrl: '/api/plugin/v1/practice/match-game/lifecycle',
      resultUrl: '/api/plugin/v1/match/result',
    },
  }
}

export function useWayfinderCasualLaunch({
  openGameShareId,
  poolShareId,
  companionCapable,
  deckUrl = null,
  onMessage,
}: UseWayfinderCasualLaunchOptions) {
  const [pending, setPending] = useState(false)
  const [lastClaim, setLastClaim] = useState<CasualClaim | null>(null)
  const [message, setMessageState] = useState<{ text: string; type: CasualLaunchMessageType } | null>(null)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setMessage = useCallback((text: string, type: CasualLaunchMessageType) => {
    setMessageState({ text, type })
    onMessage?.(text, type)
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    clearTimerRef.current = setTimeout(() => setMessageState(null), 8000)
  }, [onMessage])

  useEffect(() => () => { if (clearTimerRef.current) clearTimeout(clearTimerRef.current) }, [])

  /**
   * Claim and act. `visibility` shapes create intents (private for matched
   * games; public for create-at-post on an open listing, R34).
   */
  const launch = useCallback(async (visibility: 'public' | 'private' = 'private'): Promise<CasualClaim | null> => {
    if (!openGameShareId || !poolShareId) return null
    setPending(true)
    try {
      const response = await fetch(`/api/open-games/${openGameShareId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ companionCapable }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(body?.message || 'Could not launch the game')
      }
      const claim: CasualClaim = (body.data || body).claim
      setLastClaim(claim)

      const resolvedDeckUrl = deckUrl || `${window.location.origin}/pool/${poolShareId}/deck`

      if (claim.action === 'create_lobby') {
        window.postMessage(
          buildWayfinderCasualCreatePayload({
            openGameShareId,
            poolShareId,
            deckUrl: resolvedDeckUrl,
            lobbyName: claim.lobbyName || 'protectthepod.com',
            visibility,
          }),
          '*'
        )
        setMessage('Creating your Karabast lobby from the Companion…', 'info')
      } else if (claim.action === 'join_lobby' && claim.lobbyUrl) {
        window.postMessage(
          buildWayfinderCasualJoinPayload({
            openGameShareId,
            poolShareId,
            deckUrl: resolvedDeckUrl,
            lobbyUrl: claim.lobbyUrl,
          }),
          '*'
        )
        setMessage('Opening the lobby from the Companion…', 'info')
      } else if (claim.action === 'open_lobby' && claim.lobbyUrl) {
        window.open(claim.lobbyUrl, '_blank', 'noopener')
        setMessage('Reopening your lobby…', 'info')
      } else if (claim.action === 'wait_for_lobby') {
        // A creation is in flight. If the Companion never reports back, the
        // server lets the host supersede the attempt after a minute.
        setMessage('Lobby creation is in flight — if nothing opens, try again in a minute.', 'info')
      }
      return claim
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not launch the game', 'error')
      return null
    } finally {
      setPending(false)
    }
  }, [openGameShareId, poolShareId, companionCapable, deckUrl, setMessage])

  return { launch, pending, lastClaim, message }
}

export default useWayfinderCasualLaunch
