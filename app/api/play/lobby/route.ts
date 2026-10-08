import { NextRequest } from 'next/server'
import { requireAlphaAccess } from '@/lib/auth'
import { handleApiError, jsonResponse } from '@/lib/utils'
import { ptpPlayErrorResponse } from '@/src/services/play/apiErrors'
import { getPlayLobby } from '@/src/services/play/playLedger'

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireAlphaAccess(request)
    const lobby = await getPlayLobby(session.id)
    return jsonResponse(lobby)
  } catch (error) {
    return ptpPlayErrorResponse(error) ?? handleApiError(error)
  }
}
