// @ts-nocheck
/**
 * GET /api/pools/:shareId/deck.json - Export deck in SWUDB-compatible JSON format
 *
 * Returns the deck built from a pool in a format compatible with SWUDB, Karabast,
 * and other Star Wars Unlimited tools.
 *
 * This is a public endpoint - anyone with the shareId can access the deck.
 */
import { queryRow } from '@/lib/db'
import { errorResponse, handleApiError, formatSetCodeRange } from '@/lib/utils'
import { buildDeckFromState, DeckBuilderState, DeckEntry } from '@/lib/deckBuilder'
import { jsonParse } from '@/src/utils/json'
import { containsPlaceholderCards, describePlaceholderCards } from '@/src/services/cards/cardCatalogResolver'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

interface ExportData {
  metadata: {
    name: string
    author: string
  }
  leader: DeckEntry | null
  secondleader: DeckEntry | null
  base: DeckEntry | null
  deck: DeckEntry[]
  sideboard: DeckEntry[]
}

// CORS headers — external tools (Karabast, SWUDB) need these on every response,
// including error paths (404/400/500). The redirect from http://www.protectthepod.com
// happens at Railway's edge layer and cannot carry these headers — callers should
// fetch https://www.protectthepod.com directly.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
}

// Handle CORS preflight requests so external tools (Karabast, SWUDB) can fetch deck JSON
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  })
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params

    // Query pool - only need deck_builder_state, set_code, name, and pool_type
    const pool = await queryRow(
      `SELECT
        cp.share_id,
        cp.set_code,
        cp.pool_type,
        cp.name,
        cp.deck_builder_state
       FROM card_pools cp
       WHERE cp.share_id = $1`,
      [shareId]
    )

    if (!pool) {
      return withCors(errorResponse('Pool not found', 404))
    }

    const deckBuilderState: DeckBuilderState = jsonParse(pool.deck_builder_state, {})

    // Check if deck has been built (has activeLeader or activeBase)
    if (!deckBuilderState.activeLeader && !deckBuilderState.activeBase) {
      return withCors(errorResponse('No deck has been built for this pool yet', 400))
    }

    if (containsPlaceholderCards(deckBuilderState)) {
      const examples = describePlaceholderCards(deckBuilderState)
      return errorResponse(
        `This deck contains ASH spoiler placeholders and cannot be exported yet${examples ? `: ${examples}` : ''}.`,
        400
      )
    }

    const setCode = pool.set_code || ''
    const poolType = pool.pool_type || 'sealed'
    const formatType = poolType === 'draft' ? 'Draft' :
      poolType === 'rotisserie' ? 'Rotisserie Draft' : 'Sealed'

    // Generate display name
    let poolName = deckBuilderState.poolName || pool.name
    if (!poolName) {
      const setCodes = setCode.includes(',') ? setCode.split(',').map((s: string) => s.trim()) : [setCode]
      const setCodeDisplay = formatSetCodeRange(setCodes)
      poolName = `${setCodeDisplay} ${formatType}`
    }

    // Build deck data
    const deckData = buildDeckFromState(deckBuilderState, setCode)

    // Build export format (SWUDB has 80 char limit on metadata.name)
    const metadataName = `[PTP] ${poolName}`.slice(0, 80)
    const exportData: ExportData = {
      metadata: {
        name: metadataName,
        author: 'Protect the Pod',
      },
      leader: deckData.leader,
      secondleader: null,
      base: deckData.base,
      deck: deckData.deck,
      sideboard: deckData.sideboard,
    }

    // Return with .json content type and CORS headers for external tool access
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        ...CORS_HEADERS,
      },
    })
  } catch (error) {
    return withCors(handleApiError(error))
  }
}
