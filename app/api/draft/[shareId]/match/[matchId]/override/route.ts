// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryRow, query } from '@/lib/db'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { deriveMatchWinner } from '@/src/services/matchmaking/results'
import { checkAndAdvanceRound } from '@/src/services/matchmaking/advancement'
import { jsonParse } from '@/src/utils/json'
import { captureLimitedServerEvent } from '@/lib/posthog'
import { LimitedAnalyticsEvents } from '@/src/analytics/limitedEvents'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shareId: string; matchId: string }> }
) {
  try {
    const session = requireAuth(request)
    const { shareId, matchId } = await params

    const pod = await queryRow(
      `SELECT id, host_id, share_id, set_code, settings FROM pods WHERE share_id = $1`,
      [shareId]
    )

    if (!pod) {
      return jsonResponse({ error: 'Pod not found' }, 404)
    }

    if (pod.host_id !== session.id) {
      return jsonResponse({ error: 'Only the pod owner can override match results' }, 403)
    }

    const match = await queryRow(
      `SELECT pr.round_number
       FROM practice_matches pm
       JOIN practice_rounds pr ON pm.round_id = pr.id
       WHERE pm.id = $1 AND pr.pod_id = $2`,
      [matchId, pod.id]
    )

    if (!match) {
      return jsonResponse({ error: 'Match not found' }, 404)
    }

    const body = await request.json()
    const { game1, game2, game3 } = body

    const winner = deriveMatchWinner(game1, game2, game3)

    await query(
      `UPDATE practice_matches
       SET game1_result = $2,
           game2_result = $3,
           game3_result = $4,
           match_winner = $5,
           final_confirmed = true,
           pod_owner_override = true
       WHERE id = $1`,
      [matchId, game1, game2, game3, winner]
    )

    await checkAndAdvanceRound(pod.id, shareId)

    const podSettings = jsonParse(pod.settings, {})
    captureLimitedServerEvent(
      LimitedAnalyticsEvents.LIMITED_MATCH_RESULT_REPORTED,
      session.id,
      {
        format: 'draft',
        mode: podSettings?.isSolo === true ? 'solo' : 'group',
        setCode: pod.set_code,
        round_number: match.round_number,
        matchId,
        podShareId: pod.share_id,
        result_source: 'host_override',
        final_confirmed: true,
      }
    )

    return jsonResponse({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
