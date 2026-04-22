// @ts-nocheck
/**
 * PoolSection Component
 *
 * Renders the Pool (sideboard) section in grid view.
 * Shows cards not currently in the deck, grouped by sort option.
 * Uses DeckBuilderContext for shared state.
 */

import type { ReactNode, MouseEvent } from 'react'
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

export interface PoolSectionProps {
  getPoolCards: () => CardWithPosition[]
  getDeckCards: () => CardWithPosition[]
  groupCardsByName: (cards: CardWithPosition[]) => CardGroup[]
  renderCardStack: (group: CardGroup, renderCard: CardRenderer) => ReactNode
  createCardRenderer: (leaderCard: CardPosition['card'] | null, baseCard: CardPosition['card'] | null, options?: { showDisabled?: boolean }) => CardRenderer
  getAspectSymbol: (aspect: string, size: string) => ReactNode
  getDefaultAspectSortKey: (card: CardPosition['card']) => string
  getAspectKey: (card: CardPosition['card']) => string
  sideboardExpanded: boolean
  setSideboardExpanded: (expanded: boolean) => void
  poolGroupsExpanded: Record<string, boolean>
  setPoolGroupsExpanded: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void
  poolFilterOpen: boolean
  setPoolFilterOpen: (open: boolean) => void
  setDeckFilterOpen: (open: boolean) => void
  setFilterAspectsExpanded: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void
}

export function PoolSection({
  getPoolCards,
  getDeckCards,
  groupCardsByName,
  renderCardStack,
  createCardRenderer,
  getAspectSymbol,
  getDefaultAspectSortKey,
  getAspectKey,
  sideboardExpanded,
  setSideboardExpanded,
  poolGroupsExpanded,
  setPoolGroupsExpanded,
  poolFilterOpen,
  setPoolFilterOpen,
  setDeckFilterOpen,
  setFilterAspectsExpanded,
}: PoolSectionProps) {
  // Get values from context
  const {
    poolSortOption,
    setPoolSortOption,
    leaderCard,
    baseCard,
    showPoolAspectPenalties,
    setShowPoolAspectPenalties,
    moveCardsToDeck,
    moveCardsToPool,
  } = useDeckBuilder()

  const poolCards = getPoolCards()

  // Toggle group expanded state
  const toggleGroupExpanded = (key: string) => {
    setPoolGroupsExpanded(prev => ({
      ...prev,
      [key]: prev[key] === false ? true : false
    }))
  }

  // Check if group is expanded (default true)
  const isGroupExpanded = (key: string) => poolGroupsExpanded[key] !== false

  // Helper to determine if a group key is a mono-aspect
  const isMonoAspect = (key: string) => {
    if (poolSortOption !== 'aspect') return false
    return key === 'A_Vigilance' || key === 'B_Command' || key === 'C_Aggression' || key === 'D_Cunning'
  }

  // Render content based on sort option
  const renderPoolContent = () => {
    if (poolCards.length === 0) {
      return null
    }

    // Default sort - flat container
    if (poolSortOption === 'default') {
      const sortedPoolCards = [...poolCards].sort(createDefaultSortFn(getDefaultAspectSortKey))
      const groupedCards = groupCardsByName(sortedPoolCards)

      return (
        <div className="blocks-pool-row">
          {sideboardExpanded && (
            <div className="card-block pool-flat-container" style={{ width: '100%' }}>
              <div className="card-block-content">
                <CardGrid
                  groups={groupedCards}
                  renderCardStack={renderCardStack}
                  renderCard={createCardRenderer(leaderCard, baseCard, { showAspectPenalties: showPoolAspectPenalties })}
                />
              </div>
            </div>
          )}
        </div>
      )
    }

    // Grouped view
    const getGroupKey = createGetGroupKey(poolSortOption, {
      showAspectPenalties: showPoolAspectPenalties,
      leaderCard,
      baseCard,
      calculateAspectPenalty,
      getAspectKey
    })

    const cardSortFn = createGroupCardSortFn(poolSortOption, getDefaultAspectSortKey)

    // Group pool cards
    const groups: Record<string, CardWithPosition[]> = {}
    poolCards.forEach(({ cardId, position }) => {
      const key = getGroupKey(position.card)
      if (!groups[key]) groups[key] = []
      groups[key].push({ cardId, position })
    })

    // Group deck cards for -All button
    const deckCardsAll = getDeckCards()
    const deckGroups: Record<string, CardWithPosition[]> = {}
    deckCardsAll.forEach(({ cardId, position }) => {
      const key = getGroupKey(position.card)
      if (!deckGroups[key]) deckGroups[key] = []
      deckGroups[key].push({ cardId, position })
    })

    const sortedKeys = sortGroupKeys(Object.keys(groups), poolSortOption, '8+')

    return (
      <div className="blocks-pool-row">
        {sideboardExpanded && sortedKeys.map(groupKey => {
          const groupCards = groups[groupKey].sort(cardSortFn)
          const groupedByName = groupCardsByName(groupCards)
          const monoAspect = isMonoAspect(groupKey)
          const expanded = isGroupExpanded(groupKey)
          const blockTypeClass = poolSortOption === 'type' ? 'type-block' : poolSortOption === 'cost' ? 'cost-block' : 'aspect-block'
          const matchingDeckCards = deckGroups[groupKey] || []

          return (
            <div key={groupKey} className={`card-block pool-group-block ${monoAspect ? 'mono-aspect' : ''} ${blockTypeClass} ${!expanded ? 'collapsed' : ''}`}>
              <div className="card-block-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  style={{ marginRight: '0.25rem', fontSize: '0.8rem', cursor: 'pointer' }}
                  onClick={() => toggleGroupExpanded(groupKey)}
                >{expanded ? '▼' : '▶'}</span>
                <span style={{ cursor: 'pointer', marginRight: '0.5rem' }} onClick={() => toggleGroupExpanded(groupKey)}>
                  <GroupHeader groupKey={groupKey} count={groupCards.length} sortOption={poolSortOption} getAspectSymbol={getAspectSymbol} />
                </span>
                <Button
                  variant="primary"
                  size="xs"
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation()
                    moveCardsToDeck(groupCards.map(({ cardId }) => cardId))
                  }}
                  className="add-all-button"
                  disabled={groupCards.length === 0}
                >
                  + All
                </Button>
                <Button
                  variant="danger"
                  size="xs"
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation()
                    moveCardsToPool(matchingDeckCards.map(({ cardId }) => cardId))
                  }}
                  className="remove-all-button"
                  disabled={matchingDeckCards.length === 0}
                >
                  - All
                </Button>
              </div>
              {expanded && <div className="card-block-content">
                <CardGrid
                  groups={groupedByName}
                  renderCardStack={renderCardStack}
                  renderCard={createCardRenderer(leaderCard, baseCard, { showAspectPenalties: showPoolAspectPenalties })}
                />
              </div>}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ order: 0 }}>
      <SectionHeader
        id="pool-header"
        title="Pool"
        mode="pool"
        cardCount={poolCards.length}
        expanded={sideboardExpanded}
        onToggleExpanded={() => setSideboardExpanded(!sideboardExpanded)}
        onSortChange={setPoolSortOption}
        filterOpen={poolFilterOpen}
        onFilterToggle={() => { setPoolFilterOpen(!poolFilterOpen); setDeckFilterOpen(false); }}
        onFilterClose={() => setPoolFilterOpen(false)}
        onFilterAspectsExpandedChange={setFilterAspectsExpanded}
        showAspectPenalties={showPoolAspectPenalties}
        setShowAspectPenalties={setShowPoolAspectPenalties}
      />
      {renderPoolContent()}
    </div>
  )
}

export default PoolSection
