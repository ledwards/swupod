// @ts-nocheck
/**
 * ArenaDeckSection Component
 *
 * Bottom half of the arena view.
 * Shows deck cards in 8 cost columns (1-7, 8+) with two stacks per column:
 * - Units (top)
 * - Non-units (bottom)
 */

import { useMemo, useCallback, type MouseEvent } from 'react'
import { useDeckBuilder } from '../../contexts/DeckBuilderContext'
import { ArenaCardStack } from './ArenaCardStack'
import { calculateAspectPenalty } from '../../services/cards/aspectPenalties'
import CostIcon from '../CostIcon'
import type { CardData } from '../Card'

interface PoolCardEntry {
  cardId: string
  position: {
    card: CardData
    section: string
    visible: boolean
    enabled?: boolean
  }
}

interface CardPosition {
  card: CardData
  section: string
  visible: boolean
  enabled?: boolean
  [key: string]: unknown
}

interface CardEntry {
  cardId: string
  position: CardPosition
}

interface GroupedCardEntry {
  cardId: string  // First card's ID (for click handling)
  cardIds: string[]  // All card IDs in this group
  position: CardPosition
  quantity: number
}

export interface ArenaDeckSectionProps {
  onCardClick?: (cardId: string, e: MouseEvent) => void
  onCardMouseEnter?: (cardId: string, card: CardData, e: MouseEvent) => void
  onCardMouseLeave?: () => void
  onCardTouchStart?: (cardId: string, card: CardData) => void
  onCardTouchEnd?: () => void
}

// Cost columns: 1-7 and 8+
const COST_BUCKETS = ['1', '2', '3', '4', '5', '6', '7', '8+']

export function ArenaDeckSection({
  onCardClick,
  onCardMouseEnter,
  onCardMouseLeave,
  onCardTouchStart,
  onCardTouchEnd,
}: ArenaDeckSectionProps) {
  const {
    cardPositions,
    leaderCard,
    baseCard,
    showDeckAspectPenalties,
    setShowDeckAspectPenalties,
    hoveredCard,
    selectedCards,
    toggleCardSection,
    deckCardDensity,
  } = useDeckBuilder()

  // Get deck cards (not leaders/bases)
  const deckCards = useMemo((): CardEntry[] => {
    return Object.entries(cardPositions)
      .filter(([_, pos]) =>
        pos.section === 'deck' &&
        pos.visible &&
        !pos.card.isBase &&
        !pos.card.isLeader &&
        pos.enabled !== false
      )
      .map(([cardId, position]) => ({ cardId, position }))
  }, [cardPositions])

  // Calculate effective cost for a card
  const getEffectiveCost = useCallback((card: CardData): number => {
    const baseCost = card.cost ?? 0
    if (!showDeckAspectPenalties || !leaderCard || !baseCard) {
      return baseCost
    }
    const penalty = calculateAspectPenalty(card, leaderCard, baseCard)
    return baseCost + penalty
  }, [showDeckAspectPenalties, leaderCard, baseCard])

  // Get cost bucket for a card
  const getCostBucket = useCallback((card: CardData): string => {
    const effectiveCost = getEffectiveCost(card)
    if (effectiveCost >= 8) return '8+'
    if (effectiveCost < 1) return '1'
    return String(effectiveCost)
  }, [getEffectiveCost])

  // Check if card is a unit
  const isUnit = (card: CardData): boolean => {
    return card.type === 'Unit'
  }

  // Group cards by cost bucket, then by unit/non-unit, then by name (for quantities)
  const cardsByBucket = useMemo(() => {
    const buckets: Record<string, { units: GroupedCardEntry[]; nonUnits: GroupedCardEntry[] }> = {}
    COST_BUCKETS.forEach(bucket => {
      buckets[bucket] = { units: [], nonUnits: [] }
    })

    // First, collect all cards by bucket and type
    const tempBuckets: Record<string, { units: CardEntry[]; nonUnits: CardEntry[] }> = {}
    COST_BUCKETS.forEach(bucket => {
      tempBuckets[bucket] = { units: [], nonUnits: [] }
    })

    deckCards.forEach(entry => {
      const bucket = getCostBucket(entry.position.card)
      if (tempBuckets[bucket]) {
        if (isUnit(entry.position.card)) {
          tempBuckets[bucket].units.push(entry)
        } else {
          tempBuckets[bucket].nonUnits.push(entry)
        }
      }
    })

    // Aspect color sort order
    const ASPECT_SORT_ORDER: Record<string, number> = {
      'Vigilance': 0,
      'Command': 1,
      'Aggression': 2,
      'Cunning': 3,
      'Villainy': 4,
      'Heroism': 5,
    }

    const getAspectSortValue = (card: CardData): number => {
      const aspects = card.aspects || []
      if (aspects.length === 0) return 999 // Neutral goes last
      // Use the lowest-ordered aspect
      let best = 999
      for (const a of aspects) {
        const val = ASPECT_SORT_ORDER[a]
        if (val !== undefined && val < best) best = val
      }
      return best
    }

    // Group by card name and create grouped entries
    const groupByName = (cards: CardEntry[]): GroupedCardEntry[] => {
      const grouped = new Map<string, CardEntry[]>()
      cards.forEach(entry => {
        const name = entry.position.card.name || entry.cardId
        if (!grouped.has(name)) {
          grouped.set(name, [])
        }
        grouped.get(name)!.push(entry)
      })

      const result: GroupedCardEntry[] = []
      grouped.forEach((entries) => {
        result.push({
          cardId: entries[0].cardId,
          cardIds: entries.map(e => e.cardId),
          position: entries[0].position,
          quantity: entries.length,
        })
      })

      // Sort by: cost ASC, then aspect color order, then name
      result.sort((a, b) => {
        const cardA = a.position.card
        const cardB = b.position.card

        // Cost ASC
        const costA = cardA.cost ?? 0
        const costB = cardB.cost ?? 0
        if (costA !== costB) return costA - costB

        // Aspect color order
        const aspectA = getAspectSortValue(cardA)
        const aspectB = getAspectSortValue(cardB)
        if (aspectA !== aspectB) return aspectA - aspectB

        // Alphabetical
        return (cardA.name || '').localeCompare(cardB.name || '')
      })

      return result
    }

    // Process each bucket
    Object.keys(tempBuckets).forEach(bucket => {
      buckets[bucket].units = groupByName(tempBuckets[bucket].units)
      buckets[bucket].nonUnits = groupByName(tempBuckets[bucket].nonUnits)
    })

    return buckets
  }, [deckCards, getCostBucket])

  // Calculate penalty for display
  const calculatePenalty = useCallback((card: CardData): number => {
    if (!leaderCard || !baseCard) return 0
    return calculateAspectPenalty(card, leaderCard, baseCard)
  }, [leaderCard, baseCard])

  // Handle card click - toggle between deck and pool
  const handleCardClick = useCallback((cardId: string, e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!e.shiftKey) {
      toggleCardSection(cardId)
    }
    onCardClick?.(cardId, e)
  }, [toggleCardSection, onCardClick])

  // Get pool cards for utility functions
  const poolCards = useMemo((): PoolCardEntry[] => {
    return Object.entries(cardPositions)
      .filter(([_, pos]) =>
        (pos.section === 'sideboard' || pos.enabled === false) &&
        pos.visible &&
        !pos.card.isBase &&
        !pos.card.isLeader
      )
      .map(([cardId, position]) => ({ cardId, position: position as PoolCardEntry['position'] }))
  }, [cardPositions])

  // Helper: save scroll position before bulk card moves, restore after
  const withScrollLock = useCallback((fn: () => void) => {
    const scrollY = window.scrollY
    fn()
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY)
    })
  }, [])

  // Move all pool cards to deck
  const handleAddAll = useCallback(() => {
    withScrollLock(() => {
      poolCards.forEach(({ cardId }) => {
        toggleCardSection(cardId)
      })
    })
  }, [poolCards, toggleCardSection, withScrollLock])

  // Move all deck cards to pool
  const handleRemoveAll = useCallback(() => {
    withScrollLock(() => {
      deckCards.forEach(({ cardId }) => {
        toggleCardSection(cardId)
      })
    })
  }, [deckCards, toggleCardSection, withScrollLock])

  // Swap pool and deck
  const handleSwap = useCallback(() => {
    withScrollLock(() => {
      const poolCardIds = poolCards.map(({ cardId }) => cardId)
      const deckCardIds = deckCards.map(({ cardId }) => cardId)
      poolCardIds.forEach(cardId => toggleCardSection(cardId))
      deckCardIds.forEach(cardId => toggleCardSection(cardId))
    })
  }, [poolCards, deckCards, toggleCardSection, withScrollLock])

  // Add all in-aspect cards to deck
  const handleAddInAspect = useCallback(() => {
    withScrollLock(() => {
      poolCards.forEach(({ cardId, position }) => {
        const penalty = calculatePenalty(position.card)
        if (penalty === 0) {
          toggleCardSection(cardId)
        }
      })
    })
  }, [poolCards, calculatePenalty, toggleCardSection, withScrollLock])

  // Remove all out-of-aspect cards from deck
  const handleRemoveOutOfAspect = useCallback(() => {
    withScrollLock(() => {
      deckCards.forEach(({ cardId, position }) => {
        const penalty = calculatePenalty(position.card)
        if (penalty > 0) {
          toggleCardSection(cardId)
        }
      })
    })
  }, [deckCards, calculatePenalty, toggleCardSection, withScrollLock])

  const hasLeaderAndBase = leaderCard && baseCard

  // Calculate disabled states for buttons
  const allCardsInDeck = poolCards.length === 0
  const allCardsInPool = deckCards.length === 0
  const allInAspectInDeck = hasLeaderAndBase && poolCards.every(({ position }) => calculatePenalty(position.card) > 0)
  const noOutOfAspectInDeck = hasLeaderAndBase && deckCards.every(({ position }) => calculatePenalty(position.card) === 0)

  return (
    <div className="arena-deck-section">
      <div className="arena-deck-header">
        <h3 className="arena-section-title">Deck ({deckCards.length} cards)</h3>

        <div className="arena-utility-buttons">
          <span className="arena-utility-label">Actions:</span>
          <button
            className="arena-utility-button primary"
            onClick={handleAddAll}
            title="Move all pool cards to deck"
            disabled={allCardsInDeck}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            All
          </button>
          <button
            className="arena-utility-button danger"
            onClick={handleRemoveAll}
            title="Move all deck cards to pool"
            disabled={allCardsInPool}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14" />
            </svg>
            All
          </button>
          <button
            className="arena-utility-button gold"
            onClick={handleSwap}
            title="Swap pool and deck"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 16l-4-4 4-4M17 8l4 4-4 4M3 12h18" />
            </svg>
            Swap
          </button>

          {hasLeaderAndBase && (
            <>
              <button
                className="arena-utility-button primary"
                onClick={handleAddInAspect}
                title="Add all in-aspect cards to deck"
                disabled={allInAspectInDeck}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
                In Aspect
              </button>
              <button
                className="arena-utility-button danger"
                onClick={handleRemoveOutOfAspect}
                title="Remove all out-of-aspect cards from deck"
                disabled={noOutOfAspectInDeck}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
                Out of Aspect
              </button>
            </>
          )}

          <div className="arena-utility-separator" />
          <button
            className={`arena-utility-button toggle ${hasLeaderAndBase ? (showDeckAspectPenalties ? 'active' : '') : 'disabled-red'}`}
            onClick={() => hasLeaderAndBase && setShowDeckAspectPenalties(!showDeckAspectPenalties)}
            title={hasLeaderAndBase ? "Toggle aspect penalty display" : "Select leader and base to enable penalties"}
            disabled={!hasLeaderAndBase}
          >
            {showDeckAspectPenalties ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
            Aspect Penalties
          </button>
        </div>
      </div>

      <div className="arena-cost-columns">
        {COST_BUCKETS.map(bucket => {
          const { units, nonUnits } = cardsByBucket[bucket]
          // Calculate total quantities (sum of all quantities, not just group count)
          const unitsQty = units.reduce((sum, entry) => sum + (entry.quantity || 1), 0)
          const nonUnitsQty = nonUnits.reduce((sum, entry) => sum + (entry.quantity || 1), 0)
          const totalCount = unitsQty + nonUnitsQty
          const hasZeroCostCards = bucket === '1' && [...units, ...nonUnits].some(e => (e.position.card.cost ?? 0) === 0)
          return (
            <div key={bucket} className="arena-cost-column">
              <div className="arena-cost-header">
                {bucket === '1' && hasZeroCostCards ? (
                  <>
                    <CostIcon cost="0" size={28} />
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>—</span>
                    <CostIcon cost="1" size={28} />
                  </>
                ) : (
                  <CostIcon cost={bucket} size={28} />
                )}
                {totalCount > 0 && (
                  <span className="cost-count">({totalCount})</span>
                )}
              </div>
              {/* Units stack - only show if has units */}
              {unitsQty > 0 && (
                <>
                  <div className="arena-stack-label">Unit ({unitsQty})</div>
                  <ArenaCardStack
                    cards={units}
                    showPenalty={showDeckAspectPenalties}
                    leaderCard={leaderCard}
                    baseCard={baseCard}
                    calculatePenalty={calculatePenalty}
                    onCardClick={handleCardClick}
                    onCardMouseEnter={onCardMouseEnter}
                    onCardMouseLeave={onCardMouseLeave}
                    onCardTouchStart={onCardTouchStart}
                    onCardTouchEnd={onCardTouchEnd}
                    hoveredCard={hoveredCard}
                    selectedCards={selectedCards}
                    density={deckCardDensity}
                  />
                </>
              )}
              {/* Non-units stack - only show if has non-units */}
              {nonUnitsQty > 0 && (
                <div className={`arena-nonunits-stack ${unitsQty === 0 ? 'no-units-above' : ''}`}>
                  <div className="arena-stack-label">Non-Unit ({nonUnitsQty})</div>
                  <ArenaCardStack
                    cards={nonUnits}
                    showPenalty={showDeckAspectPenalties}
                    leaderCard={leaderCard}
                    baseCard={baseCard}
                    calculatePenalty={calculatePenalty}
                    onCardClick={handleCardClick}
                    onCardMouseEnter={onCardMouseEnter}
                    onCardMouseLeave={onCardMouseLeave}
                    onCardTouchStart={onCardTouchStart}
                    onCardTouchEnd={onCardTouchEnd}
                    hoveredCard={hoveredCard}
                    selectedCards={selectedCards}
                    density={deckCardDensity}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ArenaDeckSection
