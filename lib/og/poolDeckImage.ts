/**
 * Helper for OG-image routes that render the swuapi deck image for a
 * given pool/build shareId. Used by:
 *   app/pool/[shareId]/deck/opengraph-image.tsx
 *   app/pool/[shareId]/deck/[buildId]/opengraph-image.tsx
 */

import { queryRow } from '../db'
import { generateDeckImage } from '../deckImageApi'
import { resolveCatalogCards } from '@/src/services/cards/cardCatalogResolver'
import {
  selectDeckImageCards,
  selectDeckImageTitle,
  type CardLike,
  type DeckBuilderStateLike,
} from './deckImageSelection'

interface PoolRow {
  share_id: string
  name: string | null
  set_name: string | null
  set_code: string | null
  pool_type: string | null
  cards: CardLike[] | null
  deck_builder_state: DeckBuilderStateLike | string | null
}

function toCardInfo(card: CardLike) {
  return {
    name: card.name || '',
    subtitle: card.subtitle || undefined,
    // `id` is the unique card key; cardId is not. Passing both lets the
    // swuapi client resolve cards stored without a collector number.
    id: card.id || undefined,
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
      `SELECT share_id, name, set_name, set_code, pool_type, cards, deck_builder_state
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

  // Hydrate the stored card objects against the current catalog, exactly as
  // GET /api/pools/:shareId does. Pools built during spoiler season hold
  // placeholder bucket slots with no collector number; unresolved, they reach
  // swuapi as nameless cards and come back as grey "Unknown" tiles.
  state = resolveCatalogCards(state)

  const { leader, base, deckCards } = selectDeckImageCards(state)
  if (!leader || !base) {
    console.warn('[og/poolDeckImage] missing leader/base for', shareId)
    return null
  }

  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://protectthepod.com'
  const poolUrl = `${appUrl}/pool/${shareId}/deck`

  const rawBuffer = await generateDeckImage({
    leader: toCardInfo(leader),
    base: toCardInfo(base),
    deckCards: deckCards.map(toCardInfo),
    title: selectDeckImageTitle(state, pool),
    subtitle: pool.set_name || pool.set_code || undefined,
    poolUrl,
    layout: 'limited',
  })
  if (!rawBuffer) return null

  // swuapi returns ~1572×1338 (close to square). The OG meta declares
  // 1200×630 (Twitter/Discord-friendly 1.91:1). If we serve the raw
  // PNG at its natural aspect, Discord stretches it horizontally to
  // match the declared dims — cards look squished. Fix: letterbox into
  // a 1200×630 canvas with `fit: 'contain'` + a dark background. No
  // stretching, just empty padding where the source doesn't fill.
  let buffer = rawBuffer
  try {
    const sharp = (await import('sharp')).default
    buffer = await sharp(rawBuffer)
      .resize(OG_WIDTH, OG_HEIGHT, {
        fit: 'contain',
        background: { r: 13, g: 17, b: 23, alpha: 1 }, // matches site dark bg
      })
      .png()
      .toBuffer()
  } catch (err) {
    console.warn('[og/poolDeckImage] sharp letterbox failed, serving raw bytes:', err)
  }

  return { buffer, pool }
}

const OG_WIDTH = 1200
const OG_HEIGHT = 630

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
