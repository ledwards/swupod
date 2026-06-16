// @ts-nocheck
// GET /api/me/pool-history - grouped pool + deck build history for /me.
import { queryRows } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, handleApiError, formatSetCodeRange } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { getAspectColor } from '@/src/utils/aspectColors'
import { archetypeShortName, poolDisplayName } from '@/src/utils/archetypeName'
import { NextRequest, NextResponse } from 'next/server'

interface DeckPreview {
  leaderName: string | null
  leaderShortName: string | null
  baseName: string | null
  baseAspects: string[]
  baseHp: number | null
  leaderImageUrl: string | null
  baseImageUrl: string | null
  baseColor: string | null
  mainDeckCount: number
  poolName: string | null
}

function parseDeckBuilderState(raw: unknown): Record<string, any> {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {}
    } catch {
      return {}
    }
  }
  return typeof raw === 'object' ? raw as Record<string, any> : {}
}

function cardName(card: any): string | null {
  return card?.name || card?.title || null
}

function extractDeckPreview(raw: unknown): DeckPreview {
  const state = parseDeckBuilderState(raw)
  const positions = state.cardPositions || {}
  const leaderCard = state.activeLeader ? positions[state.activeLeader]?.card : null
  const baseCard = state.activeBase ? positions[state.activeBase]?.card : null
  const mainDeckCount = Object.values(positions).filter((pos: any) =>
    pos?.section === 'deck' &&
    pos?.enabled !== false &&
    pos?.visible !== false &&
    !pos?.card?.isLeader &&
    !pos?.card?.isBase
  ).length

  const leaderName = cardName(leaderCard)
  return {
    leaderName,
    leaderShortName: leaderName ? leaderName.split(/[\s,]/)[0] || null : null,
    baseName: cardName(baseCard),
    baseAspects: Array.isArray(baseCard?.aspects) ? baseCard.aspects : [],
    baseHp: typeof baseCard?.hp === 'number' ? baseCard.hp : null,
    leaderImageUrl: leaderCard?.imageUrl || leaderCard?.artUrl || null,
    baseImageUrl: baseCard?.imageUrl || baseCard?.artUrl || null,
    baseColor: baseCard ? getAspectColor(baseCard) : null,
    mainDeckCount,
    poolName: state.poolName || null,
  }
}

function titleCaseFormat(format: string): string {
  switch (format) {
    case 'draft':
      return 'Draft'
    case 'sealed':
      return 'Sealed'
    case 'chaos_sealed':
      return 'Chaos Sealed'
    case 'pack_blitz':
      return 'Pack Blitz'
    case 'pack_wars':
      return 'Pack Wars'
    case 'rotisserie':
      return 'Rotisserie'
    default:
      return format
        .split(/[_-]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ') || 'Pool'
  }
}

// A pool is not a game — never surface a match-style stored name ("X vs Y").
function looksLikeMatch(name: string | null | undefined): boolean {
  return !!name && /\bvs\.?\b/i.test(name)
}

function fallbackPoolName(row: any, preview: DeckPreview): string {
  if (preview.poolName && !looksLikeMatch(preview.poolName)) return preview.poolName
  if (row.name && !looksLikeMatch(row.name)) return row.name

  const setCode = row.set_code || ''
  const setCodes = setCode.includes(',') ? setCode.split(',').map((s: string) => s.trim()) : [setCode]
  const setDisplay = formatSetCodeRange(setCodes)
  const createdAt = row.created_at ? new Date(row.created_at) : new Date()
  const month = String(createdAt.getMonth() + 1).padStart(2, '0')
  const day = String(createdAt.getDate()).padStart(2, '0')
  const year = createdAt.getFullYear()
  return `${setDisplay} ${titleCaseFormat(row.pool_type || 'sealed')} ${month}/${day}/${year}`
}

function iso(value: unknown): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : String(value)
}

function buildLinks(rootShareId: string, buildShareId: string, isOriginal: boolean) {
  return {
    pool: `/pool/${rootShareId}`,
    deck: isOriginal ? `/pool/${rootShareId}/deck` : `/pool/${rootShareId}/deck/${buildShareId}`,
    play: `/pool/${buildShareId}/deck/play`,
    json: `/api/pools/${buildShareId}/deck.json`,
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse as unknown as NextResponse

    const session = requireAuth(request)
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '40', 10), 100)

    const rootRows = await queryRows(
      `WITH root_ids AS (
         SELECT id
         FROM card_pools
         WHERE user_id = $1 AND parent_pool_id IS NULL
         UNION
         SELECT COALESCE(parent_pool_id, id)
         FROM card_pools
         WHERE user_id = $1
         UNION
         SELECT COALESCE(cp.parent_pool_id, cp.id)
         FROM pool_views pv
         JOIN card_pools cp ON cp.id = pv.pool_id
         WHERE pv.user_id = $1
       )
       SELECT
         root.id,
         root.share_id,
         root.user_id AS owner_id,
         root.set_code,
         root.set_name,
         root.pool_type,
         root.name,
         root.created_at,
         root.updated_at,
         root.deck_builder_state,
         root.wins,
         root.losses,
         root.draws,
         cardinality(root.wayfinder_match_ids) AS captured_matches,
         CASE
           WHEN jsonb_typeof(root.cards) = 'array' THEN jsonb_array_length(root.cards)
           ELSE 0
         END AS card_count,
         owner.username AS owner_username,
         owner.avatar_url AS owner_avatar_url,
         pv.viewed_at,
         EXISTS (
           SELECT 1 FROM card_pools mine
           WHERE mine.parent_pool_id = root.id AND mine.user_id = $1
         ) AS has_my_build
       FROM root_ids
       JOIN card_pools root ON root.id = root_ids.id
       LEFT JOIN users owner ON owner.id = root.user_id
       LEFT JOIN pool_views pv ON pv.pool_id = root.id AND pv.user_id = $1
       ORDER BY GREATEST(root.updated_at, COALESCE(pv.viewed_at, root.updated_at)) DESC
       LIMIT $2`,
      [session.id, limit]
    )

    const rootIds = rootRows.map((row: any) => row.id).filter(Boolean)
    const buildRows = rootIds.length === 0
      ? []
      : await queryRows(
        `SELECT
           cp.id,
           cp.share_id,
           cp.parent_pool_id,
           cp.user_id,
           cp.name,
           cp.deck_builder_state,
           cp.created_at,
           cp.updated_at,
           cp.wins,
           cp.losses,
           cp.draws,
           cardinality(cp.wayfinder_match_ids) AS captured_matches,
           builder.username AS builder_username,
           builder.avatar_url AS builder_avatar_url
         FROM card_pools cp
         LEFT JOIN users builder ON builder.id = cp.user_id
         WHERE cp.id = ANY($1::uuid[])
            OR cp.parent_pool_id = ANY($1::uuid[])
         ORDER BY cp.created_at ASC`,
        [rootIds]
      )

    const buildsByRoot = new Map<string, any[]>()
    for (const row of buildRows) {
      const rootId = row.parent_pool_id || row.id
      const existing = buildsByRoot.get(rootId) || []
      existing.push(row)
      buildsByRoot.set(rootId, existing)
    }

    const pools = rootRows.map((row: any) => {
      const rootPreview = extractDeckPreview(row.deck_builder_state)
      // Canonical pool name: "{Archetype} {MM.DD.YYYY}" when there's a deck,
      // else "{SET} {Draft|Sealed} {MM.DD.YYYY}" (R-pool-naming). Uses the local
      // archetype fallback (leader + base color + HP) — no per-pool resolver call.
      const rootArchetype = archetypeShortName({
        leaderShortName: rootPreview.leaderShortName,
        leaderName: rootPreview.leaderName,
        baseAspects: rootPreview.baseAspects,
        baseHp: rootPreview.baseHp,
      })
      const rootName = poolDisplayName({
        archetypeShort: rootArchetype,
        setCode: row.set_code,
        poolType: row.pool_type,
        date: row.created_at,
      })
      const isOwned = row.owner_id === session.id
      const relationship = isOwned
        ? 'owned'
        : row.has_my_build
          ? 'built-on'
          : 'shared'
      const rootShareId = row.share_id
      const builds = (buildsByRoot.get(row.id) || []).map((build: any) => {
        const isOriginal = build.id === row.id
        const preview = extractDeckPreview(build.deck_builder_state)
        const buildName = preview.poolName || build.name || rootName
        return {
          shareId: build.share_id,
          name: buildName,
          isOriginal,
          isMine: build.user_id === session.id,
          builder: {
            id: build.user_id || null,
            username: build.builder_username || null,
            avatarUrl: build.builder_avatar_url || null,
          },
          leaderName: preview.leaderName,
          baseName: preview.baseName,
          leaderImageUrl: preview.leaderImageUrl,
          baseImageUrl: preview.baseImageUrl,
          baseColor: preview.baseColor,
          mainDeckCount: preview.mainDeckCount,
          wins: parseInt(String(build.wins || '0'), 10),
          losses: parseInt(String(build.losses || '0'), 10),
          draws: parseInt(String(build.draws || '0'), 10),
          capturedMatches: parseInt(String(build.captured_matches || '0'), 10),
          createdAt: iso(build.created_at),
          updatedAt: iso(build.updated_at),
          links: buildLinks(rootShareId, build.share_id, isOriginal),
        }
      })

      return {
        shareId: rootShareId,
        name: rootName,
        setCode: row.set_code || null,
        setName: row.set_name || null,
        poolType: row.pool_type || 'sealed',
        poolTypeLabel: titleCaseFormat(row.pool_type || 'sealed'),
        relationship,
        cardCount: parseInt(String(row.card_count || '0'), 10),
        wins: parseInt(String(row.wins || '0'), 10),
        losses: parseInt(String(row.losses || '0'), 10),
        draws: parseInt(String(row.draws || '0'), 10),
        capturedMatches: parseInt(String(row.captured_matches || '0'), 10),
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
        lastViewedAt: iso(row.viewed_at),
        owner: {
          id: row.owner_id || null,
          username: row.owner_username || null,
          avatarUrl: row.owner_avatar_url || null,
        },
        builds,
      }
    })

    const response = jsonResponse({ pools })
    response.headers.set('Cache-Control', 'private, max-age=60')
    response.headers.set('Vary', 'Cookie')
    return response as unknown as NextResponse
  } catch (error) {
    return handleApiError(error) as unknown as NextResponse
  }
}
