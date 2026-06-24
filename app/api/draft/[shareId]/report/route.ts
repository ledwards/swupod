// app/api/draft/[shareId]/report/route.ts
// @ts-nocheck
// Index endpoint — returns list of reports for this draft + the viewer's own pool share ID
import { NextRequest, NextResponse } from 'next/server'
import { query, queryRow } from '@/lib/db'
import { getSession } from '@/lib/auth'

type RouteContext = { params: Promise<{ shareId: string }> }

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const session = getSession(request)
  const { shareId } = await params

  const pod = await queryRow(
    `SELECT p.id, p.share_id, p.set_code, p.set_name, p.name, p.status,
            p.max_players, p.host_id, p.started_at, p.completed_at, p.settings,
            p.is_public, p.is_log_public
     FROM pods p WHERE p.share_id = $1 AND p.pod_type = 'draft'`,
    [shareId]
  )
  if (!pod) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  // Get all players with their pool share IDs and report visibility
  const result = await query(
    `SELECT pp.seat_number, pp.user_id, pp.is_bot, pp.is_log_public,
            u.username, u.avatar_url,
            cp.share_id as pool_share_id, cp.is_public, cp.report_public,
            cp.deck_builder_state
     FROM pod_players pp
     LEFT JOIN users u ON pp.user_id = u.id
     LEFT JOIN card_pools cp ON cp.pod_id = pp.pod_id AND cp.user_id = pp.user_id
     WHERE pp.pod_id = $1
     ORDER BY pp.seat_number`,
    [pod.id]
  )

  // A player has "built a deck" once their pool has a deck_builder_state with
  // card positions (the deck builder has been engaged). This matches how the
  // per-pool report route resolves leaders/bases from deck_builder_state.
  const hasBuiltDeck = (deckBuilderState: unknown): boolean => {
    if (!deckBuilderState) return false
    const dbs = typeof deckBuilderState === 'string' ? (() => { try { return JSON.parse(deckBuilderState) } catch { return null } })() : deckBuilderState
    return !!(dbs && dbs.cardPositions && Object.keys(dbs.cardPositions).length > 0)
  }

  // Find the viewer's own pool share ID (if they're in the draft)
  let myPoolShareId: string | null = null
  if (session) {
    const myRow = result.rows.find(r => r.user_id === session.id)
    if (myRow) {
      myPoolShareId = myRow.pool_share_id || null
    }
  }

  const reports = result.rows
    .filter(r => r.pool_share_id) // Only players with pools
    .map(r => ({
      seatNumber: r.seat_number,
      username: r.username || (r.is_bot ? `Bot (Seat ${r.seat_number})` : `Player ${r.seat_number}`),
      avatarUrl: r.avatar_url,
      isBot: r.is_bot,
      poolShareId: r.pool_share_id,
      isPublic: r.report_public || false,
      isMe: session?.id === r.user_id,
      hasBuiltDeck: hasBuiltDeck(r.deck_builder_state),
    }))

  // The draft report is only "ready" once at least one player has built a deck.
  const reportReady = reports.some(r => r.hasBuiltDeck)

  const isHost = session?.id === pod.host_id
  const poolRows = result.rows.filter(r => r.pool_share_id)
  const allPoolsPublic = poolRows.length > 0 && poolRows.every(r => r.is_public === true)
  const allReportsPublic = poolRows.length > 0 && poolRows.every(r => r.report_public === true)
  const allPlayerLogsPublic = result.rows.length > 0 && result.rows.every(r => r.is_log_public === true)
  const draftReportsPublic =
    pod.is_public === true &&
    pod.is_log_public === true &&
    allPoolsPublic &&
    allReportsPublic &&
    allPlayerLogsPublic

  return NextResponse.json({
    draft: {
      shareId: pod.share_id,
      name: pod.name,
      setCode: pod.set_code,
      setName: pod.set_name,
      status: pod.status,
      maxPlayers: pod.max_players,
      startedAt: pod.started_at,
      completedAt: pod.completed_at,
      competitive: pod.settings?.competitive || false,
    },
    reports,
    myPoolShareId,
    isHost,
    draftReportsPublic,
    reportReady,
  })
}
