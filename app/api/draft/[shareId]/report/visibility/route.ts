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

  // Find the draft pod (needed by every branch below).
  const pod = await queryRow(
    `SELECT id, host_id FROM pods WHERE share_id = $1 AND pod_type = 'draft'`,
    [shareId]
  )
  if (!pod) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  // Privileged Observer toggle (host only) — the public, no-login live slideshow
  // link for streaming. Independent of report visibility.
  if (typeof body.observerPublic === 'boolean') {
    if (session.id !== pod.host_id) {
      return NextResponse.json({ error: 'Only the draft host can change observer visibility' }, { status: 403 })
    }
    await query(`UPDATE pods SET observer_public = $1 WHERE id = $2`, [body.observerPublic, pod.id])
    return NextResponse.json({ success: true, observerPublic: body.observerPublic })
  }

  const { reportPublic, scope = 'player' } = body

  if (typeof reportPublic !== 'boolean') {
    return NextResponse.json({ error: 'reportPublic must be a boolean' }, { status: 400 })
  }

  if (!['player', 'draft'].includes(scope)) {
    return NextResponse.json({ error: 'scope must be player or draft' }, { status: 400 })
  }

  if (scope === 'draft') {
    if (session.id !== pod.host_id) {
      return NextResponse.json({ error: 'Only the draft host can change draft visibility' }, { status: 403 })
    }

    // Keep the draft's public surfaces in sync so the host can open or lock the
    // whole report at once. Locking the draft (reportPublic=false) also revokes
    // any active Privileged Observer link.
    await query(
      `UPDATE pods
       SET is_public = $1,
           is_log_public = $1,
           observer_public = (observer_public AND $1)
       WHERE id = $2`,
      [reportPublic, pod.id]
    )
    await query(
      `UPDATE pod_players
       SET is_log_public = $1
       WHERE pod_id = $2`,
      [reportPublic, pod.id]
    )
    const poolsResult = await query(
      `UPDATE card_pools
       SET is_public = $1,
           report_public = $1
       WHERE pod_id = $2`,
      [reportPublic, pod.id]
    )

    return NextResponse.json({
      success: true,
      reportPublic,
      scope,
      updatedPools: poolsResult.rowCount,
    })
  }

  // Update the user's pool report_public flag
  const result = await query(
    `UPDATE card_pools SET report_public = $1
     WHERE card_pools.pod_id = $2
       AND card_pools.user_id = $3`,
    [reportPublic, pod.id, session.id]
  )

  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'You are not a participant in this draft' }, { status: 403 })
  }

  return NextResponse.json({ success: true, reportPublic })
}
