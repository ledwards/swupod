// app/api/draft/[shareId]/report/visibility/route.ts
// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { query, queryRow } from '@/lib/db'
import { getSession } from '@/lib/auth'

type RouteContext = { params: Promise<{ shareId: string }> }

export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const session = getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { shareId } = await params
  const body = await request.json()
  const { reportPublic } = body

  if (typeof reportPublic !== 'boolean') {
    return NextResponse.json({ error: 'reportPublic must be a boolean' }, { status: 400 })
  }

  // Find the draft pod
  const pod = await queryRow(
    `SELECT id FROM pods WHERE share_id = $1 AND pod_type = 'draft'`,
    [shareId]
  )
  if (!pod) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  // Update the user's pool report_public flag
  const result = await query(
    `UPDATE card_pools SET report_public = $1
     FROM pod_players pp
     WHERE card_pools.pod_player_id = pp.id
       AND pp.pod_id = $2
       AND pp.user_id = $3`,
    [reportPublic, pod.id, session.id]
  )

  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'You are not a participant in this draft' }, { status: 403 })
  }

  return NextResponse.json({ success: true, reportPublic })
}
