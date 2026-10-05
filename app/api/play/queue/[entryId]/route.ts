import { NextRequest } from 'next/server'
import { requireAlphaAccess } from '@/lib/auth'
import { handleApiError, jsonResponse } from '@/lib/utils'
import { ptpPlayErrorResponse } from '@/src/services/play/apiErrors'
import { cancelQueueEntry, getPlayLobby } from '@/src/services/play/playLedger'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
): Promise<Response> {
  try {
    const session = await requireAlphaAccess(request)
    const { entryId } = await params
    const result = await cancelQueueEntry({ userId: session.id, entryId })
    const lobby = await getPlayLobby(session.id)
    return jsonResponse({ ...result, lobby })
  } catch (error) {
    return ptpPlayErrorResponse(error) ?? handleApiError(error)
  }
}
