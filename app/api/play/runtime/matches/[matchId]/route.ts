import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, jsonResponse } from '@/lib/utils'
import { ptpPlayErrorResponse } from '@/src/services/play/apiErrors'
import { getPlayRuntimeSession } from '@/src/services/play/playLedger'
import { PtpPlayError } from '@/src/services/play/playState'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
): Promise<Response> {
  try {
    const session = requireAuth(request)
    const { matchId } = await params
    const seatToken = request.nextUrl.searchParams.get('seatToken')?.trim()
    if (!seatToken) {
      throw new PtpPlayError(400, 'seat_token_required', 'seatToken is required')
    }

    const runtimeSession = await getPlayRuntimeSession({
      matchId,
      userId: session.id,
      seatToken,
    })
    return jsonResponse(runtimeSession)
  } catch (error) {
    return ptpPlayErrorResponse(error) ?? handleApiError(error)
  }
}
