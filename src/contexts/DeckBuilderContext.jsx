'use client'

/**
 * DeckBuilderContext
 *
 * Centralized state management for the DeckBuilder component.
 * Provides card positions, active leader/base, and common actions
 * to child components without prop drilling.
 *
 * Usage:
 *   // In parent:
 *   <DeckBuilderProvider initialCards={cards}>
 *     <DeckBuilder />
 *   </DeckBuilderProvider>
 *
 *   // In child:
 *   const { cardPositions, activeLeader, moveCardToDeck } = useDeckBuilder()
 */

import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { calculateAspectPenalty } from '../services/cards/aspectPenalties'

const DeckBuilderContext = createContext(null)

export function DeckBuilderProvider({
  children,
  initialCardPositions = {},
  initialActiveLeader = null,
  initialActiveBase = null,
}) {
  // Core card state
  const [cardPositions, setCardPositions] = useState(initialCardPositions)
  const [activeLeader, setActiveLeader] = useState(initialActiveLeader)
  const [activeBase, setActiveBase] = useState(initialActiveBase)

  // Selection state
  const [selectedCards, setSelectedCards] = useState(new Set())
  const [hoveredCard, setHoveredCard] = useState(null)

  // Filter modal state
  const [filterAspectsExpanded, setFilterAspectsExpanded] = useState({})
  const [deckFilterOpen, setDeckFilterOpen] = useState(false)
  const [poolFilterOpen, setPoolFilterOpen] = useState(false)

  // UI preferences
  const [showAspectPenalties, setShowAspectPenalties] = useState(false)
  const [viewMode, setViewMode] = useState('arena') // 'grid', 'list', or 'arena'
  const [poolSortOption, setPoolSortOption] = useState('cost')
  const [deckSortOption, setDeckSortOption] = useState('cost')
  const [filteredCardDisplay, setFilteredCardDisplay] = useState('fade') // 'fade' | 'hide'

  // Derived values
  const leaderCard = useMemo(() => {
    return activeLeader && cardPositions[activeLeader]?.card
  }, [activeLeader, cardPositions])

  const baseCard = useMemo(() => {
    return activeBase && cardPositions[activeBase]?.card
  }, [activeBase, cardPositions])

  // Get cards in deck section
  const deckCards = useMemo(() => {
    return Object.entries(cardPositions)
      .filter(([_, pos]) => pos.section === 'deck' && pos.visible && !pos.card.isBase && !pos.card.isLeader && pos.enabled !== false)
      .map(([cardId, pos]) => ({ cardId, ...pos }))
  }, [cardPositions])

  // Get cards in pool section
  const poolCards = useMemo(() => {
    return Object.entries(cardPositions)
      .filter(([_, pos]) => (pos.section === 'sideboard' || pos.enabled === false) && pos.visible && !pos.card.isBase && !pos.card.isLeader)
      .map(([cardId, pos]) => ({ cardId, ...pos }))
  }, [cardPositions])

  // Actions
  const moveCardToDeck = useCallback((cardId) => {
    setCardPositions(prev => ({
      ...prev,
      [cardId]: {
        ...prev[cardId],
        section: 'deck',
        enabled: true,
        x: 0,
        y: 0,
      }
    }))
  }, [])

  const moveCardToPool = useCallback((cardId) => {
    setCardPositions(prev => ({
      ...prev,
      [cardId]: {
        ...prev[cardId],
        section: 'sideboard',
        enabled: false,
        x: 0,
        y: 0,
      }
    }))
  }, [])

  const moveCardsToDeck = useCallback((cardIds) => {
    setCardPositions(prev => {
      const updated = { ...prev }
      cardIds.forEach(cardId => {
        updated[cardId] = { ...updated[cardId], section: 'deck', enabled: true, x: 0, y: 0 }
      })
      return updated
    })
  }, [])

  const moveCardsToPool = useCallback((cardIds) => {
    setCardPositions(prev => {
      const updated = { ...prev }
      cardIds.forEach(cardId => {
        updated[cardId] = { ...updated[cardId], section: 'sideboard', enabled: false, x: 0, y: 0 }
      })
      return updated
    })
  }, [])

  const toggleCardSection = useCallback((cardId) => {
    setCardPositions(prev => {
      const newSection = prev[cardId].section === 'deck' ? 'sideboard' : 'deck'
      const newEnabled = newSection === 'deck'
      return {
        ...prev,
        [cardId]: {
          ...prev[cardId],
          section: newSection,
          enabled: newEnabled,
          x: 0,
          y: 0,
        }
      }
    })
  }, [])

  const selectLeader = useCallback((cardId) => {
    setActiveLeader(cardId)
  }, [])

  const selectBase = useCallback((cardId) => {
    setActiveBase(cardId)
  }, [])

  // Calculate aspect penalty for a card
  const getAspectPenalty = useCallback((card) => {
    if (!leaderCard || !baseCard) return 0
    return calculateAspectPenalty(card, leaderCard, baseCard)
  }, [leaderCard, baseCard])

  // Card counts
  const deckCardCount = deckCards.length
  const poolCardCount = poolCards.length

  const value = useMemo(() => ({
    // Core state
    cardPositions,
    setCardPositions,
    activeLeader,
    setActiveLeader,
    activeBase,
    setActiveBase,

    // Derived cards
    leaderCard,
    baseCard,
    deckCards,
    poolCards,
    deckCardCount,
    poolCardCount,

    // Selection
    selectedCards,
    setSelectedCards,
    hoveredCard,
    setHoveredCard,

    // Filter state
    filterAspectsExpanded,
    setFilterAspectsExpanded,
    deckFilterOpen,
    setDeckFilterOpen,
    poolFilterOpen,
    setPoolFilterOpen,

    // UI preferences
    showAspectPenalties,
    setShowAspectPenalties,
    viewMode,
    setViewMode,
    poolSortOption,
    setPoolSortOption,
    deckSortOption,
    setDeckSortOption,
    filteredCardDisplay,
    setFilteredCardDisplay,

    // Actions
    moveCardToDeck,
    moveCardToPool,
    moveCardsToDeck,
    moveCardsToPool,
    toggleCardSection,
    selectLeader,
    selectBase,
    getAspectPenalty,
  }), [
    cardPositions,
    activeLeader,
    activeBase,
    leaderCard,
    baseCard,
    deckCards,
    poolCards,
    deckCardCount,
    poolCardCount,
    selectedCards,
    hoveredCard,
    filterAspectsExpanded,
    deckFilterOpen,
    poolFilterOpen,
    showAspectPenalties,
    viewMode,
    poolSortOption,
    deckSortOption,
    filteredCardDisplay,
    moveCardToDeck,
    moveCardToPool,
    moveCardsToDeck,
    moveCardsToPool,
    toggleCardSection,
    selectLeader,
    selectBase,
    getAspectPenalty,
  ])

  return (
    <DeckBuilderContext.Provider value={value}>
      {children}
    </DeckBuilderContext.Provider>
  )
}

export function useDeckBuilder() {
  const context = useContext(DeckBuilderContext)
  if (!context) {
    throw new Error('useDeckBuilder must be used within a DeckBuilderProvider')
  }
  return context
}

export default DeckBuilderContext
