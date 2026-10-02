import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, jsonResponse, parseBody } from '@/lib/utils'
import { ptpPlayErrorResponse } from '@/src/services/play/apiErrors'
import { enterLimitedQueue, getPlayLobby } from '@/src/services/play/playLedger'
import { PtpPlayError } from '@/src/services/play/playState'

interface EnterQueueBody {
  poolShareId?: unknown
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = requireAuth(request)
    const body = await parseBody<EnterQueueBody>(request)
    const poolShareId = typeof body.poolShareId === 'string' ? body.poolShareId.trim() : ''
    if (!poolShareId) {
      throw new PtpPlayError(400, 'pool_share_id_required', 'poolShareId is required')
    }

    const result = await enterLimitedQueue({ userId: session.id, poolShareId })
    const lobby = await getPlayLobby(session.id)
    return jsonResponse({ ...result, lobby })
  } catch (error) {
    return ptpPlayErrorResponse(error) ?? handleApiError(error)
  }
}
