// app/api/draft/reports/route.ts
// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const result = await query(
    `SELECT p.share_id as "draftShareId", p.name, p.set_code as "setCode",
            p.set_name as "setName", p.max_players as "maxPlayers",
            p.completed_at as "completedAt", p.started_at as "startedAt",
            p.settings,
            pp.seat_number as "seatNumber",
            pp.drafted_leaders as "draftedLeaders",
            cp.deck_builder_state as "deckBuilderState",
            cp.cards as "poolCards"
     FROM pods p
     JOIN pod_players pp ON pp.pod_id = p.id
     LEFT JOIN card_pools cp ON cp.pod_id = pp.pod_id AND cp.user_id = pp.user_id
     WHERE pp.user_id = $1
       AND p.pod_type = 'draft'
       AND p.status = 'complete'
     ORDER BY p.completed_at DESC NULLS LAST
     LIMIT 50`,
    [session.id]
  )

  const reports = result.rows.map(row => {
    const leaders = row.draftedLeaders
      ? (typeof row.draftedLeaders === 'string' ? JSON.parse(row.draftedLeaders) : row.draftedLeaders)
      : []

    // Get base info from deck builder state
    let baseName = null
    let baseAspects = null
    const deckState = row.deckBuilderState
      ? (typeof row.deckBuilderState === 'string' ? JSON.parse(row.deckBuilderState) : row.deckBuilderState)
      : null
    if (deckState?.activeBase) {
      const cards = row.poolCards
        ? (typeof row.poolCards === 'string' ? JSON.parse(row.poolCards) : row.poolCards)
        : []
      const baseCard = cards.find(c => (c.instanceId || c.id) === deckState.activeBase)
      if (baseCard) {
        baseName = baseCard.name || null
        baseAspects = baseCard.aspects || null
      }
    }

    return {
      draftShareId: row.draftShareId,
      name: row.name,
      setCode: row.setCode,
      setName: row.setName,
      maxPlayers: row.maxPlayers,
      completedAt: row.completedAt,
      startedAt: row.startedAt,
      competitive: row.settings?.competitive || false,
      seatNumber: row.seatNumber,
      leaderName: leaders[0]?.name || null,
      leaderBackImageUrl: leaders[0]?.backImageUrl || leaders[0]?.imageUrl || null,
      baseName,
      baseAspects,
    }
  })

  return NextResponse.json({ reports })
}
