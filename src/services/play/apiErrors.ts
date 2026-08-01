import { jsonResponse } from '@/lib/utils'
import { PtpPlayError } from './playState'

export function ptpPlayErrorResponse(error: unknown): Response | null {
  if (error instanceof PtpPlayError) {
    return jsonResponse({ error: error.message, code: error.code }, error.status)
  }
  return null
}
