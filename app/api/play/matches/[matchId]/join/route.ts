import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, jsonResponse } from '@/lib/utils'
import { ptpPlayErrorResponse } from '@/src/services/play/apiErrors'
import { claimPlaySeat } from '@/src/services/play/playLedger'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
): Promise<Response> {
  try {
    const session = requireAuth(request)
    const { matchId } = await params
    const result = await claimPlaySeat({ matchId, userId: session.id })
    return jsonResponse(result)
  } catch (error) {
    return ptpPlayErrorResponse(error) ?? handleApiError(error)
  }
}
