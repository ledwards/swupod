// GET /api/stats/deck/:shareId/luck - ShareId-open pool luck without per-card streaks.
import { queryRow, queryRows } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { NextRequest, NextResponse } from 'next/server'
import {
  getExpectedPerPack,
  scaleExpected,
  RARITIES,
  ASPECT_CATEGORIES,
  type ExpectedRarity,
  type AspectCategory,
} from '@/src/services/expectedDistribution'
import {
  aggregateObserved,
  buildRarityPanel,
  buildAspectPanel,
  buildCardHits,
  buildDuplicates,
  getUuidToCardId,
  getCardMetaLookup,
  getDupIdentity,
  type GenerationRow,
} from '@/app/api/stats/me/luck/route'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

type DeckLuckScope = 'opened' | 'kept'

interface DeckLuckPoolRow {
  id: string
  user_id: string | null
  share_id: string
  set_code: string
  pool_type: string | null
  pod_id: string | null
}

function emptyRarity(): Record<ExpectedRarity, number> {
  const out: Record<string, number> = {}
  for (const rarity of RARITIES) out[rarity] = 0
  return out as Record<ExpectedRarity, number>
}

function emptyAspect(): Record<AspectCategory, number> {
  const out: Record<string, number> = {}
  for (const aspect of ASPECT_CATEGORIES) out[aspect] = 0
  return out as Record<AspectCategory, number>
}

function emptyDeckLuckResponse(setCode: string, scope: DeckLuckScope, poolType: string | null | undefined) {
  return {
    setCode,
    scope,
    poolType: poolType || 'sealed',
    packsCracked: 0,
    rarity: buildRarityPanel(emptyRarity(), emptyRarity(), 0),
    aspect: buildAspectPanel(emptyAspect(), emptyAspect(), 0),
    cardHits: [],
    duplicates: buildDuplicates([], setCode, getDupIdentity(setCode)),
  }
}

export function buildDeckLuckResponse({
  setCode,
  scope,
  poolType,
  rows,
}: {
  setCode: string
  scope: DeckLuckScope
  poolType?: string | null
  rows: GenerationRow[]
}) {
  const observed = aggregateObserved(rows)
  if (observed.packsCracked === 0) {
    return emptyDeckLuckResponse(setCode, scope, poolType)
  }

  const perPack = getExpectedPerPack(setCode)
  if (!perPack) {
    return emptyDeckLuckResponse(setCode, scope, poolType)
  }

  const CARDS_PER_PACK = 16
  const effectivePacks = Math.max(
    observed.packsCracked,
    Math.round(rows.length / CARDS_PER_PACK),
  )
  const expectedTotal = scaleExpected(perPack, effectivePacks)
  const rarityPanel = buildRarityPanel(observed.rarity, expectedTotal.rarity, effectivePacks)
  const aspectPanel = buildAspectPanel(observed.aspect, expectedTotal.aspect, effectivePacks)
  const uuidToCardId = getUuidToCardId(setCode)
  const observedByCardId = new Map<string, number>()
  for (const [uuid, count] of observed.perCard) {
    const cardId = uuidToCardId.get(uuid) ?? uuid
    observedByCardId.set(cardId, (observedByCardId.get(cardId) ?? 0) + count)
  }
  const cardHits = buildCardHits(observedByCardId, expectedTotal.cards, getCardMetaLookup(setCode))
  const duplicates = buildDuplicates(rows, setCode, getDupIdentity(setCode))

  // PRIVACY: this shareable endpoint intentionally omits the per-card
  // `streaks` and showcase fields from app/api/stats/me/luck.
  return {
    setCode,
    scope,
    poolType: poolType || 'sealed',
    packsCracked: effectivePacks,
    rarity: rarityPanel,
    aspect: aspectPanel,
    cardHits,
    duplicates,
  }
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse as unknown as NextResponse

    const { shareId } = await params
    const pool = await queryRow(
      `SELECT id, user_id, share_id, set_code, pool_type, pod_id
       FROM card_pools
       WHERE share_id = $1`,
      [shareId],
    )

    if (!pool) {
      return errorResponse('Pool not found', 404) as unknown as NextResponse
    }

    const poolRow = pool as unknown as DeckLuckPoolRow
    const isDraft = poolRow.pool_type === 'draft'
    const scope: DeckLuckScope = isDraft ? 'kept' : 'opened'
    let rows: GenerationRow[] = []

    if (isDraft) {
      if (poolRow.user_id && poolRow.pod_id) {
        rows = (await queryRows(
          `SELECT cg.card_id, cg.card_name, cg.rarity, cg.aspects, cg.pack_index, cg.source_id, cg.source_type
           FROM card_generations cg
           WHERE cg.source_type = 'draft'
             AND cg.source_id = $1
             AND cg.user_id = $2
             AND cg.set_code = $3
             AND cg.pack_type = 'booster'`,
          [poolRow.pod_id, poolRow.user_id, poolRow.set_code],
        )) as unknown as GenerationRow[]
      }
    } else {
      rows = (await queryRows(
        `SELECT cg.card_id, cg.card_name, cg.rarity, cg.aspects, cg.pack_index, cg.source_id, cg.source_type
         FROM card_generations cg
         WHERE cg.source_type = 'sealed'
           AND cg.source_id = $1
           AND cg.set_code = $2
           AND cg.pack_type = 'booster'`,
        [poolRow.id, poolRow.set_code],
      )) as unknown as GenerationRow[]
    }

    const response = jsonResponse(buildDeckLuckResponse({
      setCode: poolRow.set_code,
      scope,
      poolType: poolRow.pool_type,
      rows,
    }))
    response.headers.set('Cache-Control', 'public, max-age=60')
    return response as unknown as NextResponse
  } catch (error) {
    return handleApiError(error) as unknown as NextResponse
  }
}
