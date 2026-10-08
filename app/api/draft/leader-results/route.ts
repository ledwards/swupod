import { NextRequest } from 'next/server'
import { queryRow, queryRows } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { leaderDraftResults, type LeaderResultRow } from '@/src/services/leaderDraftResults'

export async function GET(request: NextRequest) {
  try {
    const draft = request.nextUrl.searchParams.get('draft')
    const pool = request.nextUrl.searchParams.get('pool')
    if (!draft && !pool) return errorResponse('Draft or pool is required', 400)
    // Resolve alternate deck builds through their source pool as well.
    const pod = draft
      ? await queryRow('SELECT id, share_id, host_id, status, is_log_public FROM pods WHERE share_id = $1', [draft])
      : await queryRow(`SELECT p.id, p.share_id, p.host_id, p.status, p.is_log_public
          FROM card_pools build
          JOIN card_pools source ON source.id = COALESCE(build.parent_pool_id, build.id)
          JOIN pods p ON p.id = source.pod_id
          WHERE build.share_id = $1 AND source.pool_type = 'draft'`, [pool])
    if (!pod || pod.status !== 'complete') return jsonResponse({ players: [] })
    const players = await queryRows(`SELECT pp.user_id, pp.seat_number, u.username,
        pp.is_bot, pp.is_log_public, pp.drafted_leaders
        FROM pod_players pp JOIN users u ON u.id = pp.user_id
        WHERE pp.pod_id = $1 ORDER BY pp.seat_number`, [pod.id])
    return jsonResponse({
      shareId: pod.share_id,
      players: leaderDraftResults(players as unknown as LeaderResultRow[], getSession(request)?.id, String(pod.host_id), !!pod.is_log_public),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
