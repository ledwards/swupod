// @ts-nocheck
// POST /api/sealed - Create a new sealed pod
import { query, queryRow } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { generateShareId } from '@/lib/utils'
import { jsonResponse, parseBody, validateRequired, handleApiError } from '@/lib/utils'
import { getSetConfig } from '@/src/utils/setConfigs/index'
import { getUnavailableSetReason } from '@/src/utils/setAvailability'
import { broadcastPublicPodsUpdate } from '@/src/lib/socketBroadcast'
import { postPodCreated } from '@/lib/discordLfg'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = requireAuth(request)
    const body = await parseBody(request)
    validateRequired(body, ['setCode'])

    const { setCode, isPublic } = body
    const unavailableReason = getUnavailableSetReason(setCode, session)
    if (unavailableReason) {
      return jsonResponse({ error: unavailableReason }, 403)
    }

    // Default to public unless explicitly set to false
    const podIsPublic = isPublic !== undefined ? isPublic === true : true

    const setConfig = getSetConfig(setCode)
    const setName = setConfig?.setName || setCode

    // Generate share ID with retry logic
    let shareId = generateShareId(8)
    let attempts = 0
    const maxAttempts = 10
    let result

    while (attempts < maxAttempts) {
      try {
        result = await query(
          `INSERT INTO pods (
            share_id,
            host_id,
            set_code,
            set_name,
            name,
            status,
            max_players,
            current_players,
            timer_enabled,
            timer_seconds,
            settings,
            draft_state,
            state_version,
            pod_type,
            is_public
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING id, share_id, created_at`,
          [
            shareId,
            session.id,
            setCode,
            setName,
            `${setName} Sealed`,
            'waiting',
            Math.min(16, Math.max(2, body.maxPlayers || 8)),  // max_players for sealed pods
            1,        // Host counts as first player
            false,    // no timer for sealed
            0,
            JSON.stringify({}),
            JSON.stringify({ phase: 'lobby' }),
            1,
            'sealed',
            podIsPublic
          ]
        )
        break
      } catch (error) {
        if (error.message.includes('duplicate key') || error.code === '23505') {
          shareId = generateShareId(8)
          attempts++
          continue
        }
        throw error
      }
    }

    if (attempts >= maxAttempts) {
      throw new Error('Failed to generate unique share ID')
    }

    const pod = result.rows[0]

    // Add host as first player
    await query(
      `INSERT INTO pod_players (
        pod_id,
        user_id,
        seat_number,
        pick_status,
        drafted_cards,
        leaders,
        drafted_leaders
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        pod.id,
        session.id,
        1,
        'waiting',
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([])
      ]
    )

    // Broadcast to multiplayer page if pod is public
    if (podIsPublic) {
      broadcastPublicPodsUpdate().catch(err => {
        console.error('Error broadcasting public pods update:', err)
      })
    }

    const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const shareUrl = `${APP_URL}/sealed/${shareId}`

    // Post to Discord LFG channel if public
    if (podIsPublic) {
      postPodCreated(
        { id: pod.id, share_id: shareId, set_code: setCode, set_name: setName, name: `${setName} Sealed`, max_players: Math.min(16, Math.max(2, body.maxPlayers || 8)), current_players: 1, pod_type: 'sealed' },
        session.username
      ).catch(err => {
        console.error('Error posting sealed pod to Discord:', err)
      })
    }

    return jsonResponse({
      id: pod.id,
      shareId: pod.share_id,
      shareUrl,
      createdAt: pod.created_at,
    }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
