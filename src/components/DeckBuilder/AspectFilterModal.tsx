// @ts-nocheck
/**
 * AspectFilterModal Component
 *
 * Modal for filtering cards by aspect. Can operate in "deck" or "pool" mode.
 * In deck mode, it shows which cards are in the deck.
 * In pool mode, it shows which cards are in the pool (sideboard).
 *
 * Can be used with props or with DeckBuilderContext:
 *   // With props:
 *   <AspectFilterModal isOpen={true} cardPositions={...} onMoveCards={...} />
 *
 *   // With context (inside DeckBuilderProvider):
 *   <AspectFilterModal isOpen={true} mode="deck" />
 */

import type { MouseEvent } from 'react'
import Button from '../Button'
import AspectIcon from '../AspectIcon'
import { calculateAspectPenalty } from '../../services/cards/aspectPenalties'
import { useDeckBuilder } from '../../contexts/DeckBuilderContext'
import type { CardPosition } from './AspectPenaltyToggle'
import type { BulkMoveMode } from './BulkMoveButtons'

type AspectSize = 'small' | 'medium' | 'large'
type IconSize = 'sm' | 'md' | 'lg'

// Helper to get aspect symbol - wraps AspectIcon for inline display
const getAspectSymbol = (aspect: string, size: AspectSize = 'medium') => {
  const sizeMap: Record<AspectSize, IconSize> = { 'small': 'sm', 'medium': 'md', 'large': 'lg' }
  return <AspectIcon aspect={aspect} size={sizeMap[size] || 'md'} />
}

export interface AspectFilterModalProps {
  isOpen: boolean
  onClose?: () => void
  mode?: BulkMoveMode
  cardPositions?: Record<string, CardPosition>
  onMoveCards?: (fn: (prev: Record<string, CardPosition>) => Record<string, CardPosition>) => void
  activeLeader?: string | null
  activeBase?: string | null
  filterAspectsExpanded?: Record<string, boolean>
  onFilterAspectsExpandedChange?: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void
  cardCount?: number
}

export function AspectFilterModal({
  isOpen,
  onClose,
  mode = 'deck',
  cardPositions: cardPositionsProp,
  onMoveCards: onMoveCardsProp,
  activeLeader: activeLeaderProp,
  activeBase: activeBaseProp,
  filterAspectsExpanded: filterAspectsExpandedProp,
  onFilterAspectsExpandedChange: onFilterAspectsExpandedChangeProp,
  cardCount: cardCountProp,
}: AspectFilterModalProps) {
  // Try to get values from context, fall back to props
  let contextValue: ReturnType<typeof useDeckBuilder> | null = null
  try {
    contextValue = useDeckBuilder()
  } catch {
    // Not inside a provider, use props only
  }

  // Use props if provided, otherwise use context
  const cardPositions = cardPositionsProp ?? contextValue?.cardPositions ?? {}
  const onMoveCards = onMoveCardsProp ?? contextValue?.setCardPositions
  const activeLeader = activeLeaderProp ?? contextValue?.activeLeader
  const activeBase = activeBaseProp ?? contextValue?.activeBase
  const filterAspectsExpanded = filterAspectsExpandedProp ?? contextValue?.filterAspectsExpanded ?? {}
  const onFilterAspectsExpandedChange = onFilterAspectsExpandedChangeProp ?? contextValue?.setFilterAspectsExpanded
  const moveCardsToDeck = contextValue?.moveCardsToDeck
  const moveCardsToPool = contextValue?.moveCardsToPool

  if (!isOpen) return null

  const isDeckMode = mode === 'deck'

  // Calculate card count if not provided
  const calculatedDeckCount = Object.values(cardPositions).filter(pos =>
    pos.section === 'deck' && pos.visible && !pos.card?.isBase && !pos.card?.isLeader && pos.enabled !== false
  ).length
  const calculatedPoolCount = Object.values(cardPositions).filter(pos =>
    (pos.section === 'sideboard' || pos.enabled === false) && pos.visible && !pos.card?.isBase && !pos.card?.isLeader
  ).length
  // Both modes now show deck count since checked = in deck for both
  const cardCount = cardCountProp ?? calculatedDeckCount

  const title = isDeckMode ? `Keep in Deck (${cardCount})` : `Move to Deck (${cardCount})`

  // Get leader and base cards
  const leaderCard = activeLeader && cardPositions[activeLeader]?.card
  const baseCard = activeBase && cardPositions[activeBase]?.card

  type CardEntry = [string, CardPosition]
  type FilterFn = (pos: CardPosition) => boolean

  // Helper to get cards in deck section
  const getDeckCards = (filterFn: FilterFn = () => true): CardEntry[] => {
    return Object.entries(cardPositions).filter(([_, pos]) =>
      pos.section === 'deck' && pos.visible && !pos.card.isBase && !pos.card.isLeader && pos.enabled !== false && filterFn(pos)
    )
  }

  // Helper to get cards in pool section
  const getPoolCards = (filterFn: FilterFn = () => true): CardEntry[] => {
    return Object.entries(cardPositions).filter(([_, pos]) =>
      (pos.section === 'sideboard' || pos.enabled === false) && pos.visible && !pos.card.isBase && !pos.card.isLeader && filterFn(pos)
    )
  }

  // Move cards to deck
  const moveToDeck = (cardIds: string[]) => {
    if (moveCardsToDeck) {
      moveCardsToDeck(cardIds)
      return
    }
    onMoveCards?.(prev => {
      const updated = { ...prev }
      cardIds.forEach(cardId => {
        updated[cardId] = { ...updated[cardId], section: 'deck', enabled: true }
      })
      return updated
    })
  }

  // Move cards to pool
  const moveToPool = (cardIds: string[]) => {
    if (moveCardsToPool) {
      moveCardsToPool(cardIds)
      return
    }
    onMoveCards?.(prev => {
      const updated = { ...prev }
      cardIds.forEach(cardId => {
        updated[cardId] = { ...updated[cardId], section: 'sideboard', enabled: false }
      })
      return updated
    })
  }

  // Get cards for aspect combo
  const getCardsForAspectCombo = (aspects: string[]) => {
    const sortedKey = [...aspects].sort().join('|')
    return {
      deck: getDeckCards(pos => [...(pos.card.aspects as string[] || [])].sort().join('|') === sortedKey),
      pool: getPoolCards(pos => [...(pos.card.aspects as string[] || [])].sort().join('|') === sortedKey)
    }
  }

  // Render In/Out Aspect filters
  const renderInOutAspectFilters = () => {
    if (!activeLeader || !activeBase || !leaderCard || !baseCard) return null

    const myAspects = [...(leaderCard.aspects as string[] || []), ...(baseCard.aspects as string[] || [])]
    const allAspects = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Villainy', 'Heroism']
    const outAspects = allAspects.filter(a => !myAspects.includes(a))

    const inAspectDeckCards = getDeckCards(pos => calculateAspectPenalty(pos.card, leaderCard, baseCard) === 0)
    const inAspectPoolCards = getPoolCards(pos => calculateAspectPenalty(pos.card, leaderCard, baseCard) === 0)
    const inAspectTotal = inAspectDeckCards.length + inAspectPoolCards.length

    const outAspectDeckCards = getDeckCards(pos => calculateAspectPenalty(pos.card, leaderCard, baseCard) > 0)
    const outAspectPoolCards = getPoolCards(pos => calculateAspectPenalty(pos.card, leaderCard, baseCard) > 0)
    const outAspectTotal = outAspectDeckCards.length + outAspectPoolCards.length

    // Both deck and pool modes now work the same: checked = in deck
    const inAspectAllChecked = inAspectTotal > 0 && inAspectDeckCards.length === inAspectTotal
    const outAspectAllChecked = outAspectTotal > 0 && outAspectDeckCards.length === outAspectTotal

    const handleInAspectToggle = () => {
      if (inAspectAllChecked) {
        moveToPool(inAspectDeckCards.map(([id]) => id))
      } else {
        moveToDeck(inAspectPoolCards.map(([id]) => id))
      }
    }

    const handleOutAspectToggle = () => {
      if (outAspectAllChecked) {
        moveToPool(outAspectDeckCards.map(([id]) => id))
      } else {
        moveToDeck(outAspectPoolCards.map(([id]) => id))
      }
    }

    return (
      <div style={{ marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem', cursor: 'pointer', color: 'white', fontSize: '0.8rem' }}>
          <input
            type="checkbox"
            checked={inAspectAllChecked}
            onChange={handleInAspectToggle}
            style={{ width: '14px', height: '14px' }}
          />
          <span style={{ textTransform: 'uppercase' }}>In Aspect</span>
          <span style={{ display: 'flex', gap: '2px' }}>{myAspects.map((a, i) => <span key={i}>{getAspectSymbol(a, 'small')}</span>)}</span>
          <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.75rem' }}>
            {inAspectDeckCards.length}/{inAspectTotal}
          </span>
        </label>
        {outAspects.length > 0 && outAspectTotal > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem', cursor: 'pointer', color: 'white', fontSize: '0.8rem' }}>
            <input
              type="checkbox"
              checked={outAspectAllChecked}
              onChange={handleOutAspectToggle}
              style={{ width: '14px', height: '14px' }}
            />
            <span style={{ textTransform: 'uppercase' }}>Out of Aspect</span>
            <span style={{ display: 'flex', gap: '2px' }}>{outAspects.map((a, i) => <span key={i}>{getAspectSymbol(a, 'small')}</span>)}</span>
            <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.75rem' }}>
              {outAspectDeckCards.length}/{outAspectTotal}
            </span>
          </label>
        )}
      </div>
    )
  }

  // Render hierarchical aspect filters for color aspects
  const renderColorAspectFilters = () => {
    return ['Vigilance', 'Command', 'Aggression', 'Cunning'].map(aspect => {
      const subGroups = [
        { key: `${aspect}|Villainy`, label: `${aspect} + Villainy`, aspects: [aspect, 'Villainy'] },
        { key: `${aspect}|Heroism`, label: `${aspect} + Heroism`, aspects: [aspect, 'Heroism'] },
        { key: `${aspect}|${aspect}`, label: `Double ${aspect}`, aspects: [aspect, aspect] },
        { key: aspect, label: `${aspect} (mono)`, aspects: [aspect] }
      ]

      let parentDeckCount = 0, parentPoolCount = 0, parentTotalCount = 0
      const validSubGroups = subGroups.map(sg => {
        const cards = getCardsForAspectCombo(sg.aspects)
        const total = cards.deck.length + cards.pool.length
        parentDeckCount += cards.deck.length
        parentPoolCount += cards.pool.length
        parentTotalCount += total
        return { ...sg, cards, total, deckCount: cards.deck.length, poolCount: cards.pool.length }
      }).filter(sg => sg.total > 0)

      if (parentTotalCount === 0) return null

      // Both modes now work the same: checked = in deck
      const displayCount = parentDeckCount
      const parentAllChecked = parentDeckCount === parentTotalCount
      const parentNoneChecked = parentDeckCount === 0
      const isExpanded = filterAspectsExpanded[aspect] || false

      const handleParentToggle = () => {
        if (parentAllChecked) {
          const cardIds = validSubGroups.flatMap(sg => sg.cards.deck.map(([id]) => id))
          moveToPool(cardIds)
        } else {
          const cardIds = validSubGroups.flatMap(sg => sg.cards.pool.map(([id]) => id))
          moveToDeck(cardIds)
        }
      }

      return (
        <div key={aspect} style={{ marginBottom: '0.25rem' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem', color: 'white', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => onFilterAspectsExpandedChange?.(prev => ({ ...prev, [aspect]: !isExpanded }))}
          >
            <span style={{ fontSize: '0.7rem', width: '12px' }}>
              {isExpanded ? '▼' : '▶'}
            </span>
            <input
              type="checkbox"
              checked={parentAllChecked}
              ref={el => { if (el) el.indeterminate = !parentAllChecked && !parentNoneChecked }}
              onClick={(e) => e.stopPropagation()}
              onChange={handleParentToggle}
              style={{ width: '14px', height: '14px' }}
            />
            {getAspectSymbol(aspect, 'small')}
            <span style={{ textTransform: 'uppercase' }}>{aspect}</span>
            <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.75rem' }}>{displayCount}/{parentTotalCount}</span>
          </div>
          {isExpanded && validSubGroups.map(sg => {
            // Both modes now work the same: checked = in deck
            const sgDisplayCount = sg.deckCount
            const sgAllChecked = sg.deckCount === sg.total

            const handleSubGroupToggle = () => {
              if (sgAllChecked) {
                moveToPool(sg.cards.deck.map(([id]) => id))
              } else {
                moveToDeck(sg.cards.pool.map(([id]) => id))
              }
            }

            return (
              <label key={sg.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.15rem 0.2rem 0.15rem 1.75rem', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={sgAllChecked}
                  onChange={handleSubGroupToggle}
                  style={{ width: '12px', height: '12px' }}
                />
                <span style={{ display: 'flex', gap: '1px' }}>{sg.aspects.map((a, i) => <span key={i}>{getAspectSymbol(a, 'small')}</span>)}</span>
                <span style={{ textTransform: 'uppercase' }}>{sg.label}</span>
                <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.7rem' }}>{sgDisplayCount}/{sg.total}</span>
              </label>
            )
          })}
        </div>
      )
    })
  }

  // Render flat aspect filters for Villainy, Heroism, Neutral
  const renderFlatAspectFilters = () => {
    return ['Villainy', 'Heroism', 'Neutral'].map(aspect => {
      const getCardsForFlatAspect = () => {
        if (aspect === 'Neutral') {
          return {
            deck: getDeckCards(pos => !pos.card.aspects || (pos.card.aspects as string[]).length === 0),
            pool: getPoolCards(pos => !pos.card.aspects || (pos.card.aspects as string[]).length === 0)
          }
        }
        return {
          deck: getDeckCards(pos => {
            const aspects = (pos.card.aspects as string[]) || []
            return aspects.length > 0 && aspects.every(a => a === aspect)
          }),
          pool: getPoolCards(pos => {
            const aspects = (pos.card.aspects as string[]) || []
            return aspects.length > 0 && aspects.every(a => a === aspect)
          })
        }
      }

      const cards = getCardsForFlatAspect()
      const deckCount = cards.deck.length
      const poolCount = cards.pool.length
      const totalCount = deckCount + poolCount

      if (totalCount === 0 && aspect !== 'Neutral') return null

      // Both modes now work the same: checked = in deck
      const displayCount = deckCount
      const allChecked = totalCount > 0 && deckCount === totalCount

      const handleToggle = () => {
        if (allChecked) {
          moveToPool(cards.deck.map(([id]) => id))
        } else {
          moveToDeck(cards.pool.map(([id]) => id))
        }
      }

      return (
        <div key={aspect} style={{ marginBottom: '0.25rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem', color: 'white', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none' }}>
            <span style={{ fontSize: '0.7rem', width: '12px' }}></span>
            <input
              type="checkbox"
              checked={allChecked}
              onChange={handleToggle}
              style={{ width: '14px', height: '14px' }}
            />
            {aspect !== 'Neutral' && getAspectSymbol(aspect, 'small')}
            <span style={{ textTransform: 'uppercase' }}>{aspect}</span>
            <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.75rem' }}>{displayCount}/{totalCount}</span>
          </label>
        </div>
      )
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1999, background: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      />
      {/* Modal */}
      <div
        className="filter-modal"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 2000,
          background: 'rgba(20,20,20,0.98)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: '12px',
          padding: '1rem',
          minWidth: '280px',
          maxWidth: '90vw',
          backdropFilter: 'blur(10px)',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          textTransform: 'none'
        }}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.5rem' }}>
          <span style={{ color: 'white', fontSize: '1rem', fontWeight: 'bold', textTransform: 'uppercase' }}>{title}</span>
          <Button variant="icon" size="sm" onClick={onClose}>×</Button>
        </div>

        {/* In/Out Aspect Filters */}
        {renderInOutAspectFilters()}

        {/* Color Aspect Filters */}
        {renderColorAspectFilters()}

        {/* Flat Aspect Filters */}
        {renderFlatAspectFilters()}
      </div>
    </>
  )
}

export default AspectFilterModal
