// @ts-nocheck
/**
 * ArenaActionsBar
 *
 * Unified ACTIONS row for both Pool and Deck sections in arena view.
 * Merges + All / - All (bulk move), Swap, In Aspect / Out of Aspect,
 * and the Aspect Penalties toggle into a single labeled bar.
 */

import { useMemo, type MouseEvent } from 'react'
import './ArenaActionsBar.css'
import { useDeckBuilder } from '../../contexts/DeckBuilderContext'
import { calculateAspectPenalty } from '../../services/cards/aspectPenalties'

const EyeOpenIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EyeSlashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

const isPoolCard = (pos) =>
  (pos.section === 'sideboard' || pos.enabled === false) &&
  pos.visible && !pos.card.isBase && !pos.card.isLeader

const isDeckCard = (pos) =>
  pos.section === 'deck' &&
  pos.visible && !pos.card.isBase && !pos.card.isLeader && pos.enabled !== false

export interface ArenaActionsBarProps {
  mode?: 'pool' | 'deck'
}

export function ArenaActionsBar({ mode = 'pool' }: ArenaActionsBarProps) {
  const {
    cardPositions,
    setCardPositions,
    moveCardsToDeck,
    moveCardsToPool,
    leaderCard,
    baseCard,
  } = useDeckBuilder()

  const poolCardIds = useMemo(
    () => Object.entries(cardPositions).filter(([_, p]) => isPoolCard(p)).map(([id]) => id),
    [cardPositions],
  )

  const deckCardIds = useMemo(
    () => Object.entries(cardPositions).filter(([_, p]) => isDeckCard(p)).map(([id]) => id),
    [cardPositions],
  )

  const hasLeaderAndBase = !!(leaderCard && baseCard)

  const inAspectPoolIds = useMemo(() => {
    if (!hasLeaderAndBase) return []
    return Object.entries(cardPositions)
      .filter(([_, p]) => isPoolCard(p) && calculateAspectPenalty(p.card, leaderCard, baseCard) === 0)
      .map(([id]) => id)
  }, [cardPositions, leaderCard, baseCard, hasLeaderAndBase])

  const outOfAspectDeckIds = useMemo(() => {
    if (!hasLeaderAndBase) return []
    return Object.entries(cardPositions)
      .filter(([_, p]) => isDeckCard(p) && calculateAspectPenalty(p.card, leaderCard, baseCard) > 0)
      .map(([id]) => id)
  }, [cardPositions, leaderCard, baseCard, hasLeaderAndBase])

  const stop = (e: MouseEvent) => e.stopPropagation()

  const handleAddAll = (e: MouseEvent) => {
    stop(e)
    moveCardsToDeck(poolCardIds)
  }

  const handleRemoveAll = (e: MouseEvent) => {
    stop(e)
    moveCardsToPool(deckCardIds)
  }

  const handleSwap = (e: MouseEvent) => {
    stop(e)
    setCardPositions?.((prev) => {
      const updated = { ...prev }
      Object.entries(prev).forEach(([id, pos]) => {
        if (pos.card.isBase || pos.card.isLeader || !pos.visible) return
        if (isPoolCard(pos)) {
          updated[id] = { ...pos, section: 'deck', enabled: true }
        } else if (isDeckCard(pos)) {
          updated[id] = { ...pos, section: 'sideboard', enabled: false }
        }
      })
      return updated
    })
  }

  const handleInAspect = (e: MouseEvent) => {
    stop(e)
    moveCardsToDeck(inAspectPoolIds)
  }

  const handleOutOfAspect = (e: MouseEvent) => {
    stop(e)
    moveCardsToPool(outOfAspectDeckIds)
  }

  const handleTogglePenalties = (e: MouseEvent) => {
    stop(e)
    setShowAspectPenalties?.(!showAspectPenalties)
  }

  const addAllBtn = (
    <button
      key="add-all"
      className="arena-action-btn arena-action-btn--green"
      onClick={handleAddAll}
      disabled={poolCardIds.length === 0}
      title="Add all pool cards to deck"
    >
      + All
    </button>
  )

  const removeAllBtn = (
    <button
      key="remove-all"
      className="arena-action-btn arena-action-btn--red"
      onClick={handleRemoveAll}
      disabled={deckCardIds.length === 0}
      title="Remove all deck cards to pool"
    >
      − All
    </button>
  )

  const swapBtn = (
    <button
      key="swap"
      className="arena-action-btn arena-action-btn--yellow"
      onClick={handleSwap}
      disabled={poolCardIds.length === 0 && deckCardIds.length === 0}
      title="Swap all cards between pool and deck"
    >
      ↔ Swap
    </button>
  )

  return (
    <div className="arena-actions-bar">
      <span className="arena-actions-label">ACTIONS:</span>

      {mode === 'pool' ? <>{addAllBtn}{swapBtn}{removeAllBtn}</> : <>{removeAllBtn}{swapBtn}{addAllBtn}</>}

      <button
        className="arena-action-btn arena-action-btn--green"
        onClick={handleInAspect}
        disabled={!hasLeaderAndBase || inAspectPoolIds.length === 0}
        title={hasLeaderAndBase ? 'Add on-aspect pool cards to deck' : 'Select a leader and base first'}
      >
        ⊕ In Aspect
      </button>

      <button
        className="arena-action-btn arena-action-btn--red"
        onClick={handleOutOfAspect}
        disabled={!hasLeaderAndBase || outOfAspectDeckIds.length === 0}
        title={hasLeaderAndBase ? 'Remove off-aspect deck cards to pool' : 'Select a leader and base first'}
      >
        ⊖ Out of Aspect
      </button>

    </div>
  )
}

export default ArenaActionsBar
