import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, jsonResponse } from '@/lib/utils'
import { ptpPlayErrorResponse } from '@/src/services/play/apiErrors'
import { getPlayReplay } from '@/src/services/play/playLedger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
): Promise<Response> {
  try {
    const session = requireAuth(request)
    const { matchId } = await params
    const replay = await getPlayReplay({ matchId, userId: session.id })
    return jsonResponse(replay)
  } catch (error) {
    return ptpPlayErrorResponse(error) ?? handleApiError(error)
  }
}
