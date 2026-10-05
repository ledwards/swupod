import {requireAlphaAccess} from '@/lib/auth'
import {betaExperienceEnabled} from '@/src/services/entry/rollout'

// Presentation follows the shared rollout switch and alpha membership, without consulting engine health
// or deck eligibility. Keep the existing table when privileges cannot be verified.
export async function GET(request: Request) {
  let enabled = false
  if (betaExperienceEnabled()) {
    try {
      await requireAlphaAccess(request)
      enabled = true
    } catch { /* Anonymous, non-alpha and stale sessions retain the existing table. */ }
  }
  return Response.json({enabled}, {headers: {'Cache-Control': 'private, no-store'}})
}
