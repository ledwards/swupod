import { NextRequest } from 'next/server'
import { errorResponse, handleApiError, jsonResponse, parseBody } from '@/lib/utils'
import { ptpPlayErrorResponse } from '@/src/services/play/apiErrors'
import {
  parseReportedResult,
  recordRuntimeCallbackResult,
} from '@/src/services/play/playLedger'
import { normalizeSeat, PtpPlayError } from '@/src/services/play/playState'

interface RuntimeResultBody {
  matchId?: unknown
  runtimeGameId?: unknown
  reportingSeat?: unknown
  result?: unknown
  replayUrl?: unknown
  idempotencyKey?: unknown
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    requireRuntimeCallbackKey(request)

    const body = await parseBody<RuntimeResultBody>(request)
    const reportingSeat = normalizeSeat(body.reportingSeat)
    if (!reportingSeat) {
      throw new PtpPlayError(400, 'invalid_reporting_seat', 'reportingSeat must be player1 or player2')
    }

    const result = await recordRuntimeCallbackResult({
      matchId: stringBodyField(body.matchId),
      runtimeGameId: stringBodyField(body.runtimeGameId),
      reportingSeat,
      reportedResult: parseReportedResult(body.result),
      replayUrl: stringBodyField(body.replayUrl),
      idempotencyKey: stringBodyField(body.idempotencyKey),
    })
    return jsonResponse(result)
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Runtime callback key not configured')) {
      return errorResponse('Unauthorized', 401)
    }
    return ptpPlayErrorResponse(error) ?? handleApiError(error)
  }
}

function requireRuntimeCallbackKey(request: Request): void {
  const callbackKey = process.env.FORCETEKI_RESULT_KEY
  if (!callbackKey) {
    throw new Error('Runtime callback key not configured')
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized')
  }

  if (authHeader.slice(7) !== callbackKey) {
    throw new Error('Unauthorized')
  }
}

function stringBodyField(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}
