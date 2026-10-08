// @ts-nocheck
/**
 * SectionHeader Component
 *
 * Displays the header for Deck or Pool sections with:
 * - Expand/collapse toggle
 * - Section name with card count
 * - Sort controls
 * - Filter modal button
 * - Aspect penalty toggle
 * - Bulk move buttons
 *
 * Used by both Deck and Pool sections.
 * Can use DeckBuilderContext or receive props directly.
 */

import { SortControls } from './SortControls'
import type { SortOption } from './SortControls'
import { FilterWithModal } from './FilterWithModal'
import { AspectPenaltyToggle } from './AspectPenaltyToggle'
import type { CardPosition } from './AspectPenaltyToggle'
import { ArenaActionsBar } from './ArenaActionsBar'
import type { BulkMoveMode } from './ArenaActionsBar'
import { useDeckBuilder } from '../../contexts/DeckBuilderContext'

export interface SectionHeaderProps {
  id?: string
  title: string
  mode?: BulkMoveMode
  cardCount: number
  expanded: boolean
  onToggleExpanded: () => void
  sortOption?: SortOption
  onSortChange?: (value: SortOption) => void
  filterOpen: boolean
  onFilterToggle: () => void
  onFilterClose: () => void
  // Props with context fallback
  cardPositions?: Record<string, CardPosition>
  setCardPositions?: (fn: (prev: Record<string, CardPosition>) => Record<string, CardPosition>) => void
  activeLeader?: string | null
  activeBase?: string | null
  filterAspectsExpanded?: Record<string, boolean>
  onFilterAspectsExpandedChange?: (expanded: Record<string, boolean>) => void
  showAspectPenalties?: boolean
  setShowAspectPenalties?: (show: boolean) => void
}

export function SectionHeader({
  id,
  title,
  mode = 'deck',
  cardCount,
  expanded,
  onToggleExpanded,
  sortOption: sortOptionProp,
  onSortChange,
  filterOpen,
  onFilterToggle,
  onFilterClose,
  // Props with context fallback
  cardPositions: cardPositionsProp,
  setCardPositions: setCardPositionsProp,
  activeLeader: activeLeaderProp,
  activeBase: activeBaseProp,
  filterAspectsExpanded: filterAspectsExpandedProp,
  onFilterAspectsExpandedChange,
  showAspectPenalties: showAspectPenaltiesProp,
  setShowAspectPenalties: setShowAspectPenaltiesProp,
}: SectionHeaderProps) {
  // Try to get values from context
  let contextValue: ReturnType<typeof useDeckBuilder> | null = null
  try {
    contextValue = useDeckBuilder()
  } catch {
    // Not inside a provider
  }

  // Use props if provided, otherwise use context
  const cardPositions = cardPositionsProp ?? contextValue?.cardPositions ?? {}
  const setCardPositions = setCardPositionsProp ?? contextValue?.setCardPositions
  const activeLeader = activeLeaderProp ?? contextValue?.activeLeader
  const activeBase = activeBaseProp ?? contextValue?.activeBase
  const filterAspectsExpanded = filterAspectsExpandedProp ?? contextValue?.filterAspectsExpanded ?? {}
  const showAspectPenalties = showAspectPenaltiesProp ?? contextValue?.showAspectPenalties ?? false
  const setShowAspectPenalties = setShowAspectPenaltiesProp ?? contextValue?.setShowAspectPenalties
  // Sort option uses mode-specific context values
  const sortOption = sortOptionProp ?? (mode === 'deck' ? contextValue?.deckSortOption : contextValue?.poolSortOption)
  const containerStyle = {
    marginTop: '1.5rem',
    marginBottom: '0.75rem',
    paddingBottom: '0.25rem',
    borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
    userSelect: 'none' as const,
  }

  const titleRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '1.2rem',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.9)',
  }

  const controlsRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '0.5rem',
    flexWrap: 'wrap' as const,
  }

  return (
    <div id={id} style={containerStyle}>
      <div style={titleRowStyle}>
        <span
          style={{ cursor: 'pointer' }}
          onClick={onToggleExpanded}
        >
          {expanded ? '▼' : '▶'}
        </span>
        <span
          style={{ cursor: 'pointer' }}
          onClick={onToggleExpanded}
        >
          {title} ({cardCount})
        </span>
      </div>
      <div style={controlsRowStyle}>
        <SortControls
          value={sortOption}
          onChange={onSortChange}
          className=""
        />
        <FilterWithModal
          isOpen={filterOpen}
          onToggle={onFilterToggle}
          onClose={onFilterClose}
          mode={mode}
          onFilterAspectsExpandedChange={onFilterAspectsExpandedChange}
          cardCount={cardCount}
        />
        <AspectPenaltyToggle sortOption={sortOption || 'aspect'} />
        <ArenaActionsBar mode={mode} />
      </div>
    </div>
  )
}

export default SectionHeader
