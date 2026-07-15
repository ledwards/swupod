/**
 * GET /api/open-games/eligible-decks?setCode=SEC&format=draft
 * The caller's decks eligible for posting/joining (R23/R31): pools with a
 * built deck (leader+base recorded via built_decks). Unfiltered, it powers
 * the New Game picker; filtered, the Join picker ("4 eligible").
 *
 * Each deck carries the same display identity /me uses for its pool list
 * items (app/api/me/pool-history): leader name/art and base tint extracted
 * from deck_builder_state (built_decks.leader is only {id, count}), and the
 * display-name chain state poolName → card_pools.name → canonical
 * "{Archetype} {MM.DD.YYYY}" fallback.
 */
import { requireAuth } from '@/lib/auth'
import { jsonResponse } from '@/lib/utils'
import { queryRows } from '@/lib/db'
import { getAspectColor, getAspectColors } from '@/src/utils/aspectColors'
import { archetypeShortName, poolDisplayName } from '@/src/utils/archetypeName'
import { hyperspaceLeaderArtForCard } from '@/src/utils/hyperspaceLeaderArt'
import { openGameErrorResponse } from '../helpers'
import { NextRequest } from 'next/server'

/** deck_builder_state is JSONB; pg may hand back a parsed object or a string. */
function parseDeckBuilderState(raw: unknown): Record<string, any> {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {}
    } catch {
      return {}
    }
  }
  return typeof raw === 'object' ? (raw as Record<string, any>) : {}
}

function cardName(card: any): string | null {
  return card?.name || card?.title || null
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = requireAuth(request)
    const { searchParams } = new URL(request.url)
    const setCode = searchParams.get('setCode')
    const format = searchParams.get('format')

    // Eligibility = the deck builder has a leader AND base picked
    // (deck_builder_state) — the same definition /me uses. built_decks is
    // only joined for recency: it exists solely after a Play click, and
    // gating on it hid fully-built decks from the picker.
    const rows = await queryRows(
      `SELECT cp.share_id, cp.set_code, cp.set_name, cp.pool_type, cp.name,
              cp.created_at, cp.updated_at, cp.deck_builder_state, bd.built_at
       FROM card_pools cp
       LEFT JOIN built_decks bd ON bd.card_pool_id = cp.id
       WHERE cp.user_id = $1 AND cp.hidden IS NOT TRUE
         AND cp.deck_builder_state ->> 'activeLeader' IS NOT NULL
         AND cp.deck_builder_state ->> 'activeBase' IS NOT NULL
       ORDER BY COALESCE(bd.built_at, cp.updated_at, cp.created_at) DESC
       LIMIT 300`,
      [session.id]
    )

    const decks = rows.map(r => {
      // Leader/base identity comes from deck_builder_state, same as /me's
      // pool history (built_decks.leader holds only {id, count}).
      const state = parseDeckBuilderState(r.deck_builder_state)
      const positions = state.cardPositions || {}
      const leaderCard = state.activeLeader ? positions[state.activeLeader]?.card : null
      const baseCard = state.activeBase ? positions[state.activeBase]?.card : null
      const leaderName = cardName(leaderCard)

      // Same display-name chain as /me: the deck builder's stored pool name,
      // then the pool row's name, then the canonical "{Archetype} {MM.DD.YYYY}"
      // fallback (R-pool-naming).
      const archetype = archetypeShortName({
        leaderShortName: leaderName ? leaderName.split(/[\s,]/)[0] || null : null,
        leaderName,
        baseAspects: Array.isArray(baseCard?.aspects) ? baseCard.aspects : [],
        baseHp: typeof baseCard?.hp === 'number' ? baseCard.hp : null,
      })
      const name =
        (state.poolName ? String(state.poolName) : null) ||
        (r.name ? String(r.name) : null) ||
        poolDisplayName({
          archetypeShort: archetype,
          setCode: r.set_code ? String(r.set_code) : null,
          poolType: r.pool_type ? String(r.pool_type) : null,
          date: r.created_at ? String(r.created_at) : null,
        })

      return {
        poolShareId: String(r.share_id),
        setCode: String(r.set_code),
        setName: r.set_name ? String(r.set_name) : null,
        format: r.pool_type ? String(r.pool_type) : 'sealed',
        name,
        builtAt: r.built_at ? String(r.built_at) : r.updated_at ? String(r.updated_at) : null,
        leaderName,
        leaderImageUrl: leaderCard?.imageUrl || leaderCard?.artUrl || null,
        // Hyperspace leader art (full-bleed) is the preferred item art on /me;
        // fall back to the leader's unit-side art, then the portrait.
        leaderBackImageUrl: hyperspaceLeaderArtForCard(leaderCard) || leaderCard?.backImageUrl || null,
        baseColor: baseCard ? getAspectColor(baseCard) : null,
        // Deck identity colors (leader + base color aspects, deduped) for the
        // picker's gradient background.
        aspectColors: [...new Set([
          ...(leaderCard ? getAspectColors(leaderCard) : []),
          ...(baseCard ? getAspectColors(baseCard) : []),
        ])].slice(0, 3),
        eligible:
          (!setCode || String(r.set_code) === setCode) &&
          (!format || String(r.pool_type || 'sealed') === format),
      }
    })

    return jsonResponse({
      decks,
      eligibleCount: decks.filter(d => d.eligible).length,
      totalCount: decks.length,
    })
  } catch (error) {
    return openGameErrorResponse(error)
  }
}
