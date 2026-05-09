// @ts-nocheck
/**
 * PoolListSection Component
 *
 * Renders the Pool section in list view (Deck and Sideboard subsections).
 * Supports grouping by cost or aspect.
 */

import type { ReactNode, MouseEvent, ChangeEvent } from 'react'
import CostIcon from '../CostIcon'
import { getRarityColor } from '../../utils/aspectColors'
import { ListTableHeader } from './ListTableHeader'
import type { TableSortMap } from './ListTableHeader'
import type { SortOption } from './SortControls'
import { useDeckBuilder } from '../../contexts/DeckBuilderContext'

interface CardData {
  name?: string
  subtitle?: string
  cost?: number
  rarity?: string
  isBase?: boolean
  isLeader?: boolean
  [key: string]: unknown
}

interface CardPositionData {
  section: string
  visible?: boolean
  enabled?: boolean
  card: CardData
  x?: number
  y?: number
}

interface CardWithData {
  cardId: string
  card: CardData
}

// Column configurations
const DECK_COLUMNS = [
  { field: 'name', label: 'Title' },
  { field: 'type', label: 'Type' },
  { field: 'cost', label: 'Cost' },
  { field: 'aspects', label: 'Aspects' },
  { field: 'rarity', label: 'Rarity' },
]

const SIDEBOARD_COLUMNS = [
  { field: 'name', label: 'Title' },
  { field: 'cost', label: 'Cost' },
  { field: 'aspects', label: 'Aspects' },
  { field: 'rarity', label: 'Rarity' },
]

// Fixed aspect order used for grouping in list/table view (deck + sideboard).
const ASPECT_ORDER = [
  'vigilance_villainy', 'vigilance_heroism', 'vigilance_vigilance', 'vigilance',
  'command_villainy', 'command_heroism', 'command_command', 'command',
  'aggression_villainy', 'aggression_heroism', 'aggression_aggression', 'aggression',
  'cunning_villainy', 'cunning_heroism', 'cunning_cunning', 'cunning',
  'villainy', 'heroism', 'villainy_heroism', 'neutral'
]

export interface PoolListSectionProps {
  cardPositions: Record<string, CardPositionData>
  setCardPositions: (fn: (prev: Record<string, CardPositionData>) => Record<string, CardPositionData>) => void
  deckSortOption: SortOption
  isDraftMode: boolean
  isInfiniteMode?: boolean
  tableSort: TableSortMap
  handleTableSort: (sectionId: string, field: string) => void
  defaultSort: (a: CardData, b: CardData) => number
  sortTableData: (a: CardData, b: CardData, field: string, direction: 'asc' | 'desc') => number
  getAspectIcons: (card: CardData) => ReactNode[]
  getDefaultAspectSortKey: (card: CardData) => string
  getFormattedType: (card: CardData) => string
  getAspectCombinationKey: (card: CardData) => string
  getAspectCombinationDisplayName: (key: string) => string
  getAspectCombinationIcons: (key: string) => ReactNode
  deckCostSectionsExpanded: Record<string | number, boolean>
  setDeckCostSectionsExpanded: (fn: (prev: Record<string | number, boolean>) => Record<string | number, boolean>) => void
  deckAspectSectionsExpanded: Record<string, boolean>
  setDeckAspectSectionsExpanded: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void
  sideboardAspectSectionsExpanded: Record<string, boolean>
  setSideboardAspectSectionsExpanded: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void
  onCardHover: (cardId: string, card: CardData, e: MouseEvent) => void
  onCardLeave: () => void
}

export function PoolListSection({
  cardPositions,
  setCardPositions,
  deckSortOption,
  isDraftMode,
  isInfiniteMode = false,
  tableSort,
  handleTableSort,
  defaultSort,
  sortTableData,
  getAspectIcons,
  getDefaultAspectSortKey,
  getFormattedType,
  getAspectCombinationKey,
  getAspectCombinationDisplayName,
  getAspectCombinationIcons,
  deckCostSectionsExpanded,
  setDeckCostSectionsExpanded,
  deckAspectSectionsExpanded,
  setDeckAspectSectionsExpanded,
  sideboardAspectSectionsExpanded,
  setSideboardAspectSectionsExpanded,
  onCardHover,
  onCardLeave,
}: PoolListSectionProps) {
  let contextValue: ReturnType<typeof useDeckBuilder> | null = null
  try {
    contextValue = useDeckBuilder()
  } catch {
    contextValue = null
  }

  const moveCardToDeck = contextValue?.moveCardToDeck
  const moveCardToPool = contextValue?.moveCardToPool
  const moveCardsToDeck = contextValue?.moveCardsToDeck
  const moveCardsToPool = contextValue?.moveCardsToPool
  const showDeckAspectPenalties = contextValue?.showDeckAspectPenalties ?? contextValue?.showAspectPenalties ?? false
  const setShowDeckAspectPenalties = contextValue?.setShowDeckAspectPenalties ?? contextValue?.setShowAspectPenalties
  const showPoolAspectPenalties = contextValue?.showPoolAspectPenalties ?? false
  const setShowPoolAspectPenalties = contextValue?.setShowPoolAspectPenalties
  const cardMatchesFilters = contextValue?.cardMatchesFilters
  const isCardFilteredOut = (card: CardData) => cardMatchesFilters ? !cardMatchesFilters(card) : false

  const deckCardPositions: CardWithData[] = Object.entries(cardPositions)
    .filter(([_, pos]) => pos.section === 'deck' && pos.visible && !pos.card.isBase && !pos.card.isLeader && pos.enabled !== false)
    .map(([cardId, pos]) => ({ cardId, card: pos.card }))

  const sideboardCardPositions: CardWithData[] = Object.entries(cardPositions)
    .filter(([_, pos]) => (pos.section === 'sideboard' || pos.enabled === false) && pos.visible && !pos.card.isBase && !pos.card.isLeader)
    .map(([cardId, pos]) => ({ cardId, card: pos.card }))

  // Render card row for deck table
  const renderDeckCardRow = (cardId: string, card: CardData, idx: number, keyPrefix: string) => {
    const aspectSymbols = getAspectIcons(card)
    const filteredOut = isCardFilteredOut(card)
    return (
      <tr key={`${keyPrefix}-${cardId}-${idx}`} className={filteredOut ? 'filtered-out' : undefined}>
        <td>
          <input
            type="checkbox"
            checked={true}
            onChange={() => {
              if (moveCardToPool) {
                moveCardToPool(cardId)
                return
              }
              setCardPositions(prev => ({
                ...prev,
                [cardId]: { ...prev[cardId], section: 'sideboard', enabled: false }
              }))
            }}
          />
        </td>
        <td>
          <div className="card-name-cell">
            <div
              className="card-name-main"
              onMouseEnter={(e) => onCardHover(cardId, card, e)}
              onMouseLeave={onCardLeave}
            >
              {card.name || 'Unknown'}
            </div>
            {card.subtitle && !card.isBase && (
              <div className="card-name-subtitle">{card.subtitle}</div>
            )}
          </div>
        </td>
        <td>{getFormattedType(card)}</td>
        <td className="cost-cell"><CostIcon cost={card.cost} size={28} /></td>
        <td className="aspects-cell">
          {aspectSymbols && aspectSymbols.length > 0 ? aspectSymbols : <span>Neutral</span>}
        </td>
        <td style={{ color: getRarityColor(card.rarity) }}>{card.rarity || 'Unknown'}</td>
      </tr>
    )
  }

  // Render deck content: always group by aspect; sort within each group by cost then name.
  const renderDeckContent = () => {
    if (deckCardPositions.length === 0) return null

    // Initialize all aspect combinations
    const groupedByAspect: Record<string, CardWithData[]> = {}
    ASPECT_ORDER.forEach(key => {
      groupedByAspect[key] = []
    })

    // Group cards by aspect combination
    deckCardPositions.forEach(({ cardId, card }) => {
      const aspectKey = getAspectCombinationKey(card)
      if (!groupedByAspect[aspectKey]) {
        groupedByAspect[aspectKey] = []
      }
      groupedByAspect[aspectKey].push({ cardId, card })
    })

    // Filter to show segments that have cards or sideboard cards
    const sortedAspectKeys = ASPECT_ORDER.filter(aspectKey => {
      const cards = groupedByAspect[aspectKey] || []
      const hasSideboardCards = sideboardCardPositions.some(({ card }) =>
        getAspectCombinationKey(card) === aspectKey
      )
      return cards.length > 0 || hasSideboardCards
    })

    return sortedAspectKeys.map((aspectKey) => {
      const cards = groupedByAspect[aspectKey] || []
      const isExpanded = deckAspectSectionsExpanded[aspectKey] !== false

      // Sort cards within this aspect combination
      const sectionId = `deck-aspect-${aspectKey}`
      const sectionSort = tableSort[sectionId] || { field: null, direction: 'asc' as const }
      const sortedCards = [...cards].sort((a, b) => {
        if (sectionSort.field) {
          return sortTableData(a.card, b.card, sectionSort.field, sectionSort.direction)
        }
        return defaultSort(a.card, b.card)
      })

      // Check if all cards in this segment are enabled
      const allEnabled = sortedCards.length > 0 && sortedCards.every(({ cardId }) => {
        const position = cardPositions[cardId]
        return position && position.section === 'deck' && position.enabled !== false
      })

      return (
        <div key={aspectKey} className="deck-aspect-subsection">
          <h4
            className="pool-subsection-title"
            onClick={() => setDeckAspectSectionsExpanded(prev => ({ ...prev, [aspectKey]: !isExpanded }))}
            style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <span>{isExpanded ? '▼' : '▶'}</span>
            {getAspectCombinationIcons(aspectKey)}
            <span style={{ textTransform: 'uppercase' }}>{getAspectCombinationDisplayName(aspectKey)}</span>
            <span>({cards.length})</span>
          </h4>
          <div className={`list-section-content-wrapper ${isExpanded ? '' : 'collapsed'}`}>
            <table className="list-table">
              <ListTableHeader
                sectionId={sectionId}
                tableSort={tableSort}
                onSort={handleTableSort}
                columns={DECK_COLUMNS}
                checkboxChecked={allEnabled}
                onCheckboxChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const shouldEnable = e.target.checked
                  if (shouldEnable && moveCardsToDeck) {
                    if (sortedCards.length === 0) {
                      const matchingCardIds = Object.entries(cardPositions)
                        .filter(([_, position]) =>
                          (position.section === 'sideboard' || position.enabled === false) &&
                          position.visible &&
                          !position.card.isBase &&
                          !position.card.isLeader &&
                          getAspectCombinationKey(position.card) === aspectKey
                        )
                        .map(([cardId]) => cardId)
                      moveCardsToDeck(matchingCardIds)
                    } else {
                      moveCardsToDeck(sortedCards.map(({ cardId }) => cardId))
                    }
                    return
                  }
                  if (!shouldEnable && moveCardsToPool) {
                    moveCardsToPool(sortedCards.map(({ cardId }) => cardId))
                    return
                  }
                  setCardPositions(prev => {
                    const updated = { ...prev }

                    // If section is empty and we're enabling, restore all cards from sideboard
                    if (sortedCards.length === 0 && shouldEnable) {
                      Object.entries(prev).forEach(([cardId, position]) => {
                        if ((position.section === 'sideboard' || position.enabled === false) &&
                            position.visible &&
                            !position.card.isBase &&
                            !position.card.isLeader &&
                            getAspectCombinationKey(position.card) === aspectKey) {
                          updated[cardId] = {
                            ...position,
                            section: 'deck',
                            enabled: true,
                            x: 0,
                            y: 0
                          }
                        }
                      })
                    } else {
                      sortedCards.forEach(({ cardId }) => {
                        updated[cardId] = {
                          ...prev[cardId],
                          section: shouldEnable ? 'deck' : 'sideboard',
                          enabled: shouldEnable,
                          x: 0,
                          y: 0
                        }
                      })
                    }

                    return updated
                  })
                }}
              />
              <tbody>
                {sortedCards.map(({ cardId, card }, idx) =>
                  renderDeckCardRow(cardId, card, idx, `deck-${aspectKey}`)
                )}
              </tbody>
            </table>
          </div>
        </div>
      )
    })
  }

  // Render a single sideboard card row (checkbox unchecked → moves card to deck on toggle).
  const renderSideboardCardRow = (cardId: string, card: CardData, idx: number, keyPrefix: string) => {
    const aspectSymbols = getAspectIcons(card)
    const filteredOut = isCardFilteredOut(card)
    return (
      <tr
        key={`${keyPrefix}-${cardId}-${idx}`}
        className={filteredOut ? 'filtered-out' : undefined}
      >
        <td>
          <input
            type="checkbox"
            checked={false}
            onChange={() => {
              if (moveCardToDeck) {
                moveCardToDeck(cardId)
                return
              }
              setCardPositions(prev => ({
                ...prev,
                [cardId]: { ...prev[cardId], section: 'deck', enabled: true, x: 0, y: 0 }
              }))
            }}
          />
        </td>
        <td onMouseEnter={(e) => onCardHover(cardId, card, e)} onMouseLeave={onCardLeave}>
          <div className="card-name-cell">
            <div className="card-name-main" style={{ cursor: 'pointer' }}>
              {card.name || 'Unknown'}
            </div>
            {card.subtitle && !card.isBase && (
              <div className="card-name-subtitle">{card.subtitle}</div>
            )}
          </div>
        </td>
        <td className="cost-cell" onMouseEnter={(e) => onCardHover(cardId, card, e)} onMouseLeave={onCardLeave}><CostIcon cost={card.cost} size={28} /></td>
        <td className="aspects-cell" onMouseEnter={(e) => onCardHover(cardId, card, e)} onMouseLeave={onCardLeave}>
          {aspectSymbols && aspectSymbols.length > 0 ? aspectSymbols : <span>Neutral</span>}
        </td>
        <td style={{ color: getRarityColor(card.rarity) }} onMouseEnter={(e) => onCardHover(cardId, card, e)} onMouseLeave={onCardLeave}>{card.rarity || 'Unknown'}</td>
      </tr>
    )
  }

  // Render sideboard content: always group by aspect; sort within each group by cost then name.
  const renderSideboardContent = () => {
    if (sideboardCardPositions.length === 0) return null

    // Initialize all aspect combinations
    const groupedByAspect: Record<string, CardWithData[]> = {}
    ASPECT_ORDER.forEach(key => {
      groupedByAspect[key] = []
    })

    // Group sideboard cards by aspect combination
    sideboardCardPositions.forEach(({ cardId, card }) => {
      const aspectKey = getAspectCombinationKey(card)
      if (!groupedByAspect[aspectKey]) {
        groupedByAspect[aspectKey] = []
      }
      groupedByAspect[aspectKey].push({ cardId, card })
    })

    // Only render aspect groups that contain sideboard cards
    const sortedAspectKeys = ASPECT_ORDER.filter(aspectKey => (groupedByAspect[aspectKey] || []).length > 0)

    return sortedAspectKeys.map((aspectKey) => {
      const cards = groupedByAspect[aspectKey] || []
      const isExpanded = sideboardAspectSectionsExpanded[aspectKey] !== false

      const sectionId = `sideboard-aspect-${aspectKey}`
      const sectionSort = tableSort[sectionId] || { field: null, direction: 'asc' as const }
      const sortedCards = [...cards].sort((a, b) => {
        if (sectionSort.field) {
          return sortTableData(a.card, b.card, sectionSort.field, sectionSort.direction)
        }
        return defaultSort(a.card, b.card)
      })

      const handleHeaderCheckbox = (e: ChangeEvent<HTMLInputElement>) => {
        if (!e.target.checked) return
        const ids = sortedCards.map(({ cardId }) => cardId)
        if (moveCardsToDeck) {
          moveCardsToDeck(ids)
          return
        }
        setCardPositions(prev => {
          const updated = { ...prev }
          ids.forEach(cardId => {
            updated[cardId] = { ...prev[cardId], section: 'deck', enabled: true, x: 0, y: 0 }
          })
          return updated
        })
      }

      return (
        <div key={aspectKey} className="deck-aspect-subsection">
          <h4
            className="pool-subsection-title"
            onClick={() => setSideboardAspectSectionsExpanded(prev => ({ ...prev, [aspectKey]: !isExpanded }))}
            style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <span>{isExpanded ? '▼' : '▶'}</span>
            {getAspectCombinationIcons(aspectKey)}
            <span style={{ textTransform: 'uppercase' }}>{getAspectCombinationDisplayName(aspectKey)}</span>
            <span>({cards.length})</span>
          </h4>
          <div className={`list-section-content-wrapper ${isExpanded ? '' : 'collapsed'}`}>
            <table className="list-table">
              <ListTableHeader
                sectionId={sectionId}
                tableSort={tableSort}
                onSort={handleTableSort}
                columns={SIDEBOARD_COLUMNS}
                checkboxChecked={false}
                onCheckboxChange={handleHeaderCheckbox}
              />
              <tbody>
                {sortedCards.map(({ cardId, card }, idx) =>
                  renderSideboardCardRow(cardId, card, idx, `sideboard-${aspectKey}`)
                )}
              </tbody>
            </table>
          </div>
        </div>
      )
    })
  }

  return (
    <div className="list-section">
      <h2 className="list-section-title">Pool</h2>

      {/* Deck Section */}
      <div className="pool-subsection">
        <h3 id="deck-list-header" className="pool-subsection-title" style={{ userSelect: 'none' }}>
          Deck ({deckCardPositions.length})
        </h3>
        {renderDeckContent()}
      </div>

      {/* Sideboard Section */}
      <div className="pool-subsection">
        <h3 id="pool-list-header" className="pool-subsection-title" style={{ userSelect: 'none' }}>
          {isInfiniteMode ? 'Pool' : isDraftMode ? 'Card Pool' : 'Sideboard'} ({sideboardCardPositions.length})
        </h3>
        {renderSideboardContent()}
      </div>
    </div>
  )
}

export default PoolListSection
