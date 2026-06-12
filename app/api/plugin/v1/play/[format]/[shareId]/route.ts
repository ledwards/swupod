// app/api/plugin/v1/play/[format]/[shareId]/route.ts
// @ts-nocheck
// GET /api/plugin/v1/play/[format]/[shareId]
// Public endpoint called by Wayfinder extension on PTP play pages.
// Returns set code and card pool selection hint for the Karabast modal.
// Supported formats: pool, pack-wars, pack-blitz
import { queryRow } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { getLatestReleasedSetCode } from '@/src/utils/setConfigs/latest'
import { jsonParse } from '@/src/utils/json'
import { KARABAST_PUBLIC_LOBBY_NAME } from '@/src/utils/karabastLobby'
import { containsPlaceholderCards, describePlaceholderCards } from '@/src/services/cards/cardCatalogResolver'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ format: string; shareId: string }>
}

const FORMAT_QUERIES: Record<string, { table: string; shareIdCol: string; setCodeCol: string }> = {
  pool: { table: 'card_pools', shareIdCol: 'share_id', setCodeCol: 'set_code' },
  'pack-wars': { table: 'card_pools', shareIdCol: 'share_id', setCodeCol: 'set_code' },
  'pack-blitz': { table: 'card_pools', shareIdCol: 'share_id', setCodeCol: 'set_code' },
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { format, shareId } = await params

    const tableConfig = FORMAT_QUERIES[format]
    if (!tableConfig) {
      return errorResponse(`Unknown format: ${format}`, 400)
    }

    const row = await queryRow(
      `SELECT t.${tableConfig.setCodeCol} as set_code,
              t.cards,
              t.deck_builder_state,
              COALESCE(p.competitive, false) as competitive
       FROM ${tableConfig.table} t
       LEFT JOIN pods p ON t.pod_id = p.id
       WHERE t.${tableConfig.shareIdCol} = $1`,
      [shareId]
    )

    if (!row) {
      return errorResponse('Not found', 404)
    }

    const cards = jsonParse(row.cards, [])
    const deckBuilderState = jsonParse(row.deck_builder_state, {})
    const placeholderSource = deckBuilderState && Object.keys(deckBuilderState).length > 0 ? deckBuilderState : cards
    if (containsPlaceholderCards(placeholderSource)) {
      const examples = describePlaceholderCards(placeholderSource)
      return errorResponse(
        `This pool contains ASH spoiler placeholders and cannot be sent to play integrations yet${examples ? `: ${examples}` : ''}.`,
        400
      )
    }

    const setCode = row.set_code as string
    const latestSetCode = getLatestReleasedSetCode()
    const primarySetCode = setCode.includes(',')
      ? setCode.split(',').pop()!.trim()
      : setCode

    return jsonResponse({
      setCode,
      format,
      isLatestSet: primarySetCode === latestSetCode,
      cardPool: primarySetCode === latestSetCode ? 'Current' : 'Unlimited',
      competitive: row.competitive === true,
      lobbyName: KARABAST_PUBLIC_LOBBY_NAME,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
