/**
 * Helper for OG-image routes that render the swuapi deck image for a
 * given pool/build shareId. Used by:
 *   app/pool/[shareId]/deck/opengraph-image.tsx
 *   app/pool/[shareId]/deck/[buildId]/opengraph-image.tsx
 */

import { queryRow } from '../db'
import { generateDeckImage } from '../deckImageApi'

interface CardLike {
  id?: string
  cardId?: string
  name?: string
  subtitle?: string | null
  variantType?: string
  isLeader?: boolean
  isBase?: boolean
}

interface PositionLike {
  card: CardLike
  section?: string
}

interface DeckBuilderStateLike {
  activeLeader?: string | null
  activeBase?: string | null
  cardPositions?: Record<string, PositionLike>
}

interface PoolRow {
  share_id: string
  name: string | null
  set_name: string | null
  set_code: string | null
  cards: CardLike[] | null
  deck_builder_state: DeckBuilderStateLike | string | null
}

/**
 * Strip the `pool-N-` / `leader-N-` / `base-N-` prefix from a position key
 * to get the underlying card uuid. activeLeader/Base in deck_builder_state
 * use the full prefixed form, but lookups are easier by uuid.
 */
function stripPositionKey(key: string): string {
  // Format: <type>-<index>-<uuid>. uuid is the last 36 chars.
  if (key.length <= 36) return key
  return key.slice(-36)
}

function toCardInfo(card: CardLike) {
  return {
    name: card.name || '',
    subtitle: card.subtitle || undefined,
    cardId: card.cardId || undefined,
    variantType: card.variantType || undefined,
  }
}

export async function generateDeckImageForShareId(
  shareId: string,
): Promise<{ buffer: Buffer; pool: PoolRow } | null> {
  let pool: PoolRow | null = null
  try {
    pool = (await queryRow(
      `SELECT share_id, name, set_name, set_code, cards, deck_builder_state
       FROM card_pools
       WHERE share_id = $1`,
      [shareId],
    )) as PoolRow | null
  } catch (err) {
    console.error('[og/poolDeckImage] DB query failed for', shareId, err)
    return null
  }
  if (!pool) return null

  // deck_builder_state is JSONB — usually parsed already, but handle the
  // string case for older rows / driver quirks.
  let state: DeckBuilderStateLike | null = null
  if (typeof pool.deck_builder_state === 'string') {
    try {
      state = JSON.parse(pool.deck_builder_state)
    } catch {
      state = null
    }
  } else {
    state = pool.deck_builder_state || null
  }
  const positions = state?.cardPositions || {}

  // Find the leader + base by stripping the position-key prefix.
  let leader: CardLike | null = null
  let base: CardLike | null = null
  const leaderPos = state?.activeLeader ? positions[state.activeLeader] : undefined
  if (leaderPos) leader = leaderPos.card
  const basePos = state?.activeBase ? positions[state.activeBase] : undefined
  if (basePos) base = basePos.card
  // Fallbacks: if active selection doesn't match a position (rare), pick
  // any leader/base we can find so the OG image still renders something.
  if (!leader) {
    for (const k of Object.keys(positions)) {
      const p = positions[k]
      if (p?.card?.isLeader) {
        leader = p.card
        break
      }
    }
  }
  if (!base) {
    for (const k of Object.keys(positions)) {
      const p = positions[k]
      if (p?.card?.isBase) {
        base = p.card
        break
      }
    }
  }
  if (!leader || !base) {
    console.warn('[og/poolDeckImage] missing leader/base for', shareId)
    return null
  }

  const deckCards: CardLike[] = []
  const sideboardCards: CardLike[] = []
  for (const k of Object.keys(positions)) {
    const p = positions[k]
    if (!p?.card || p.card.isLeader || p.card.isBase) continue
    if (p.section === 'deck') deckCards.push(p.card)
    else if (p.section === 'sideboard') sideboardCards.push(p.card)
  }

  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://protectthepod.com'
  const poolUrl = `${appUrl}/pool/${shareId}/deck`

  const buffer = await generateDeckImage({
    leader: toCardInfo(leader),
    base: toCardInfo(base),
    deckCards: deckCards.map(toCardInfo),
    sideboardCards: sideboardCards.length > 0 ? sideboardCards.map(toCardInfo) : undefined,
    title: pool.name || 'Imported Pool',
    subtitle: pool.set_name || pool.set_code || undefined,
    poolUrl,
  })
  if (!buffer) return null

  // stripPositionKey is currently unused outside but kept exported-by-implication
  // for future use if we need to look up by UUID instead of full position key.
  void stripPositionKey

  return { buffer, pool }
}

export async function respondWithDeckImage(shareId: string): Promise<Response> {
  const result = await generateDeckImageForShareId(shareId)
  if (!result) {
    // Fall back to the static OG image so crawlers don't get a 404.
    return new Response(null, { status: 302, headers: { Location: '/og-image.png' } })
  }
  return new Response(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      // Aggressive cache — deck image only changes when pool data does;
      // bust by re-uploading or editing.
      'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400',
    },
  })
}
