/**
 * What a pool's share image shows — its title, and which cards.
 *
 * Pure — no DB, no network — so the rules can be tested on their own.
 * `lib/og/poolDeckImage.ts` loads the row and hands the saved state here.
 */

import { formatPoolLabel } from '@/src/utils/poolDisplayName'

export interface CardLike {
  id?: string
  cardId?: string
  name?: string
  subtitle?: string | null
  variantType?: string
  isLeader?: boolean
  isBase?: boolean
}

export interface PositionLike {
  card: CardLike
  section?: string
  visible?: boolean
  enabled?: boolean
}

export interface DeckBuilderStateLike {
  activeLeader?: string | null
  activeBase?: string | null
  /** The name the owner sees in the deck builder — the source of truth. */
  poolName?: string | null
  cardPositions?: Record<string, PositionLike>
}

export interface PoolRowLike {
  name?: string | null
  set_code?: string | null
  pool_type?: string | null
}

/**
 * The pool's display name, by the chain the rest of the app uses: the name
 * saved in the deck-builder state first, then the row's name column, then a
 * generated "{SET} {Format}" label. Renaming a pool writes poolName and
 * leaves the column behind, so reading the column alone shows a stale title.
 */
export function selectDeckImageTitle(
  state: DeckBuilderStateLike | null,
  pool: PoolRowLike,
): string {
  // pool_type also carries rotisserie/pack_wars/pack_blitz/imported; the
  // pools API labels rotisserie as a draft and everything else as sealed.
  const isDraft = pool.pool_type === 'draft' || pool.pool_type === 'rotisserie'
  return (
    state?.poolName ||
    pool.name ||
    formatPoolLabel(pool.set_code, isDraft ? 'draft' : 'sealed')
  )
}

export interface DeckImageSelection {
  leader: CardLike | null
  base: CardLike | null
  deckCards: CardLike[]
}

/**
 * Pick the leader, base and deck out of a saved deck-builder state.
 *
 * Mirrors the deck.json export and the lobby deck pane: the deck is the
 * visible, enabled cards in the `deck` section, and leader/base come from
 * activeLeader/activeBase. Sharing those filters matters — a share image
 * that counts hidden or disabled cards shows a deck the owner never built.
 *
 * Deck-only for the OG share image — a sideboard makes the composition too
 * tall for a 1.91:1-ish share preview and pushes the deck off the visible
 * area in Discord/Twitter cards. The sideboard still shows up everywhere
 * else (in-app deckbuilder, bot summaries).
 */
export function selectDeckImageCards(state: DeckBuilderStateLike | null): DeckImageSelection {
  const positions = state?.cardPositions || {}

  let leader: CardLike | null = null
  let base: CardLike | null = null
  const deckCards: CardLike[] = []

  for (const [key, pos] of Object.entries(positions)) {
    if (!pos?.card) continue
    if (key === state?.activeLeader && pos.card.isLeader) leader = pos.card
    if (key === state?.activeBase && pos.card.isBase) base = pos.card
    if (pos.card.isLeader || pos.card.isBase) continue
    if (pos.section === 'deck' && pos.visible && pos.enabled !== false) {
      deckCards.push(pos.card)
    }
  }

  // Fallbacks: if the active selection doesn't match a position (rare), pick
  // any leader/base we can find so the share image still renders something.
  for (const pos of Object.values(positions)) {
    if (!leader && pos?.card?.isLeader) leader = pos.card
    if (!base && pos?.card?.isBase) base = pos.card
  }

  return { leader, base, deckCards }
}
