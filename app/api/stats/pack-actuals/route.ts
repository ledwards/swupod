// @ts-nocheck
// GET /api/stats/pack-actuals?setCode=LAW
//
// Live aggregate of production booster pulls for one set, shaped to line up with
// the precomputed theory artifact (src/data/packTheory.json) so the webpage can
// run the pack-fidelity comparison (src/services/packFidelity.ts) client-side.
//
// This is the cheap half of the comparison: a few GROUP BYs over card_generations.
// The expensive half — the theoretical distribution — is precomputed offline and
// committed, never simulated per request. Cached at the edge for 5 minutes.
import { queryRows } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { classifyAspect } from '@/src/services/expectedDistribution'
import { NextRequest, NextResponse } from 'next/server'

const SET_CODE_RE = /^[A-Z]{3}(?:-CB)?$/

function variantBucket(treatment: string | null, isShowcase: boolean): string | null {
  if (isShowcase) return 'showcase'
  const t = (treatment || '').toLowerCase()
  if (t.includes('prestige')) return 'prestige'
  if (t.includes('showcase')) return 'showcase'
  if (t.includes('hyperspace') && t.includes('foil')) return 'hyperspaceFoil'
  if (t.includes('hyperspace')) return 'hyperspace'
  if (t.includes('foil')) return 'foil'
  return null
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const setCode = (new URL(request.url).searchParams.get('setCode') || '').trim()
    if (!SET_CODE_RE.test(setCode)) {
      return errorResponse('Invalid or missing setCode', 400) as unknown as NextResponse
    }

    const [cnt, rarityRows, aspectRows, variantRows] = await Promise.all([
      queryRows(
        `SELECT COUNT(*)::int AS rows,
                COUNT(DISTINCT (source_id::text || '#' || COALESCE(pack_index::text,'x')))::int AS distinct_packs
         FROM card_generations WHERE set_code=$1 AND pack_type='booster'`,
        [setCode],
      ),
      queryRows(`SELECT rarity, COUNT(*)::int n FROM card_generations WHERE set_code=$1 AND pack_type='booster' GROUP BY rarity`, [setCode]),
      queryRows(`SELECT aspects, COUNT(*)::int n FROM card_generations WHERE set_code=$1 AND pack_type='booster' GROUP BY aspects`, [setCode]),
      queryRows(
        `SELECT treatment, COALESCE(is_showcase,false) AS is_showcase, COUNT(*)::int n
         FROM card_generations WHERE set_code=$1 AND pack_type='booster' GROUP BY treatment, is_showcase`,
        [setCode],
      ),
    ])

    const rowCount = cnt[0]?.rows ?? 0
    const packs = Math.max(cnt[0]?.distinct_packs || 0, Math.round(rowCount / 16))

    const rarity: Record<string, number> = {}
    for (const r of rarityRows) if (r.rarity) rarity[r.rarity] = r.n

    const aspect: Record<string, number> = {}
    for (const r of aspectRows) {
      const cat = classifyAspect({ aspects: r.aspects || [] })
      aspect[cat] = (aspect[cat] || 0) + r.n
    }

    const variant: Record<string, number> = {}
    for (const r of variantRows) {
      const b = variantBucket(r.treatment, r.is_showcase)
      if (b) variant[b] = (variant[b] || 0) + r.n
    }

    const response = jsonResponse({ setCode, packs, cards: rowCount, rarity, aspect, variant })
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return response as unknown as NextResponse
  } catch (error) {
    return handleApiError(error) as unknown as NextResponse
  }
}
