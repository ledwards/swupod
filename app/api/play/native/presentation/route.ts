import {requireBetaAccess} from '@/lib/auth'
import {localPracticeEnabled} from '@/src/services/play/native/localPractice'

// Presentation follows the current solo AI rollout, without consulting engine health
// or deck eligibility. Keep the existing table when privileges cannot be verified.
export async function GET(request: Request) {
  let enabled = false
  if (process.env.PTP_NATIVE_PLAY_ENABLED === 'true' && localPracticeEnabled()) {
    try {
      await requireBetaAccess(request)
      enabled = true
    } catch { /* Anonymous, non-beta and stale sessions retain the existing table. */ }
  }
  return Response.json({enabled}, {headers: {'Cache-Control': 'private, no-store'}})
}
