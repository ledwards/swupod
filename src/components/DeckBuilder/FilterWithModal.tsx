// @ts-nocheck
/**
 * FilterWithModal Component
 *
 * Combines a filter button with the AspectFilterModal.
 * Used in both Deck and Pool section headers.
 * AspectFilterModal gets most props from DeckBuilderContext.
 */

import type { MouseEvent } from 'react'
import Button from '../Button'
import { AspectFilterModal } from './AspectFilterModal'
import type { BulkMoveMode } from './ArenaActionsBar'

export interface FilterWithModalProps {
  isOpen: boolean
  onToggle?: () => void
  onClose?: () => void
  mode?: BulkMoveMode
  cardCount?: number
  onFilterAspectsExpandedChange?: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void
}

export function FilterWithModal({
  isOpen,
  onToggle,
  onClose,
  mode = 'deck',
  cardCount,
  onFilterAspectsExpandedChange,
}: FilterWithModalProps) {
  return (
    <div style={{ position: 'relative' }}>
      <Button
        variant="toggle"
        glowColor="blue"
        active={isOpen}
        className="filter-button"
        onClick={(e: MouseEvent) => {
          e.stopPropagation()
          onToggle?.()
        }}
        title="Filter by Aspect"
        style={{ width: '28px', height: '28px', padding: '4px' }}
      >
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 5H17M5 10H15M7 15H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </Button>
      <AspectFilterModal
        isOpen={isOpen}
        onClose={onClose}
        mode={mode}
        onFilterAspectsExpandedChange={onFilterAspectsExpandedChange}
        cardCount={cardCount}
      />
    </div>
  )
}

export default FilterWithModal
