// @ts-nocheck
// GET /api/sealed/history - Get sealed pods the user is in
import { queryRows } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = requireAuth(request)

    const pods = await queryRows(
      `SELECT
        dp.id,
        dp.share_id,
        dp.set_code,
        dp.set_name,
        dp.name as pod_name,
        dp.status,
        dp.current_players,
        dp.host_id,
        dp.created_at,
        dp.completed_at,
        cp.share_id as pool_share_id,
        cp.name as pool_name
       FROM pods dp
       JOIN pod_players dpp ON dp.id = dpp.pod_id
       LEFT JOIN card_pools cp ON cp.pod_id = dp.id AND cp.user_id = $1
       WHERE dpp.user_id = $1
         AND dp.pod_type = 'sealed'
       ORDER BY dp.created_at DESC
       LIMIT 20`,
      [session.id]
    )

    const formattedPods = pods.map(pod => ({
      id: pod.id,
      shareId: pod.share_id,
      setCode: pod.set_code,
      setName: pod.set_name,
      podName: pod.pod_name,
      status: pod.status,
      currentPlayers: pod.current_players,
      isHost: pod.host_id === session.id,
      createdAt: pod.created_at,
      completedAt: pod.completed_at,
      poolShareId: pod.pool_share_id,
      poolName: pod.pool_name,
    }))

    return jsonResponse({ pods: formattedPods })
  } catch (error) {
    return handleApiError(error)
  }
}
