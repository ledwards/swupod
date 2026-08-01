import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, jsonResponse, parseBody } from '@/lib/utils'
import { ptpPlayErrorResponse } from '@/src/services/play/apiErrors'
import { parseReportedResult, recordPlayResult } from '@/src/services/play/playLedger'
import { PtpPlayError } from '@/src/services/play/playState'

interface ResultBody {
  seatToken?: unknown
  result?: unknown
  idempotencyKey?: unknown
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
): Promise<Response> {
  try {
    const session = requireAuth(request)
    const { matchId } = await params
    const body = await parseBody<ResultBody>(request)
    const seatToken = typeof body.seatToken === 'string' ? body.seatToken.trim() : ''
    if (!seatToken) {
      throw new PtpPlayError(400, 'seat_token_required', 'seatToken is required')
    }

    const result = await recordPlayResult({
      matchId,
      userId: session.id,
      seatToken,
      reportedResult: parseReportedResult(body.result),
      idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null,
    })
    return jsonResponse(result)
  } catch (error) {
    return ptpPlayErrorResponse(error) ?? handleApiError(error)
  }
}
