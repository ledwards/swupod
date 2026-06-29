import { NextRequest } from 'next/server'
import { requireServiceKey } from '@/lib/auth'
import { errorResponse, handleApiError, jsonResponse } from '@/lib/utils'
import { getPracticeSwissSummary } from '@/src/services/matchmaking/practiceSummary'

export async function GET(request: NextRequest): Promise<Response> {
  try {
    requireServiceKey(request)

    const url = new URL(request.url)
    const practiceMatchGameId = stringField(url.searchParams.get('practiceMatchGameId'))
    const poolShareId = stringField(url.searchParams.get('poolShareId'))

    if (!practiceMatchGameId || !poolShareId) {
      return errorResponse('practiceMatchGameId and poolShareId are required', 400)
    }

    const summary = await getPracticeSwissSummary({ practiceMatchGameId, poolShareId })
    return jsonResponse(summary)
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Service key not configured')) {
      return errorResponse('Unauthorized', 401)
    }

    return handleApiError(error)
  }
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}
