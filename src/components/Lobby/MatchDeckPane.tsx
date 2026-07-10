'use client'

/**
 * MatchDeckPane — the deck half of the open-game match page's split view
 * (Karabast-lobby style): a complete read-only view of the VIEWER'S OWN deck.
 * Leader and base up top (.leaders-bases-container), then the main deck and —
 * when the build has one — the sideboard, both as .cards-grid of the standard
 * Card primitive. No editing affordances.
 *
 * Data: the seat's pool (yourPoolShareId → GET /api/pools/:shareId via
 * loadPool), reading the same deck_builder_state sections the deck export
 * route (app/api/pools/[shareId]/deck.json) reads. R29: this pane is only
 * ever fed the viewer's own pool share id — never the opponent's.
 */
import { useCallback, useEffect, useState } from 'react'
import Card, { type CardData } from '@/src/components/Card'
import Button from '@/src/components/Button'
import { loadPool } from '@/src/utils/poolApi'
import { jsonParse } from '@/src/utils/json'
import { getCardTypeOrder } from '@/src/utils/cardSort'
import type { Arena } from '@/src/types/card'

interface DeckCard extends CardData {
  cost?: number | null
  arenas?: Arena[] | null
}

interface CardPosition {
  card: DeckCard
  section: string
  visible: boolean
  enabled?: boolean
}

interface DeckState {
  cardPositions?: Record<string, CardPosition>
  activeLeader?: string
  activeBase?: string
}

interface PoolPayload {
  poolType?: string
  cards?: DeckCard[]
  packs?: Array<{ cards: DeckCard[] }>
  deckBuilderState?: string | DeckState
}

interface DeckView {
  leader: DeckCard | null
  base: DeckCard | null
  deck: DeckCard[]
  sideboard: DeckCard[]
}

// Flat display order: cost, then type, then name — the deck builder's
// default ordering minus the aspect grouping.
function byCostTypeName(a: DeckCard, b: DeckCard): number {
  const costA = a.cost ?? 999
  const costB = b.cost ?? 999
  if (costA !== costB) return costA - costB
  const orderA = getCardTypeOrder(a)
  const orderB = getCardTypeOrder(b)
  if (orderA !== orderB) return orderA - orderB
  return (a.name ?? '').toLowerCase().localeCompare((b.name ?? '').toLowerCase())
}

/**
 * Build the read-only view from a pool payload. Mirrors the deck.json export
 * route's section filters (deck: visible + enabled, sideboard: visible;
 * leader/base via activeLeader/activeBase), but keeps full card objects so
 * we can render real card images.
 */
export function buildDeckView(pool: PoolPayload): DeckView | null {
  const state = jsonParse(pool.deckBuilderState, null) as DeckState | null
  const positions = state?.cardPositions
  if (!positions) return null

  // The saved positions carry a serialized copy of each card; the pool
  // payload carries the canonical objects (imageUrl etc.). Prefer canonical.
  const poolCards: DeckCard[] = (pool.poolType === 'draft'
    ? pool.cards || []
    : (pool.packs ? pool.packs.flatMap(pack => pack.cards) : pool.cards) || [])
  const byId = new Map(poolCards.filter(card => card?.id).map(card => [card.id, card]))
  const resolve = (key: string, pos: CardPosition): DeckCard =>
    byId.get(pos.card?.id ?? key) ?? pos.card

  let leader: DeckCard | null = null
  let base: DeckCard | null = null
  const deck: DeckCard[] = []
  const sideboard: DeckCard[] = []

  for (const [key, pos] of Object.entries(positions)) {
    if (!pos?.card) continue
    if (key === state?.activeLeader && pos.card.isLeader) leader = resolve(key, pos)
    if (key === state?.activeBase && pos.card.isBase) base = resolve(key, pos)
    if (pos.card.isLeader || pos.card.isBase) continue
    if (pos.section === 'deck' && pos.visible && pos.enabled !== false) {
      deck.push(resolve(key, pos))
    } else if (pos.section === 'sideboard' && pos.visible) {
      sideboard.push(resolve(key, pos))
    }
  }

  if (!leader && !base && deck.length === 0) return null

  deck.sort(byCostTypeName)
  sideboard.sort(byCostTypeName)
  return { leader, base, deck, sideboard }
}

function DeckSkeleton() {
  return (
    <div className="lobby-deck-skeleton" aria-hidden="true">
      <div className="leaders-bases-container">
        <div className="skeleton-block lobby-deck-skeleton-leader" />
        <div className="skeleton-block lobby-deck-skeleton-leader" />
      </div>
      <div className="cards-grid">
        {Array.from({ length: 8 }, (_, i) => (
          <div className="skeleton-block lobby-deck-skeleton-card" key={i} />
        ))}
      </div>
    </div>
  )
}

export default function MatchDeckPane({ poolShareId }: { poolShareId: string }): React.JSX.Element {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [view, setView] = useState<DeckView | null>(null)

  const fetchDeck = useCallback(async () => {
    setStatus('loading')
    try {
      const pool = await loadPool(poolShareId)
      setView(buildDeckView(pool as PoolPayload))
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [poolShareId])

  useEffect(() => {
    fetchDeck()
  }, [fetchDeck])

  return (
    <aside className="lobby-deck-pane" aria-label="Your deck">
      <h3 className="lobby-column-title">
        Your Deck{status === 'ready' && view ? ` (${view.deck.length} cards)` : ''}
        <span>only you can see this</span>
      </h3>
      <div className="lobby-deck-pane-body">
        {status === 'loading' && <DeckSkeleton />}
        {status === 'error' && (
          <div className="lobby-state lobby-state-error">
            Couldn&apos;t load your deck.{' '}
            <Button variant="secondary" size="sm" onClick={fetchDeck}>Retry</Button>
          </div>
        )}
        {status === 'ready' && !view && (
          <div className="lobby-state">No deck has been built for this pool yet.</div>
        )}
        {status === 'ready' && view && (
          <>
            <div className="leaders-bases-container">
              {view.leader && <Card card={view.leader} showStatsBadge={false} />}
              {view.base && <Card card={view.base} showStatsBadge={false} />}
            </div>
            <div className="cards-grid">
              {view.deck.map((card, i) => (
                <Card card={card} showStatsBadge={false} key={`${card.id}-${i}`} />
              ))}
            </div>
            {view.sideboard.length > 0 && (
              <>
                <h4 className="lobby-deck-subhead">Sideboard ({view.sideboard.length})</h4>
                <div className="cards-grid">
                  {view.sideboard.map((card, i) => (
                    <Card card={card} showStatsBadge={false} key={`${card.id}-${i}`} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
