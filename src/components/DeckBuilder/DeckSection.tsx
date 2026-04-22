// @ts-nocheck
/**
 * DeckSection Component
 *
 * Renders the Deck section in grid view.
 * Shows cards currently in the deck, grouped by sort option.
 * Uses DeckBuilderContext for shared state.
 */

import type { ReactNode, RefObject, MouseEvent } from 'react'
import { useDeckBuilder } from '../../contexts/DeckBuilderContext'
import { SectionHeader } from './SectionHeader'
import { GroupHeader } from './GroupHeader'
import { CardGrid } from './CardGrid'
import type { CardGroup } from './CardGrid'
import Button from '../Button'
import { sortGroupKeys, createGetGroupKey, createDefaultSortFn, createGroupCardSortFn } from '../../utils/cardSort'
import { calculateAspectPenalty } from '../../services/cards/aspectPenalties'
import type { SortOption } from './SortControls'
import type { CardPosition } from './AspectPenaltyToggle'

interface CardWithPosition {
  cardId: string
  position: CardPosition
}

type CardRenderer = (card: unknown, index: number) => ReactNode

export interface DeckSectionProps {
  getDeckCards: () => CardWithPosition[]
  getPoolCards: () => CardWithPosition[]
  groupCardsByName: (cards: CardWithPosition[]) => CardGroup[]
  renderCardStack: (group: CardGroup, renderCard: CardRenderer) => ReactNode
  createCardRenderer: (leaderCard: CardPosition['card'] | null, baseCard: CardPosition['card'] | null, options?: { showDisabled?: boolean }) => CardRenderer
  getAspectSymbol: (aspect: string, size: string) => ReactNode
  getDefaultAspectSortKey: (card: CardPosition['card']) => string
  getAspectKey: (card: CardPosition['card']) => string
  deckExpanded: boolean
  setDeckExpanded: (expanded: boolean) => void
  deckGroupsExpanded: Record<string, boolean>
  setDeckGroupsExpanded: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void
  deckFilterOpen: boolean
  setDeckFilterOpen: (open: boolean) => void
  setPoolFilterOpen: (open: boolean) => void
  setFilterAspectsExpanded: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void
  deckBlocksRowRef: RefObject<HTMLDivElement | null>
}

export function DeckSection({
  getDeckCards,
  getPoolCards,
  groupCardsByName,
  renderCardStack,
  createCardRenderer,
  getAspectSymbol,
  getDefaultAspectSortKey,
  getAspectKey,
  deckExpanded,
  setDeckExpanded,
  deckGroupsExpanded,
  setDeckGroupsExpanded,
  deckFilterOpen,
  setDeckFilterOpen,
  setPoolFilterOpen,
  setFilterAspectsExpanded,
  deckBlocksRowRef,
}: DeckSectionProps) {
  // Get values from context
  const {
    deckSortOption,
    setDeckSortOption,
    leaderCard,
    baseCard,
    showDeckAspectPenalties,
    setShowDeckAspectPenalties,
    moveCardsToDeck,
    moveCardsToPool,
  } = useDeckBuilder()

  const deckCards = getDeckCards()

  // Toggle group expanded state
  const toggleDeckGroupExpanded = (key: string) => {
    setDeckGroupsExpanded(prev => ({
      ...prev,
      [key]: prev[key] === false ? true : false
    }))
  }

  // Check if group is expanded (default true)
  const isDeckGroupExpanded = (key: string) => deckGroupsExpanded[key] !== false

  // Helper to determine if a group key is a mono-aspect
  const isMonoAspect = (key: string) => {
    if (deckSortOption !== 'aspect') return false
    return key === 'A_Vigilance' || key === 'B_Command' || key === 'C_Aggression' || key === 'D_Cunning'
  }

  // Render content based on sort option
  const renderDeckContent = () => {
    if (deckCards.length === 0 && !deckExpanded) {
      return null
    }

    // Default sort - flat container
    if (deckSortOption === 'default') {
      const sortedDeckCards = [...deckCards].sort(createDefaultSortFn(getDefaultAspectSortKey))
      const groupedCards = groupCardsByName(sortedDeckCards)

      return (
        <div className="card-block deck-flat-container" style={{ width: '100%' }}>
          <div className="card-block-content">
            <CardGrid
              groups={groupedCards}
              renderCardStack={renderCardStack}
              renderCard={createCardRenderer(leaderCard, baseCard, { showDisabled: true, showAspectPenalties: showDeckAspectPenalties })}
            />
          </div>
        </div>
      )
    }

    // Grouped view
    const getGroupKey = createGetGroupKey(deckSortOption, {
      showAspectPenalties: showDeckAspectPenalties,
      leaderCard,
      baseCard,
      calculateAspectPenalty,
      getAspectKey
    })

    const cardSortFn = createGroupCardSortFn(deckSortOption, getDefaultAspectSortKey)

    // Group deck cards
    const groups: Record<string, CardWithPosition[]> = {}
    deckCards.forEach(({ cardId, position }) => {
      const key = getGroupKey(position.card)
      if (!groups[key]) groups[key] = []
      groups[key].push({ cardId, position })
    })

    // Group pool cards for +All button
    const poolCardsAll = getPoolCards()
    const poolGroups: Record<string, CardWithPosition[]> = {}
    poolCardsAll.forEach(({ cardId, position }) => {
      const key = getGroupKey(position.card)
      if (!poolGroups[key]) poolGroups[key] = []
      poolGroups[key].push({ cardId, position })
    })

    const sortedKeys = sortGroupKeys(Object.keys(groups), deckSortOption, '8+')

    return (
      <>
        {sortedKeys.map(groupKey => {
          const groupCards = groups[groupKey].sort(cardSortFn)
          const groupedByName = groupCardsByName(groupCards)
          const monoAspect = isMonoAspect(groupKey)
          const expanded = isDeckGroupExpanded(groupKey)
          const blockTypeClass = deckSortOption === 'type' ? 'type-block' : deckSortOption === 'cost' ? 'cost-block' : 'aspect-block'
          const matchingPoolCards = poolGroups[groupKey] || []

          return (
            <div key={groupKey} className={`card-block deck-group-block ${monoAspect ? 'mono-aspect' : ''} ${blockTypeClass} ${!expanded ? 'collapsed' : ''}`}>
              <div className="card-block-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  style={{ marginRight: '0.25rem', fontSize: '0.8rem', cursor: 'pointer' }}
                  onClick={() => toggleDeckGroupExpanded(groupKey)}
                >{expanded ? '▼' : '▶'}</span>
                <span style={{ cursor: 'pointer', marginRight: '0.5rem' }} onClick={() => toggleDeckGroupExpanded(groupKey)}>
                  <GroupHeader groupKey={groupKey} count={groupCards.length} sortOption={deckSortOption} getAspectSymbol={getAspectSymbol} />
                </span>
                <Button
                  variant="danger"
                  size="xs"
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation()
                    moveCardsToPool(groupCards.map(({ cardId }) => cardId))
                  }}
                  className="remove-all-button"
                  disabled={groupCards.length === 0}
                >
                  - All
                </Button>
                <Button
                  variant="primary"
                  size="xs"
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation()
                    moveCardsToDeck(matchingPoolCards.map(({ cardId }) => cardId))
                  }}
                  className="add-all-button"
                  disabled={matchingPoolCards.length === 0}
                >
                  + All
                </Button>
              </div>
              {expanded && <div className="card-block-content">
                <CardGrid
                  groups={groupedByName}
                  renderCardStack={renderCardStack}
                  renderCard={createCardRenderer(leaderCard, baseCard, { showDisabled: true, showAspectPenalties: showDeckAspectPenalties })}
                />
              </div>}
            </div>
          )
        })}
      </>
    )
  }

  return (
    <div style={{ order: 1 }}>
      <SectionHeader
        id="deck-header"
        title="Deck"
        mode="deck"
        cardCount={deckCards.length}
        expanded={deckExpanded}
        onToggleExpanded={() => setDeckExpanded(!deckExpanded)}
        onSortChange={setDeckSortOption}
        filterOpen={deckFilterOpen}
        onFilterToggle={() => { setDeckFilterOpen(!deckFilterOpen); setPoolFilterOpen(false); }}
        onFilterClose={() => setDeckFilterOpen(false)}
        onFilterAspectsExpandedChange={setFilterAspectsExpanded}
        showAspectPenalties={showDeckAspectPenalties}
        setShowAspectPenalties={setShowDeckAspectPenalties}
      />
      {deckExpanded && (
        <div className="blocks-deck-row" ref={deckBlocksRowRef}>
          {renderDeckContent()}
        </div>
      )}
    </div>
  )
}

export default DeckSection
