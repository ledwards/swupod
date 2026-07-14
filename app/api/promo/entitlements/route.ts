// GET /api/promo/entitlements?campaign=gc2026 — the promo tiers the current user owns.
//
// Anonymous callers get an all-false result (not a 401) so the Promo Packs UI can render
// its locked/tease state without special-casing auth. Reads the permanent grants written
// by /api/promo/claim.
import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { queryRows } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { getCampaign } from '@/src/services/promoPacks'

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const campaignId = new URL(request.url).searchParams.get('campaign') || ''
    const campaign = getCampaign(campaignId)
    if (!campaign) return errorResponse('Unknown campaign', 400)

    const session = getSession(request)
    if (!session) {
      return jsonResponse({ campaign: campaign.id, silver: false, black: false })
    }

    const rows = await queryRows(
      'SELECT promo_tier FROM promo_entitlements WHERE user_id = $1 AND campaign = $2',
      [session.id, campaign.id]
    )
    const owned = new Set(rows.map((r) => r.promo_tier))

    return jsonResponse({
      campaign: campaign.id,
      silver: owned.has('silver'),
      black: owned.has('black'),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
