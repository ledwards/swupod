// @ts-nocheck
// POST /api/draft/:shareId/start - Start the draft (host only)
import { query, queryRow, queryRows } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { generateDraftPacks, processBoxPacksForDraft } from '@/src/utils/draftLogic'
import { processBotTurns } from '@/src/utils/botLogic'
import { initializeCardCache } from '@/src/utils/cardCache'
import { trackBulkGenerations, PACK_SLOT_TYPES } from '@/src/utils/trackGeneration'
import { broadcastDraftState, broadcastSystemChatMessage } from '@/src/lib/socketBroadcast'
import { markPodStarted } from '@/lib/discordLfg'
import { jsonParse } from '@/src/utils/json'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  // console.log('[START] Starting draft...')
  try {
    const { shareId } = await params
    // console.log('[START] shareId:', shareId)
    const session = requireAuth(request)
    // console.log('[START] session:', session?.id)

    // Get draft pod
    const pod = await queryRow(
      'SELECT * FROM pods WHERE share_id = $1',
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    // Verify host
    if (pod.host_id !== session.id) {
      return errorResponse('Only the host can start the draft', 403)
    }

    // Verify status
    if (pod.status !== 'waiting') {
      return errorResponse('Draft has already started', 400)
    }

    // Get all players
    const players = await queryRows(
      'SELECT * FROM pod_players WHERE pod_id = $1 ORDER BY seat_number',
      [pod.id]
    )

    // Need at least 2 players to draft
    if (players.length < 2) {
      return errorResponse('Need at least 2 players to start', 400)
    }

    // Initialize card cache before generating packs
    await initializeCardCache()

    // Check for chaos draft settings
    const settings = pod.settings || {}

    // Pod mode needs 2+ humans; solo mode (entered from Solo button) allows 1 human + bots
    const humanCount = players.filter(p => !p.is_bot).length
    const isSoloDraft = settings.isSolo === true
    if (humanCount < 2 && !isSoloDraft) {
      return errorResponse('Pod mode requires at least 2 human players', 400)
    }
    const chaosSets = settings.draftMode === 'chaos' && settings.chaosSets
      ? settings.chaosSets
      : undefined
    const packsPerPlayer = chaosSets?.length || 3

    // Use pre-generated box_packs if available, otherwise generate on the fly (backward compatibility)
    let packs, leaders, originalPacks;
    const boxPacks = jsonParse(pod.box_packs);

    if (boxPacks && Array.isArray(boxPacks) && boxPacks.length > 0) {
      // Use pre-generated box packs
      // console.log('[START] Using pre-generated box packs for', players.length, 'players')
      const result = processBoxPacksForDraft(boxPacks, players.length, packsPerPlayer);
      packs = result.packs;
      leaders = result.leaders;
      originalPacks = result.originalPacks;
    } else {
      // Legacy: generate packs on the fly
      // console.log('[START] Generating packs for', players.length, 'players, set:', pod.set_code)
      const result = generateDraftPacks(pod.set_code, {
        playerCount: players.length,
        chaosSets
      });
      packs = result.packs;
      leaders = result.leaders;
      originalPacks = result.originalPacks;
    }
    // console.log('[START] Packs ready, leaders per player:', leaders[0]?.length)

    // Track all original 16-card packs for statistics (async, non-blocking)
    // Uses originalPacks which have full pack structure before leader/base extraction
    const trackingRecords = []
    originalPacks.forEach((playerPacks, playerIndex) => {
      playerPacks.forEach((packCards, packIndex) => {
        packCards.forEach((card, cardIndex) => {
          trackingRecords.push({
            card,
            options: {
              packType: 'booster',
              sourceType: 'draft',
              sourceId: pod.id,
              sourceShareId: shareId,
              packIndex: playerIndex * packsPerPlayer + packIndex,
              slotType: PACK_SLOT_TYPES[cardIndex] || null,
              userId: null // packs aren't attributed to a specific player at generation
            }
          })
        })
      })
    })
    trackBulkGenerations(trackingRecords).catch(err => {
      console.error('Failed to track draft pack generations:', err)
    })

    // Assign leaders and first pack to each player
    // Note: packs are objects { cards: [...] }, extract .cards for current_pack
    for (let i = 0; i < players.length; i++) {
      const player = players[i]
      const playerLeaders = leaders[i]
      const firstPack = packs[i][0] // First pack for drafting
      const firstPackCards = firstPack.cards || firstPack // Extract cards array

      await query(
        `UPDATE pod_players
         SET leaders = $1,
             current_pack = $2,
             pick_status = 'picking',
             drafted_leaders = '[]'
         WHERE id = $3`,
        [
          JSON.stringify(playerLeaders),
          JSON.stringify(firstPackCards),
          player.id
        ]
      )
    }

    // Update draft state
    const draftState = {
      phase: 'leader_draft',
      leaderRound: 1,
      packNumber: 0, // Will be 1 when leader draft completes
      pickInPack: 0,
      timerStartedAt: null,
    }

    // Store all packs in pod (for later rounds)
    await query(
      `UPDATE pods
       SET status = 'active',
           draft_state = $1,
           all_packs = $2,
           started_at = NOW(),
           pick_started_at = NOW(),
           paused_duration_seconds = 0,
           state_version = state_version + 1
       WHERE id = $3`,
      [
        JSON.stringify(draftState),
        JSON.stringify(packs),
        pod.id
      ]
    )

    // console.log('[START] Draft state updated, triggering bot turns')

    // Trigger bot picks in the background
    processBotTurns(pod.id).catch(err => {
      console.error('Error processing bot turns after start:', err)
    })

    // Broadcast state update to SSE clients
    broadcastDraftState(shareId).catch(err => {
      console.error('Error broadcasting draft state:', err)
    })

    // Broadcast start to web chat
    const podLabel = pod.name || `${pod.set_name} Draft`
    broadcastSystemChatMessage(shareId, `🚀 **${podLabel}** has started! Good luck everyone!`)

    // Discord LFG: mark pod as started (fire-and-forget)
    if (pod.is_public) {
      queryRows(
        `SELECT u.username FROM pod_players pp JOIN users u ON pp.user_id = u.id WHERE pp.pod_id = $1 AND pp.is_bot = false ORDER BY pp.seat_number`,
        [pod.id]
      ).then(async (namedPlayers) => {
        const hostUser = await queryRow('SELECT username FROM users WHERE id = $1', [pod.host_id])
        markPodStarted(
          { ...pod, current_players: players.length },
          hostUser?.username || 'Host',
          namedPlayers.map(p => p.username)
        ).catch(() => {})
      }).catch(() => {})
    }

    // console.log('[START] Returning success response')
    return jsonResponse({
      message: 'Draft started',
      phase: 'leader_draft',
      playerCount: players.length,
    })
  } catch (error) {
    console.error('[START] Error:', error)
    return handleApiError(error)
  }
}
