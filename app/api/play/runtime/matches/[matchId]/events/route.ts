import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, jsonResponse, parseBody } from '@/lib/utils'
import { ptpPlayErrorResponse } from '@/src/services/play/apiErrors'
import { recordRuntimeEvent } from '@/src/services/play/playLedger'
import { PtpPlayError } from '@/src/services/play/playState'

interface EventBody {
  seatToken?: unknown
  eventType?: unknown
  payload?: unknown
  idempotencyKey?: unknown
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
): Promise<Response> {
  try {
    const session = requireAuth(request)
    const { matchId } = await params
    const body = await parseBody<EventBody>(request)
    const seatToken = typeof body.seatToken === 'string' ? body.seatToken.trim() : ''
    const eventType = typeof body.eventType === 'string' ? body.eventType.trim() : ''

    if (!seatToken) {
      throw new PtpPlayError(400, 'seat_token_required', 'seatToken is required')
    }
    if (!eventType) {
      throw new PtpPlayError(400, 'event_type_required', 'eventType is required')
    }

    const result = await recordRuntimeEvent({
      matchId,
      userId: session.id,
      seatToken,
      eventType,
      payload: body.payload ?? {},
      idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null,
    })
    return jsonResponse(result)
  } catch (error) {
    return ptpPlayErrorResponse(error) ?? handleApiError(error)
  }
}
