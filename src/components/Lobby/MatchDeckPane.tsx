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
import { createPortal } from 'react-dom'
import { type CardData } from '@/src/components/Card'
import { CardWithPreview } from '@/src/components/CardWithPreview'
import Button from '@/src/components/Button'
import { DeckImageModal } from '@/src/components/DeckBuilder/DeckImageModal'
import { useToast } from '@/src/components/Toast'
import { loadPool } from '@/src/utils/poolApi'
import { jsonParse } from '@/src/utils/json'
import { renderPoolImageBlob } from '@/src/services/deckImage'
import type { Arena } from '@/src/types/card'
import '@/src/components/PlayInstructions.css'

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
  setCode?: string
  name?: string | null
  cards?: DeckCard[]
  packs?: Array<{ cards: DeckCard[] }>
  deckBuilderState?: string | DeckState
  owner?: { username?: string | null; name?: string | null }
  rootShareId?: string | null
}

interface DeckView {
  leader: DeckCard | null
  base: DeckCard | null
  deck: DeckCard[]
  sideboard: DeckCard[]
}

// Karabast's lobby deck view sorts by cost ascending only, no type/arena
// grouping (forceteki-client Lobby/Deck/Deck.tsx). Name is the tiebreak so
// the flat order is deterministic where theirs relies on source order.
function byCost(a: DeckCard, b: DeckCard): number {
  const costA = a.cost ?? 999
  const costB = b.cost ?? 999
  if (costA !== costB) return costA - costB
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

  deck.sort(byCost)
  sideboard.sort(byCost)
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
  const [pool, setPool] = useState<PoolPayload | null>(null)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [deckImageUrl, setDeckImageUrl] = useState<string | null>(null)
  const { showToast } = useToast()

  const fetchDeck = useCallback(async () => {
    setStatus('loading')
    try {
      const loaded = (await loadPool(poolShareId)) as PoolPayload
      setPool(loaded)
      setView(buildDeckView(loaded))
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [poolShareId])

  useEffect(() => {
    fetchDeck()
  }, [fetchDeck])

  // Share actions — the play page's action-bar trio (same classes/icons).
  async function copyDeckLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pool/${poolShareId}/deck`)
      showToast({ text: 'Deck link copied!', kind: 'success' })
    } catch {
      showToast({ text: 'Failed to copy link', kind: 'danger' })
    }
  }

  async function copyDeckJson(): Promise<void> {
    try {
      const res = await fetch(`/api/pools/${poolShareId}/deck.json`)
      if (!res.ok) throw new Error(String(res.status))
      const deckJson = await res.json()
      // Karabast rejects deckless lists outright — better to say so here.
      if (!Array.isArray(deckJson.deck) || deckJson.deck.length === 0) {
        showToast({ text: 'Your deck is empty — finish building it first.', kind: 'danger' })
        return
      }
      await navigator.clipboard.writeText(JSON.stringify(deckJson, null, 2))
      showToast({ text: 'Deck JSON copied to clipboard!', kind: 'success' })
    } catch {
      showToast({ text: 'Failed to copy deck JSON', kind: 'danger' })
    }
  }

  // Canvas-rendered PNG via the shared renderer (same params as the play page).
  async function exportDeckImage(): Promise<void> {
    const state = jsonParse(pool?.deckBuilderState, null) as DeckState | null
    if (!state?.cardPositions || !state.activeLeader || !state.activeBase) {
      showToast({ text: 'No deck data found.', kind: 'danger' })
      return
    }
    setGeneratingImage(true)
    try {
      const blob = await renderPoolImageBlob({
        cardPositions: state.cardPositions,
        activeLeader: state.activeLeader,
        activeBase: state.activeBase,
        leaderCard: state.cardPositions[state.activeLeader]?.card || null,
        baseCard: state.cardPositions[state.activeBase]?.card || null,
        setCode: pool?.setCode ?? '',
        poolType: pool?.poolType === 'draft' ? 'draft' : 'sealed',
        showSideboard: false,
        poolName: (state as { poolName?: string }).poolName || pool?.name || null,
        ownerUsername: pool?.owner?.username || pool?.owner?.name || null,
        shareId: poolShareId,
        rootShareId: pool?.rootShareId ?? null,
      })
      if (!blob) throw new Error('render failed')
      setDeckImageUrl(URL.createObjectURL(blob))
    } catch {
      showToast({ text: 'Failed to generate deck image', kind: 'danger' })
    } finally {
      setGeneratingImage(false)
    }
  }

  return (
    <aside className="lobby-deck-pane" aria-label="Your deck">
      <h3 className="lobby-column-title">
        Your Deck{status === 'ready' && view ? ` (${view.deck.length} cards)` : ''}
        {status === 'ready' && view && (
          <span className="lobby-deck-actions" aria-label="Deck actions">
            <button
              className="play-instructions-action-button primary"
              onClick={copyDeckLink}
              title="Copy deck link"
              aria-label="Copy deck link"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
            </button>
            <button
              className="play-instructions-action-button"
              onClick={copyDeckJson}
              title="Copy deck JSON"
              aria-label="Copy deck JSON"
            >
              <span className="lobby-json-icon" aria-hidden="true">{'{ }'}</span>
            </button>
            <button
              className="play-instructions-action-button"
              onClick={exportDeckImage}
              disabled={generatingImage}
              title="Deck image"
              aria-label="Deck image"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            </button>
          </span>
        )}
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
              {view.leader && <CardWithPreview card={view.leader} showStatsBadge={false} />}
              {view.base && <CardWithPreview card={view.base} showStatsBadge={false} />}
            </div>
            <div className="cards-grid">
              {view.deck.map((card, i) => (
                <CardWithPreview card={card} showStatsBadge={false} key={`${card.id}-${i}`} />
              ))}
            </div>
            {view.sideboard.length > 0 && (
              <>
                <h4 className="lobby-deck-subhead">Sideboard ({view.sideboard.length})</h4>
                <div className="cards-grid">
                  {view.sideboard.map((card, i) => (
                    <CardWithPreview card={card} showStatsBadge={false} key={`${card.id}-${i}`} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
      {deckImageUrl &&
        createPortal(
          <DeckImageModal
            imageUrl={deckImageUrl}
            onClose={() => setDeckImageUrl(null)}
            poolName={pool?.name ?? ''}
            setCode={pool?.setCode ?? ''}
            poolType={pool?.poolType === 'draft' ? 'draft' : 'sealed'}
          />,
          document.body
        )}
    </aside>
  )
}
