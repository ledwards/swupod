// @ts-nocheck
/**
 * SelectionListSection Component
 *
 * Renders a list view section for Leaders or Bases with radio selection.
 * Used in List View mode for selecting the active leader or base.
 */

import type { ReactNode, MouseEvent, ChangeEvent } from 'react'
import { ListTableHeader } from './ListTableHeader'
import type { TableSortMap } from './ListTableHeader'
import CostIcon from '../CostIcon'
import { getRarityColor } from '../../utils/aspectColors'

interface CardData {
  name?: string
  subtitle?: string
  cost?: number
  rarity?: string
  isBase?: boolean
  [key: string]: unknown
}

interface CardPosition {
  cardId: string
  card: CardData
}

export interface SelectionListSectionProps {
  title: string
  headerId?: string
  sectionId: string
  radioName: string
  positions: CardPosition[]
  selectedId: string | null
  onSelect: (cardId: string | null) => void
  tableSort: TableSortMap
  onSort: (sectionId: string, field: string) => void
  defaultSort: (a: CardData, b: CardData) => number
  sortTableData: (a: CardData, b: CardData, field: string, direction: 'asc' | 'desc') => number
  expanded: boolean
  onToggleExpanded: () => void
  getAspectIcons: (card: CardData) => ReactNode[]
  onCardHover: (cardId: string, card: CardData, e: MouseEvent) => void
  onCardLeave: () => void
  onAddStarterLeaders?: () => void
  hasStarterLeaders?: boolean
}

export function SelectionListSection({
  title,
  headerId,
  sectionId,
  radioName,
  positions,
  selectedId,
  onSelect,
  tableSort,
  onSort,
  defaultSort,
  sortTableData,
  expanded,
  onToggleExpanded,
  getAspectIcons,
  onCardHover,
  onCardLeave,
  onAddStarterLeaders,
  hasStarterLeaders = false,
}: SelectionListSectionProps) {
  const sectionSort = tableSort[sectionId] || { field: null, direction: 'asc' as const }

  const sortedPositions = [...positions].sort((a, b) => {
    if (!sectionSort.field) {
      return defaultSort(a.card, b.card)
    }
    return sortTableData(a.card, b.card, sectionSort.field, sectionSort.direction)
  })

  return (
    <div className="list-section">
      <h2
        id={headerId}
        className="list-section-title"
        onClick={onToggleExpanded}
        style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center' }}
      >
        <span style={{ marginRight: '0.5rem' }}>{expanded ? '▼' : '▶'}</span>
        {title} ({positions.length})
        {onAddStarterLeaders && (
          <button
            className="add-starter-leaders-button"
            onClick={(e) => {
              e.stopPropagation()
              onAddStarterLeaders()
            }}
            title={hasStarterLeaders ? "Remove starter deck leaders" : "Add the Hyperspace versions of this set's starter deck leaders"}
          >
            {hasStarterLeaders ? '- Starter Leaders' : '+ Starter Leaders'}
          </button>
        )}
      </h2>
      {expanded && positions.length > 0 && (
        <table className="list-table">
          <ListTableHeader
            sectionId={sectionId}
            tableSort={tableSort}
            onSort={onSort}
            columns={[
              { field: 'name', label: 'Title' },
              { field: 'cost', label: 'Cost' },
              { field: 'aspects', label: 'Aspects' },
              { field: 'rarity', label: 'Rarity' },
            ]}
            checkboxVisible={false}
          />
          <tbody>
            {sortedPositions.map(({ cardId, card }, idx) => {
              const aspectSymbols = getAspectIcons(card)
              const isSelected = selectedId === cardId
              return (
                <tr key={`${sectionId}-${cardId}-${idx}`}>
                  <td>
                    <input
                      type="radio"
                      name={radioName}
                      checked={isSelected}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        if (e.target.checked) {
                          onSelect(cardId)
                        } else {
                          onSelect(null)
                        }
                      }}
                    />
                  </td>
                  <td onMouseEnter={(e) => onCardHover(cardId, card, e)} onMouseLeave={onCardLeave}>
                    <div className="card-name-cell">
                      <div
                        className="card-name-main"
                        style={{ cursor: 'pointer' }}
                      >
                        {card.name || 'Unknown'}
                      </div>
                      {card.subtitle && !card.isBase && (
                        <div className="card-name-subtitle">{card.subtitle}</div>
                      )}
                    </div>
                  </td>
                  <td className="cost-cell" onMouseEnter={(e) => onCardHover(cardId, card, e)} onMouseLeave={onCardLeave}>
                    <CostIcon cost={card.cost} size={28} />
                  </td>
                  <td className="aspects-cell" onMouseEnter={(e) => onCardHover(cardId, card, e)} onMouseLeave={onCardLeave}>
                    {aspectSymbols && aspectSymbols.length > 0 ? aspectSymbols : <span>Neutral</span>}
                  </td>
                  <td style={{ color: getRarityColor(card.rarity) }} onMouseEnter={(e) => onCardHover(cardId, card, e)} onMouseLeave={onCardLeave}>{card.rarity || 'Unknown'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default SelectionListSection
