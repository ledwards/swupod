// @ts-nocheck
/**
 * GET /api/public/pack-quality - Public pack quality metrics
 *
 * Returns statistical validation that our pack generation matches
 * real-world collation rules. Designed for public transparency.
 *
 * Query params:
 *   - setCode: Set code (SOR, SHD, TWI, JTL, LOF, SEC, LAW)
 *   - all: If "true", returns summary for all sets
 */
import { jsonResponse, handleApiError } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { statCacheGet, statCacheSet } from '@/lib/statCache'
import { getPackQualityData, getAvailableSets } from '@/src/services/packQualityService'
import { getAllSetCodes } from '@/src/utils/setConfigs/index'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Rate limit check
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse as unknown as NextResponse

    const url = new URL(request.url)
    const setCode = url.searchParams.get('setCode')
    const all = url.searchParams.get('all') === 'true'
    // Default to 2026-02-12 when position-based slot_type tracking was deployed.
    // Earlier data used rarity-based inference which misclassified UC3→Rare upgrades
    // as 'rare_legendary', corrupting legendary rate and slot composition metrics.
    const since = url.searchParams.get('since') || '2026-02-12'

    // If requesting all sets summary
    if (all) {
      const sets = await getAvailableSets()
      return jsonResponse({
        sets,
        generatedAt: new Date().toISOString(),
      })
    }

    // If no set code provided, return available sets
    if (!setCode) {
      const sets = await getAvailableSets()
      return jsonResponse({
        message: 'Specify a setCode query parameter to get pack quality metrics',
        availableSets: sets,
        example: '/api/public/pack-quality?setCode=SOR',
      })
    }

    // Validate set code (from the config registry, so new/pre-release sets like ASH are included)
    const validSets = getAllSetCodes()
    const normalizedSetCode = setCode.toUpperCase()
    if (!validSets.includes(normalizedSetCode)) {
      return jsonResponse({
        error: 'Invalid set code',
        validSets,
      }, 400)
    }

    // Heavy aggregate (37+ DB queries) that changes slowly — served from a shared
    // in-process cache when warm; only the first request per TTL recomputes it.
    const cacheKey = `pack-quality:${normalizedSetCode}:${since}`
    let data = statCacheGet(cacheKey)
    if (!data) {
      data = await getPackQualityData(normalizedSetCode, since)
      statCacheSet(cacheKey, data)
    }
    const response = jsonResponse(data)
    response.headers.set('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600')
    return response
  } catch (error) {
    console.error('Error fetching pack quality data:', error)
    return handleApiError(error)
  }
}
