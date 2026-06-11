// @ts-nocheck
/**
 * LeaderBaseSelector Component
 *
 * Displays the Leaders and Bases rows for selection in the deck builder.
 * Shows available leaders and bases from the pool, allows selecting
 * the active leader and base for the deck.
 *
 * Can use DeckBuilderContext or receive props directly.
 */

import { useMemo, useCallback, type MouseEvent } from 'react'
import Card from '../Card'
import { compareByAspectTypeCostName } from '../../services/cards/cardSorting'
import { useDeckBuilder } from '../../contexts/DeckBuilderContext'
import type { CardPosition } from './AspectPenaltyToggle'
import type { SortOption } from './SortControls'

interface CardData {
  aspects?: string[]
  rarity?: string
  isLeader?: boolean
  isBase?: boolean
  [key: string]: unknown
}

interface CardWithPosition {
  cardId: string
  position: CardPosition
}

// Get aspect combination key for sorting
const getAspectKey = (card: CardData): string => {
  const aspects = card.aspects || []
  if (aspects.length === 0) return 'ZZZ_Neutral'

  if (aspects.length === 1) {
    const aspect = aspects[0]
    const priority: Record<string, string> = {
      'Vigilance': 'A_Vigilance',
      'Command': 'B_Command',
      'Aggression': 'C_Aggression',
      'Cunning': 'D_Cunning',
      'Villainy': 'E_Villainy',
      'Heroism': 'F_Heroism'
    }
    return priority[aspect] || `G_${aspect}`
  }

  const sortedAspects = [...aspects].sort()
  return `H_${sortedAspects.join(' ')}`
}

export interface LeaderBaseSelectorProps {
  cardPositions?: Record<string, CardPosition>
  activeLeader?: string | null
  setActiveLeader?: (leader: string | null) => void
  activeBase?: string | null
  setActiveBase?: (base: string | null) => void
  selectedCards?: Set<string>
  hoveredCard?: string | null
  setHoveredCard?: (card: string | null) => void
  leadersExpanded?: boolean
  setLeadersExpanded?: (expanded: boolean) => void
  basesExpanded?: boolean
  setBasesExpanded?: (expanded: boolean) => void
  onCardMouseEnter?: (card: CardPosition['card'], e: MouseEvent) => void
  onCardMouseLeave?: () => void
  onCardTouchStart?: (card: CardPosition['card']) => void
  onCardTouchEnd?: () => void
  poolSortOption?: SortOption
  deckSortOption?: SortOption
  setShowAspectPenalties?: (show: boolean) => void
  isLoading?: boolean
  onAddStarterLeaders?: () => void
  hasStarterLeaders?: boolean
}

export function LeaderBaseSelector({
  cardPositions: cardPositionsProp,
  activeLeader: activeLeaderProp,
  setActiveLeader: setActiveLeaderProp,
  activeBase: activeBaseProp,
  setActiveBase: setActiveBaseProp,
  selectedCards: selectedCardsProp,
  hoveredCard: hoveredCardProp,
  setHoveredCard: setHoveredCardProp,
  leadersExpanded = true,
  setLeadersExpanded,
  basesExpanded = true,
  setBasesExpanded,
  onCardMouseEnter,
  onCardMouseLeave,
  onCardTouchStart,
  onCardTouchEnd,
  poolSortOption,
  deckSortOption,
  setShowAspectPenalties,
  isLoading = false,
  onAddStarterLeaders,
  hasStarterLeaders = false,
}: LeaderBaseSelectorProps) {
  // Try to get values from context
  let contextValue: ReturnType<typeof useDeckBuilder> | null = null
  try {
    contextValue = useDeckBuilder()
  } catch {
    // Not inside a provider
  }

  // Use props if provided, otherwise use context
  const cardPositions = cardPositionsProp ?? contextValue?.cardPositions ?? {}
  const activeLeader = activeLeaderProp ?? contextValue?.activeLeader
  const setActiveLeader = setActiveLeaderProp ?? contextValue?.setActiveLeader
  const activeBase = activeBaseProp ?? contextValue?.activeBase
  const setActiveBase = setActiveBaseProp ?? contextValue?.setActiveBase
  const selectedCards = selectedCardsProp ?? contextValue?.selectedCards ?? new Set<string>()
  const hoveredCard = hoveredCardProp ?? contextValue?.hoveredCard
  const setHoveredCard = setHoveredCardProp ?? contextValue?.setHoveredCard

  // Get leaders cards
  const leadersCards = useMemo((): CardWithPosition[] => {
    return Object.entries(cardPositions)
      .filter(([_, position]) => position.section === 'leaders-bases' && position.visible && position.card.isLeader)
      .map(([cardId, position]) => ({ cardId, position }))
      .sort((a, b) => compareByAspectTypeCostName(a.position.card, b.position.card))
  }, [cardPositions])

  // Get bases cards
  const basesCards = useMemo((): CardWithPosition[] => {
    return Object.entries(cardPositions)
      .filter(([_, position]) => position.section === 'leaders-bases' && position.visible && position.card.isBase)
      .map(([cardId, position]) => ({ cardId, position }))
      .sort((a, b) => {
        // Sort by rarity (common first)
        const aRarity = a.position.card.rarity as string | undefined
        const bRarity = b.position.card.rarity as string | undefined
        const aIsRare = aRarity === 'Rare' || aRarity === 'Legendary' || aRarity === 'Special'
        const bIsRare = bRarity === 'Rare' || bRarity === 'Legendary' || bRarity === 'Special'

        if (aIsRare && !bIsRare) return 1
        if (!aIsRare && bIsRare) return -1

        // Then by aspect
        const keyA = getAspectKey(a.position.card as CardData)
        const keyB = getAspectKey(b.position.card as CardData)
        return keyA.localeCompare(keyB)
      })
  }, [cardPositions])

  // Handle leader click
  const handleLeaderClick = useCallback((cardId: string) => {
    const newActiveLeader = activeLeader === cardId ? null : cardId
    setActiveLeader?.(newActiveLeader)
    // Show aspect penalties when selecting leader in cost mode
    if (newActiveLeader && (poolSortOption === 'cost' || deckSortOption === 'cost')) {
      setShowAspectPenalties?.(true)
    }
  }, [activeLeader, setActiveLeader, poolSortOption, deckSortOption, setShowAspectPenalties])

  // Handle base click
  const handleBaseClick = useCallback((cardId: string) => {
    const newActiveBase = activeBase === cardId ? null : cardId
    setActiveBase?.(newActiveBase)
  }, [activeBase, setActiveBase])

  // Handle card hover
  const handleMouseEnter = useCallback((cardId: string, card: CardPosition['card'], e: MouseEvent) => {
    setHoveredCard?.(cardId)
    onCardMouseEnter?.(card, e)
  }, [setHoveredCard, onCardMouseEnter])

  const handleMouseLeave = useCallback(() => {
    setHoveredCard?.(null)
    onCardMouseLeave?.()
  }, [setHoveredCard, onCardMouseLeave])

  const handleTouchStart = useCallback((card: CardPosition['card']) => {
    onCardTouchStart?.(card)
  }, [onCardTouchStart])

  const handleTouchEnd = useCallback(() => {
    onCardTouchEnd?.()
  }, [onCardTouchEnd])

  // Show skeleton placeholders while loading
  if (isLoading || (leadersCards.length === 0 && basesCards.length === 0)) {
    return (
      <>
        {/* Leaders Skeleton */}
        <div className="blocks-leaders-row">
          <div className={`card-block ${!leadersExpanded ? 'collapsed' : ''}`}>
            <h3
              className="card-block-header"
              onClick={(e) => {
                e.stopPropagation()
                setLeadersExpanded?.(!leadersExpanded)
              }}
              style={{ cursor: 'pointer' }}
            >
              <span style={{ marginRight: '0.5rem', fontSize: '0.8rem' }}>
                {leadersExpanded ? '▼' : '▶'}
              </span>
              <span>Leaders</span>
            </h3>
            {leadersExpanded && (
              <div className="card-block-content">
                <div className="leaders-bases-container">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="skeleton-card skeleton-card-landscape" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bases Skeleton */}
        <div className="blocks-bases-row">
          <div className={`card-block ${!basesExpanded ? 'collapsed' : ''}`}>
            <h3
              className="card-block-header"
              onClick={(e) => {
                e.stopPropagation()
                setBasesExpanded?.(!basesExpanded)
              }}
              style={{ cursor: 'pointer' }}
            >
              <span style={{ marginRight: '0.5rem', fontSize: '0.8rem' }}>
                {basesExpanded ? '▼' : '▶'}
              </span>
              <span>Bases</span>
            </h3>
            {basesExpanded && (
              <div className="card-block-content">
                <div className="leaders-bases-container bases-only">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="skeleton-card skeleton-card-landscape" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Leaders Row */}
      {leadersCards.length > 0 && (
        <div className="blocks-leaders-row">
          <div className={`card-block ${!leadersExpanded ? 'collapsed' : ''}`}>
            <h3
              className="card-block-header"
              onClick={(e) => {
                e.stopPropagation()
                setLeadersExpanded?.(!leadersExpanded)
              }}
              style={{ cursor: 'pointer' }}
            >
              <span style={{ marginRight: '0.5rem', fontSize: '0.8rem' }}>
                {leadersExpanded ? '▼' : '▶'}
              </span>
              <span>Leaders ({leadersCards.length})</span>
              {onAddStarterLeaders && (
                <button
                  className="add-starter-leaders-button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAddStarterLeaders()
                  }}
                  title={hasStarterLeaders ? "Remove starter deck leaders" : "Add this set's starter deck leaders"}
                >
                  {hasStarterLeaders ? '- Starter Leaders' : '+ Starter Leaders'}
                </button>
              )}
            </h3>
            {leadersExpanded && (
              <div className="card-block-content">
                <div className="leaders-bases-container">
                  {leadersCards.map(({ cardId, position }) => {
                    const card = position.card
                    const isSelected = selectedCards.has(cardId)
                    const isHovered = hoveredCard === cardId
                    const isActiveLeader = activeLeader === cardId

                    return (
                      <Card
                        key={cardId}
                        card={card}
                        selected={isSelected}
                        hovered={isHovered}
                        active={isActiveLeader}
                        onClick={() => handleLeaderClick(cardId)}
                        onMouseEnter={(e) => handleMouseEnter(cardId, card, e)}
                        onMouseLeave={handleMouseLeave}
                        onTouchStart={() => handleTouchStart(card)}
                        onTouchEnd={handleTouchEnd}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bases Row */}
      {basesCards.length > 0 && (
        <div className="blocks-bases-row">
          <div className={`card-block ${!basesExpanded ? 'collapsed' : ''}`}>
            <h3
              className="card-block-header"
              onClick={(e) => {
                e.stopPropagation()
                setBasesExpanded?.(!basesExpanded)
              }}
              style={{ cursor: 'pointer' }}
            >
              <span style={{ marginRight: '0.5rem', fontSize: '0.8rem' }}>
                {basesExpanded ? '▼' : '▶'}
              </span>
              <span>Bases ({basesCards.length})</span>
            </h3>
            {basesExpanded && (
              <div className="card-block-content">
                <div className="leaders-bases-container bases-only">
                  {basesCards.map(({ cardId, position }) => {
                    const card = position.card
                    const isSelected = selectedCards.has(cardId)
                    const isHovered = hoveredCard === cardId
                    const isActiveBase = activeBase === cardId

                    return (
                      <Card
                        key={cardId}
                        card={card}
                        selected={isSelected}
                        hovered={isHovered}
                        active={isActiveBase}
                        onClick={() => handleBaseClick(cardId)}
                        onMouseEnter={(e) => handleMouseEnter(cardId, card, e)}
                        onMouseLeave={handleMouseLeave}
                        onTouchStart={() => handleTouchStart(card)}
                        onTouchEnd={handleTouchEnd}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default LeaderBaseSelector
