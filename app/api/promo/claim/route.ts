// POST /api/promo/claim — claim a GC promo Event Pack tier (Silver/Black) for the
// authenticated user.
//
// Rules (see docs/plans/2026-07-12-001-feat-gc-promo-packs-plan.md, U4):
//   - Silver: any logged-in account, inside the claim window.
//   - Black:  additionally requires Friend of the Pod (is_patron), read from the DB
//             at claim time — never trusted from the JWT. The grant then PERSISTS
//             even if the patron later lapses (the entitlement row is permanent).
//   - Idempotent: re-claiming is a no-op ("already owned"), so the shared QR link
//     can circulate freely without ever double-granting.
//   - The claim window is GC weekend only (Jul 24–26 2026 LA). Non-production may
//     force it open via PROMO_CLAIM_WINDOW_OVERRIDE=1 for local/e2e runs.
//
// On success it also returns a freshly drawn pack so the landing page can play the
// one-time gift-opening animation.
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryRow } from '@/lib/db'
import { jsonResponse, errorResponse, parseBody, handleApiError } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { getCampaign, isClaimAllowed, drawEventPack, type PromoTier } from '@/src/services/promoPacks'
import { getAllCards } from '@/src/utils/cardData'

const VALID_TIERS: readonly PromoTier[] = ['silver', 'black']

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse

    const session = requireAuth(request)

    let body: { campaign?: unknown; tier?: unknown }
    try {
      body = await parseBody(request)
    } catch {
      return errorResponse('Invalid request body', 400)
    }

    const campaignId = typeof body.campaign === 'string' ? body.campaign : ''
    const tierInput = typeof body.tier === 'string' ? body.tier : ''
    const campaign = getCampaign(campaignId)
    if (!campaign) return errorResponse('Unknown campaign', 400)
    if (!VALID_TIERS.includes(tierInput as PromoTier)) return errorResponse('Unknown tier', 400)
    const tier = tierInput as PromoTier

    // Claim window (server-enforced). Production never honors the override.
    const overrideOpen =
      process.env.NODE_ENV !== 'production' &&
      process.env['PROMO_CLAIM_WINDOW_OVERRIDE'] === '1'
    if (!isClaimAllowed(campaign, new Date(), { overrideOpen })) {
      return errorResponse('Claim window closed', 403)
    }

    // Black requires Friend of the Pod — read is_patron from the DB (source of truth),
    // not the JWT (which does not carry it and would be stale).
    if (tier === 'black') {
      const row = await queryRow('SELECT is_patron FROM users WHERE id = $1', [session.id])
      if (!row || row.is_patron !== true) {
        return errorResponse('Friend of the Pod required', 403)
      }
    }

    // Idempotent grant. RETURNING distinguishes a fresh grant from a re-claim.
    const inserted = await queryRow(
      `INSERT INTO promo_entitlements (user_id, campaign, promo_tier)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, campaign, promo_tier) DO NOTHING
       RETURNING id`,
      [session.id, campaign.id, tier]
    )
    const granted = inserted !== null

    // Draw a pack for the gift-opening moment (a fresh draw each open).
    const cardsById = new Map(getAllCards().map((c) => [c.id, c]))
    const pack = drawEventPack(campaign, tier, (id) => cardsById.get(id) ?? null)

    return jsonResponse({
      granted,
      alreadyOwned: !granted,
      campaign: campaign.id,
      tier,
      pack,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
