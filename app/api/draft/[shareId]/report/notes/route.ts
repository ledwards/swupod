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

  const pod = await queryRow(
    `SELECT id, host_id FROM pods WHERE share_id = $1 AND pod_type = 'draft'`,
    [shareId]
  )
  if (!pod) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  const body = await request.json()
  const notes = typeof body.notes === 'string' ? body.notes : ''
  const poolShareId = typeof body.poolShareId === 'string' ? body.poolShareId : null

  const pool = await queryRow(
    poolShareId
      ? `SELECT id, user_id FROM card_pools WHERE pod_id = $1 AND share_id = $2`
      : `SELECT id, user_id FROM card_pools WHERE pod_id = $1 AND user_id = $2`,
    [pod.id, poolShareId || session.id]
  )
  if (!pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }

  if (pool.user_id !== session.id && pod.host_id !== session.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  await query(
    `UPDATE card_pools SET notes = $1, updated_at = NOW() WHERE id = $2`,
    [notes || null, pool.id]
  )

  return NextResponse.json({ success: true })
}
