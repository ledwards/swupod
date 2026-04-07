// app/api/draft/[shareId]/report/route.ts
// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { query, queryRow } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { reconstructDraftLog } from '@/src/utils/draftLogReconstruction'

type RouteContext = { params: Promise<{ shareId: string }> }

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const session = getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { shareId } = await params

  // Get the draft pod
  const pod = await queryRow(
    `SELECT p.id, p.share_id, p.set_code, p.set_name, p.name, p.status,
            p.max_players, p.current_players, p.host_id, p.started_at, p.completed_at,
            p.all_packs, p.settings, p.is_public
     FROM pods p WHERE p.share_id = $1 AND p.pod_type = 'draft'`,
    [shareId]
  )
  if (!pod) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  // Find the user's player record in this draft
  const myPlayer = await queryRow(
    `SELECT pp.id, pp.seat_number, pp.user_id, pp.drafted_leaders, pp.drafted_cards
     FROM pod_players pp WHERE pp.pod_id = $1 AND pp.user_id = $2`,
    [pod.id, session.id]
  )
  if (!myPlayer) {
    return NextResponse.json({ error: 'You are not a participant in this draft' }, { status: 403 })
  }

  // Get all players for seating display
  const playersResult = await query(
    `SELECT pp.seat_number, pp.user_id, pp.is_bot, pp.drafted_leaders, pp.drafted_cards,
            pp.strategy_name, pp.mixin_name,
            u.username, u.avatar_url
     FROM pod_players pp
     LEFT JOIN users u ON pp.user_id = u.id
     WHERE pp.pod_id = $1
     ORDER BY pp.seat_number`,
    [pod.id]
  )
  // Get each player's active leader from their deck builder state
  const poolsResult = await query(
    `SELECT cp.user_id, cp.deck_builder_state
     FROM card_pools cp
     WHERE cp.pod_id = $1`,
    [pod.id]
  )
  const activeLeaderByUser = new Map()
  for (const row of poolsResult.rows) {
    const dbs = typeof row.deck_builder_state === 'string' ? JSON.parse(row.deck_builder_state) : row.deck_builder_state
    if (dbs?.activeLeader && dbs?.cardPositions) {
      const leaderPos = dbs.cardPositions[dbs.activeLeader]
      if (leaderPos?.card?.name) {
        activeLeaderByUser.set(row.user_id, leaderPos.card.name)
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
    strategyName: row.strategy_name,
    mixinName: row.mixin_name,
  }))

  // Get user's draft picks (for Draft Log tab)
  const allPacks = pod.all_packs ? (typeof pod.all_packs === 'string' ? JSON.parse(pod.all_packs) : pod.all_packs) : null
  let picks: unknown[] = []
  if (allPacks) {
    try {
      picks = reconstructDraftLog({
        targetSeat: myPlayer.seat_number,
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

  // Get user's pool (for Pool + Deck tabs)
  const pool = await queryRow(
    `SELECT cp.id, cp.share_id, cp.cards, cp.packs, cp.deck_builder_state,
            cp.report_public, cp.pool_type, cp.created_at, cp.notes
     FROM card_pools cp
     WHERE cp.pod_id = $1 AND cp.user_id = $2
     ORDER BY cp.created_at DESC
     LIMIT 1`,
    [pod.id, session.id]
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
    mySeat: myPlayer.seat_number,
    picks,
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
