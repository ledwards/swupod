// @ts-nocheck
// GET /api/pods/public - List public pods waiting for players (no auth required)
import { queryRows } from '@/lib/db'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const rows = await queryRows(
      `SELECT dp.share_id, dp.pod_type, dp.set_code, dp.set_name, dp.name,
              dp.max_players, dp.current_players, dp.created_at,
              u.username as host_username, u.avatar_url as host_avatar
       FROM pods dp
       LEFT JOIN users u ON dp.host_id = u.id
       WHERE dp.is_public = true AND dp.status = 'waiting'
             AND dp.created_at > NOW() - INTERVAL '2 hours'
       ORDER BY dp.created_at DESC LIMIT 20`
    )

    const pods = rows.map(row => ({
      shareId: row.share_id,
      podType: row.pod_type || 'draft',
      setCode: row.set_code,
      setName: row.set_name,
      name: row.name,
      maxPlayers: row.max_players,
      currentPlayers: row.current_players,
      host: {
        username: row.host_username,
        avatarUrl: row.host_avatar,
      },
      createdAt: row.created_at,
    }))

    return jsonResponse({ pods })
  } catch (error) {
    return handleApiError(error)
  }
}
