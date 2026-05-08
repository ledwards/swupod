// @ts-nocheck
// GET /api/pools/:shareId/builds - List all builds for a root pool
import { queryRow, query } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { jsonParse } from '@/src/utils/json'
import { getAllCards } from '@/src/utils/cardData'
import { NextRequest, NextResponse } from 'next/server'

const SWUAPI_URL = process.env['SWUAPI_URL'] || 'https://api.swuapi.com'

let leaderUuidIndex: Map<string, string> | null = null
let baseUuidIndex: Map<string, string> | null = null

function buildIndexes() {
  if (leaderUuidIndex && baseUuidIndex) return
  leaderUuidIndex = new Map()
  baseUuidIndex = new Map()
  for (const card of getAllCards()) {
    if (!card.id || !card.set || card.number == null) continue
    const key = `${card.set}:${String(card.number)}`
    if (card.isLeader || card.type === 'Leader') {
      if (!leaderUuidIndex.has(key)) leaderUuidIndex.set(key, card.id)
    }
    if (card.isBase || card.type === 'Base') {
      if (!baseUuidIndex.has(key)) baseUuidIndex.set(key, card.id)
    }
  }
}

function resolveUuid(card: any, kind: 'leader' | 'base'): string | null {
  if (!card) return null
  if (typeof card.id === 'string' && card.id.includes('-')) return card.id
  buildIndexes()
  if (card.set && card.number != null) {
    const key = `${card.set}:${String(card.number)}`
    return (kind === 'leader' ? leaderUuidIndex : baseUuidIndex)?.get(key) || null
  }
  return null
}

interface RouteContext {
  params: Promise<{ shareId: string }>
}

function leaderShortName(name: string | null | undefined): string | null {
  if (!name) return null
  // SWU community refers to leaders by the first token of the card name
  // ("Lando Calrissian" → "Lando", "Vel Sartha" → "Vel"). This is wrong for
  // a few cases ("Mon Mothma" → "Mothma" in chatter) but matches archetype
  // nicknames returned by swuapi for the majority of leaders.
  return name.split(/\s+/)[0] || name
}

function extractBuildInfo(deckBuilderState: unknown) {
  const state = jsonParse(deckBuilderState) || {}
  const positions = state.cardPositions || {}
  const leaderKey = state.activeLeader || null
  const baseKey = state.activeBase || null
  const leaderCard = leaderKey ? positions[leaderKey]?.card : null
  const baseCard = baseKey ? positions[baseKey]?.card : null
  const deckCardCount = Object.values(positions).filter(
    (pos: any) => pos.section === 'deck' && pos.visible !== false && !pos.card?.isBase && !pos.card?.isLeader
  ).length
  return {
    leaderName: leaderCard?.name || null,
    leaderShortName: leaderShortName(leaderCard?.name),
    leaderAspects: leaderCard?.aspects || [],
    leaderUuid: resolveUuid(leaderCard, 'leader'),
    baseName: baseCard?.name || null,
    baseAspects: baseCard?.aspects || [],
    baseUuid: resolveUuid(baseCard, 'base'),
    deckCardCount,
  }
}

async function resolveArchetype(leaderUuid: string, baseUuid: string, cache: Map<string, string | null>): Promise<string | null> {
  const key = `${leaderUuid}:${baseUuid}`
  if (cache.has(key)) return cache.get(key)!
  try {
    const url = `${SWUAPI_URL}/archetypes/resolve?leader_card_uuid=${leaderUuid}&base_card_uuid=${baseUuid}&format=Limited`
    const res = await fetch(url)
    if (!res.ok) {
      cache.set(key, null)
      return null
    }
    const data = await res.json()
    const nickname = data?.nickname || null
    cache.set(key, nickname)
    return nickname
  } catch {
    cache.set(key, null)
    return null
  }
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params

    const root = await queryRow(
      `SELECT cp.id, cp.share_id, cp.user_id, cp.name, cp.deck_builder_state, cp.is_public,
              u.username AS owner_username
       FROM card_pools cp
       LEFT JOIN users u ON cp.user_id = u.id
       WHERE cp.share_id = $1`,
      [shareId]
    )

    if (!root) {
      return errorResponse('Pool not found', 404)
    }

    const children = await query(
      `SELECT cp.share_id, cp.deck_builder_state, cp.created_at, cp.user_id,
              u.username as builder_name
       FROM card_pools cp
       LEFT JOIN users u ON cp.user_id = u.id
       WHERE cp.parent_pool_id = $1
       ORDER BY cp.created_at ASC`,
      [root.id]
    )

    const rawEntries = [
      {
        shareId: root.share_id,
        builderName: root.owner_username || null,
        builderUserId: root.user_id || null,
        isOriginal: true,
        createdAt: null,
        ...extractBuildInfo(root.deck_builder_state),
      },
      ...children.rows.map(b => ({
        shareId: b.share_id,
        builderName: b.builder_name || null,
        builderUserId: b.user_id || null,
        isOriginal: false,
        createdAt: b.created_at,
        ...extractBuildInfo(b.deck_builder_state),
      })),
    ]

    const cache = new Map<string, string | null>()
    const builds = await Promise.all(rawEntries.map(async (e) => {
      const archetypeNickname = e.leaderUuid && e.baseUuid
        ? await resolveArchetype(e.leaderUuid, e.baseUuid, cache)
        : null
      const { leaderUuid, baseUuid, ...rest } = e
      return { ...rest, archetypeNickname }
    }))

    return jsonResponse({ builds })
  } catch (error) {
    return handleApiError(error)
  }
}
