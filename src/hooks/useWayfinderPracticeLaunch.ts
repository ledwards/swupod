'use client'

import { useCallback, useState } from 'react'

export type PracticeLaunchMessageType = 'success' | 'error' | 'info'

export interface PracticeLaunchMessage {
  matchId: string | null
  type: PracticeLaunchMessageType
  text: string
}

interface PracticeGameClaimResult {
  action: 'create_lobby' | 'join_lobby' | 'wait_for_lobby' | 'already_complete' | 'manual_only'
  practiceMatchGameId: string | null
  matchId: string
  podId: string
  roundId: string
  shareId: string
  gameNumber: number | null
  attemptNumber: number | null
  status: string
  createdByUserId: string | null
  lobbyUrl: string | null
  spectateUrl: string | null
  stale: boolean
  retryable: boolean
  manualFallbackAvailable: true
  isNewlyCreated: boolean
}

interface UseWayfinderPracticeLaunchOptions {
  draftShareId: string | null
  poolShareId: string | null
  wayfinderDetected: boolean
  cardPool: string
  format?: string
  deckUrl?: string | null
  onTrack?: (action: string, properties?: Record<string, unknown>) => void
  onMessage?: (text: string, type: PracticeLaunchMessageType) => void
}

interface WayfinderPracticePayloadOptions {
  claim: PracticeGameClaimResult
  draftShareId: string
  poolShareId: string
  deckUrl: string
  format: string
  cardPool: string
}

const CLAIM_ERROR_MESSAGE = 'Could not launch that Swiss Practice game.'

export function buildWayfinderPracticeCreatePayload({
  claim,
  draftShareId,
  poolShareId,
  deckUrl,
  format,
  cardPool,
}: WayfinderPracticePayloadOptions) {
  return {
    type: 'wayfinder:practice-create-game',
    privacy: 'private',
    openInNewTab: true,
    deckUrl,
    format,
    cardPool,
    practiceMatchGameId: claim.practiceMatchGameId,
    matchId: claim.matchId,
    draftShareId,
    poolShareId,
    podShareId: claim.shareId,
    roundId: claim.roundId,
    gameNumber: claim.gameNumber,
    attemptNumber: claim.attemptNumber,
    callbackContext: callbackContextFor({ claim, draftShareId, poolShareId }),
  }
}

export function buildWayfinderPracticeJoinPayload({
  claim,
  draftShareId,
  poolShareId,
  deckUrl,
  format,
  cardPool,
}: WayfinderPracticePayloadOptions) {
  return {
    type: 'wayfinder:practice-join-game',
    openInNewTab: true,
    lobbyUrl: claim.lobbyUrl,
    deckUrl,
    format,
    cardPool,
    practiceMatchGameId: claim.practiceMatchGameId,
    matchId: claim.matchId,
    draftShareId,
    poolShareId,
    podShareId: claim.shareId,
    roundId: claim.roundId,
    gameNumber: claim.gameNumber,
    attemptNumber: claim.attemptNumber,
    callbackContext: callbackContextFor({ claim, draftShareId, poolShareId }),
  }
}

export function extractPracticeClaim(responseBody: unknown): PracticeGameClaimResult | null {
  if (!responseBody || typeof responseBody !== 'object') return null
  const body = responseBody as Record<string, unknown>
  const candidate = body.data && typeof body.data === 'object'
    ? body.data as Record<string, unknown>
    : body

  if (
    typeof candidate.action !== 'string' ||
    typeof candidate.matchId !== 'string' ||
    typeof candidate.shareId !== 'string'
  ) {
    return null
  }

  return candidate as unknown as PracticeGameClaimResult
}

export function useWayfinderPracticeLaunch({
  draftShareId,
  poolShareId,
  wayfinderDetected,
  cardPool,
  format = 'pool',
  deckUrl = null,
  onTrack,
  onMessage,
}: UseWayfinderPracticeLaunchOptions) {
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null)
  const [launchMessage, setLaunchMessage] = useState<PracticeLaunchMessage | null>(null)

  const setMessage = useCallback((matchId: string | null, text: string, type: PracticeLaunchMessageType) => {
    setLaunchMessage({ matchId, text, type })
    onMessage?.(text, type)
  }, [onMessage])

  const launchPracticeMatch = useCallback(async (matchId: string) => {
    if (!draftShareId || !poolShareId) {
      setMessage(matchId, 'This draft is missing live Swiss Practice context.', 'error')
      onTrack?.('swiss_practice_game_claim_failed', {
        target: 'wayfinder',
        success: false,
        matchId,
        failure_reason: 'missing_context',
      })
      return
    }

    if (!wayfinderDetected) {
      setMessage(matchId, 'Install Wayfinder to launch live Swiss Practice games.', 'error')
      onTrack?.('swiss_practice_game_claim_failed', {
        target: 'wayfinder',
        success: false,
        matchId,
        failure_reason: 'wayfinder_not_detected',
      })
      return
    }

    setPendingMatchId(matchId)
    setLaunchMessage(null)

    try {
      const response = await fetch(`/api/draft/${draftShareId}/match/${matchId}/game/claim`, {
        method: 'POST',
        credentials: 'include',
      })
      const responseBody = await response.json().catch(() => null)

      if (!response.ok) {
        const message = errorMessageFromBody(responseBody)
        throw new Error(message || CLAIM_ERROR_MESSAGE)
      }

      const claim = extractPracticeClaim(responseBody)
      if (!claim) throw new Error(CLAIM_ERROR_MESSAGE)

      onTrack?.('swiss_practice_game_claim', {
        target: 'wayfinder',
        matchId,
        claim_action: claim.action,
        practice_match_game_id: claim.practiceMatchGameId,
        game_number: claim.gameNumber,
        attempt_number: claim.attemptNumber,
        status: claim.status,
      })

      const resolvedDeckUrl = deckUrl || window.location.href
      const payloadOptions = {
        claim,
        draftShareId,
        poolShareId,
        deckUrl: resolvedDeckUrl,
        format,
        cardPool,
      }

      if (claim.action === 'create_lobby') {
        if (!claim.practiceMatchGameId) throw new Error(CLAIM_ERROR_MESSAGE)
        window.postMessage(buildWayfinderPracticeCreatePayload(payloadOptions), '*')
        setMessage(matchId, `Creating Game ${claim.gameNumber || ''} in Wayfinder...`.trim(), 'info')
        onTrack?.('swiss_practice_game_create_lobby', {
          target: 'wayfinder',
          matchId,
          practice_match_game_id: claim.practiceMatchGameId,
          game_number: claim.gameNumber,
        })
        return
      }

      if (claim.action === 'join_lobby') {
        if (!claim.lobbyUrl) {
          setMessage(matchId, 'The lobby is still being prepared.', 'info')
          return
        }
        window.postMessage(buildWayfinderPracticeJoinPayload(payloadOptions), '*')
        setMessage(matchId, 'Opening your game in Wayfinder...', 'info')
        onTrack?.('swiss_practice_game_join_lobby', {
          target: 'wayfinder',
          matchId,
          practice_match_game_id: claim.practiceMatchGameId,
          game_number: claim.gameNumber,
        })
        return
      }

      if (claim.action === 'wait_for_lobby') {
        setMessage(matchId, 'Waiting for your opponent to finish creating the lobby.', 'info')
        onTrack?.('swiss_practice_game_wait_for_lobby', {
          target: 'wayfinder',
          matchId,
          practice_match_game_id: claim.practiceMatchGameId,
          game_number: claim.gameNumber,
        })
        return
      }

      if (claim.action === 'already_complete') {
        setMessage(matchId, 'That match is already complete.', 'success')
        return
      }

      setMessage(matchId, 'Use manual reporting while this live game is being resolved.', 'info')
    } catch (error) {
      const text = error instanceof Error ? error.message : CLAIM_ERROR_MESSAGE
      setMessage(matchId, text, 'error')
      onTrack?.('swiss_practice_game_claim_failed', {
        target: 'wayfinder',
        success: false,
        matchId,
        failure_reason: text,
      })
    } finally {
      setPendingMatchId(null)
    }
  }, [cardPool, deckUrl, draftShareId, format, onTrack, poolShareId, setMessage, wayfinderDetected])

  return {
    pendingMatchId,
    launchMessage,
    clearLaunchMessage: () => setLaunchMessage(null),
    launchPracticeMatch,
  }
}

function callbackContextFor({
  claim,
  draftShareId,
  poolShareId,
}: {
  claim: PracticeGameClaimResult
  draftShareId: string
  poolShareId: string
}) {
  return {
    practiceMatchGameId: claim.practiceMatchGameId,
    matchId: claim.matchId,
    draftShareId,
    poolShareId,
    podShareId: claim.shareId,
    roundId: claim.roundId,
    gameNumber: claim.gameNumber,
    attemptNumber: claim.attemptNumber,
    lifecycleUrl: '/api/plugin/v1/practice/match-game/lifecycle',
    resultUrl: '/api/plugin/v1/match/result',
  }
}

function errorMessageFromBody(responseBody: unknown): string | null {
  if (!responseBody || typeof responseBody !== 'object') return null
  const body = responseBody as Record<string, unknown>
  if (typeof body.message === 'string' && body.message) return body.message
  if (body.data && typeof body.data === 'object') {
    const data = body.data as Record<string, unknown>
    if (typeof data.error === 'string' && data.error) return data.error
  }
  if (typeof body.error === 'string' && body.error) return body.error
  return null
}

export default useWayfinderPracticeLaunch
