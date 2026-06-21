// app/api/draft/[shareId]/report/[poolShareId]/route.ts
// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { query, queryRow } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { reconstructDraftLog } from '@/src/utils/draftLogReconstruction'

type RouteContext = { params: Promise<{ shareId: string; poolShareId: string }> }

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const session = getSession(request)
  const { shareId, poolShareId } = await params

  // Get the draft pod
  const pod = await queryRow(
    `SELECT p.id, p.share_id, p.set_code, p.set_name, p.name, p.status,
            p.max_players, p.current_players, p.host_id, p.started_at, p.completed_at,
            p.all_packs, p.settings, p.is_public, p.is_log_public
     FROM pods p WHERE p.share_id = $1 AND p.pod_type = 'draft'`,
    [shareId]
  )
  if (!pod) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  // Look up the target pool by share_id
  const targetPool = await queryRow(
    `SELECT cp.user_id, cp.report_public
     FROM card_pools cp
     WHERE cp.share_id = $1 AND cp.pod_id = $2`,
    [poolShareId, pod.id]
  )
  if (!targetPool) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  const isOwner = session?.id === targetPool.user_id
  const isHost = session?.id === pod.host_id
  if (!isOwner && !isHost && !targetPool.report_public) {
    return NextResponse.json({ error: 'This report is private' }, { status: 403 })
  }

  const targetUserId = targetPool.user_id

  // Find the target player's record in this draft
  const targetPlayer = await queryRow(
    `SELECT pp.id, pp.seat_number, pp.user_id, pp.drafted_leaders, pp.drafted_cards
     FROM pod_players pp WHERE pp.pod_id = $1 AND pp.user_id = $2`,
    [pod.id, targetUserId]
  )
  if (!targetPlayer) {
    return NextResponse.json({ error: 'Player not found in this draft' }, { status: 404 })
  }

  // Get all players for seating display
  const playersResult = await query(
    `SELECT pp.seat_number, pp.user_id, pp.is_bot, pp.drafted_leaders, pp.drafted_cards,
            pp.strategy_name, pp.mixin_name, pp.is_log_public,
            u.username, u.avatar_url
     FROM pod_players pp
     LEFT JOIN users u ON pp.user_id = u.id
     WHERE pp.pod_id = $1
     ORDER BY pp.seat_number`,
    [pod.id]
  )

  // Get each player's active leader and base from deck builder state
  const poolsResult = await query(
    `SELECT cp.user_id, cp.deck_builder_state, cp.is_public, cp.report_public
     FROM card_pools cp
     WHERE cp.pod_id = $1`,
    [pod.id]
  )
  const allPoolsPublic = poolsResult.rows.length > 0 && poolsResult.rows.every(row => row.is_public === true)
  const allReportsPublic = poolsResult.rows.length > 0 && poolsResult.rows.every(row => row.report_public === true)
  const allPlayerLogsPublic = playersResult.rows.length > 0 && playersResult.rows.every(row => row.is_log_public === true)
  const draftReportsPublic =
    pod.is_public === true &&
    pod.is_log_public === true &&
    allPoolsPublic &&
    allReportsPublic &&
    allPlayerLogsPublic

  const activeLeaderByUser = new Map()
  const chosenBaseByUser = new Map()
  for (const row of poolsResult.rows) {
    const dbs = typeof row.deck_builder_state === 'string' ? JSON.parse(row.deck_builder_state) : row.deck_builder_state
    if (dbs?.cardPositions) {
      if (dbs.activeLeader) {
        const leaderPos = dbs.cardPositions[dbs.activeLeader]
        if (leaderPos?.card?.name) {
          activeLeaderByUser.set(row.user_id, leaderPos.card.name)
        }
      }
      if (dbs.activeBase) {
        const basePos = dbs.cardPositions[dbs.activeBase]
        if (basePos?.card) {
          chosenBaseByUser.set(row.user_id, {
            name: basePos.card.name || '',
            aspects: basePos.card.aspects || [],
            imageUrl: basePos.card.imageUrl || null,
            backImageUrl: basePos.card.backImageUrl || null,
          })
        }
      }
    }
  }

  const players = playersResult.rows.map(row => ({
    seatNumber: row.seat_number,
    userId: row.user_id,
    username: row.username || (row.is_bot ? `Bot (Seat ${row.seat_number})` : `Player ${row.seat_number}`),
    avatarUrl: row.avatar_url,
    isBot: row.is_bot,
    draftedLeaders: row.drafted_leaders ? (typeof row.drafted_leaders === 'string' ? JSON.parse(row.drafted_leaders) : row.drafted_leaders) : [],
    activeLeaderName: activeLeaderByUser.get(row.user_id) || null,
    chosenBase: chosenBaseByUser.get(row.user_id) || null,
    strategyName: row.strategy_name,
    mixinName: row.mixin_name,
  }))

  // Get target user's draft picks
  const allPacks = pod.all_packs ? (typeof pod.all_packs === 'string' ? JSON.parse(pod.all_packs) : pod.all_packs) : null
  let picks: unknown[] = []
  if (allPacks) {
    try {
      picks = reconstructDraftLog({
        targetSeat: targetPlayer.seat_number,
        totalSeats: pod.max_players,
        allPacks,
        players: playersResult.rows.map(r => ({
          odId: r.user_id,
          seatNumber: r.seat_number,
          draftedCards: r.drafted_cards ? (typeof r.drafted_cards === 'string' ? JSON.parse(r.drafted_cards) : r.drafted_cards) : [],
          draftedLeaders: r.drafted_leaders ? (typeof r.drafted_leaders === 'string' ? JSON.parse(r.drafted_leaders) : r.drafted_leaders) : [],
        })),
      })
    } catch (e) {
      console.error('Failed to reconstruct draft log for report:', e)
    }
  }

  // Get target user's pool
  const pool = await queryRow(
    `SELECT cp.id, cp.share_id, cp.cards, cp.packs, cp.deck_builder_state,
            cp.report_public, cp.pool_type, cp.created_at, cp.notes
     FROM card_pools cp
     WHERE cp.pod_id = $1 AND cp.user_id = $2
     ORDER BY cp.created_at DESC
     LIMIT 1`,
    [pod.id, targetUserId]
  )

  const matchesResult = await query(
    `SELECT pr.round_number,
            pm.id, pm.player1_id, pm.player2_id, pm.is_bye,
            pm.game1_result, pm.game2_result, pm.game3_result,
            pm.player1_submitted, pm.player2_submitted,
            pm.final_confirmed, pm.match_winner, pm.pod_owner_override,
            pm.wayfinder_match_id,
            u1.username AS p1_username, u1.avatar_url AS p1_avatar,
            u2.username AS p2_username, u2.avatar_url AS p2_avatar
     FROM practice_matches pm
     JOIN practice_rounds pr ON pr.id = pm.round_id
     LEFT JOIN users u1 ON u1.id = pm.player1_id
     LEFT JOIN users u2 ON u2.id = pm.player2_id
     WHERE pm.pod_id = $1
       AND (pm.player1_id = $2 OR pm.player2_id = $2)
       AND (
         pm.final_confirmed = true
         OR pm.wayfinder_match_id IS NOT NULL
         OR pm.game1_result IS NOT NULL
         OR pm.game2_result IS NOT NULL
         OR pm.game3_result IS NOT NULL
       )
     ORDER BY pr.round_number, pm.created_at`,
    [pod.id, targetUserId]
  )

  return NextResponse.json({
    draft: {
      shareId: pod.share_id,
      name: pod.name,
      setCode: pod.set_code,
      setName: pod.set_name,
      status: pod.status,
      maxPlayers: pod.max_players,
      currentPlayers: pod.current_players,
      isPublic: pod.is_public,
      startedAt: pod.started_at,
      completedAt: pod.completed_at,
      competitive: pod.settings?.competitive || false,
    },
    players,
    mySeat: targetPlayer.seat_number,
    isOwner,
    isHost,
    draftReportsPublic,
    picks,
    gameplay: {
      matches: matchesResult.rows.map(row => ({
        id: row.id,
        roundNumber: row.round_number,
        player1: row.player1_id ? {
          id: row.player1_id,
          username: row.p1_username || 'Player 1',
          avatarUrl: row.p1_avatar,
        } : null,
        player2: row.player2_id ? {
          id: row.player2_id,
          username: row.p2_username || 'Player 2',
          avatarUrl: row.p2_avatar,
        } : null,
        isBye: row.is_bye,
        game1Result: row.game1_result,
        game2Result: row.game2_result,
        game3Result: row.game3_result,
        player1Submitted: row.player1_submitted,
        player2Submitted: row.player2_submitted,
        finalConfirmed: row.final_confirmed,
        matchWinner: row.match_winner,
        podOwnerOverride: row.pod_owner_override,
        wayfinderMatchId: row.wayfinder_match_id || null,
      })),
    },
    pool: pool ? {
      shareId: pool.share_id,
      cards: typeof pool.cards === 'string' ? JSON.parse(pool.cards) : (pool.cards || []),
      packs: typeof pool.packs === 'string' ? JSON.parse(pool.packs) : (pool.packs || []),
      deckBuilderState: typeof pool.deck_builder_state === 'string' ? JSON.parse(pool.deck_builder_state) : pool.deck_builder_state,
      reportPublic: pool.report_public,
      createdAt: pool.created_at,
      notes: pool.notes || null,
    } : null,
  })
}
