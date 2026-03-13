// @ts-nocheck
/**
 * PackSelector Component
 *
 * Shared pack selection UI for other format modes:
 * - Chaos Draft (multi-select, up to 3)
 * - Chaos Sealed (multi-select, up to 6)
 * - Pack Wars (single select)
 * - Pack Blitz (single select)
 *
 * Displays packs in a grid that fits 6 per row on desktop, 3 on mobile.
 */

import { getPackImageUrl } from '@/src/utils/packArt'
import { getSetConfig } from '@/src/utils/setConfigs'
import { isSetBeta, isSetPrerelease } from '@/src/utils/api'
import { getBaseCode, sortSetsForDisplay } from '@/src/utils/packSelectorSort'
import type { SetData } from '@/src/utils/packSelectorSort'
import './PackSelector.css'

// Get set color from config
function getSetColor(setCode: string): string {
  const config = getSetConfig(getBaseCode(setCode))
  return config?.color || '#ffffff'
}

export interface PackSelectorProps {
  sets: SetData[]
  /** For single select mode */
  selectedSet?: string | null
  onSelectSet?: (setCode: string) => void
  /** For multi-select mode */
  selectedSets?: string[]
  onSelectSets?: (setCodes: string[]) => void
  maxSelections?: number
  /** Whether to show +/- buttons for multi-select */
  showQuantityControls?: boolean
  title?: string
}

export function PackSelector({
  sets,
  selectedSet,
  onSelectSet,
  selectedSets = [],
  onSelectSets,
  maxSelections = 1,
  showQuantityControls = false,
  title = 'Select a Set',
}: PackSelectorProps) {
  const isMultiSelect = maxSelections > 1

  // Count how many times each set is selected (for multi-select)
  const getSetCount = (setCode: string) => {
    return selectedSets.filter(s => s === setCode).length
  }

  const handleSetClick = (setCode: string) => {
    if (isMultiSelect && onSelectSets) {
      const count = getSetCount(setCode)
      if (count === 0) {
        // First click: add the set
        if (selectedSets.length < maxSelections) {
          onSelectSets([...selectedSets, setCode])
        }
      } else {
        // Already selected: remove all instances
        onSelectSets(selectedSets.filter(s => s !== setCode))
      }
    } else if (onSelectSet) {
      onSelectSet(setCode)
    }
  }

  const handleAddOne = (setCode: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (onSelectSets && selectedSets.length < maxSelections) {
      onSelectSets([...selectedSets, setCode])
    }
  }

  const handleRemoveOne = (setCode: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (onSelectSets) {
      const index = selectedSets.indexOf(setCode)
      if (index > -1) {
        onSelectSets([...selectedSets.slice(0, index), ...selectedSets.slice(index + 1)])
      }
    }
  }

  const sortedSets = sortSetsForDisplay(sets)

  const renderSetButton = (set: SetData) => {
    const isSelected = isMultiSelect ? getSetCount(set.code) > 0 : selectedSet === set.code
    const count = getSetCount(set.code)
    const setColor = getSetColor(set.code)
    const packImageUrl = getPackImageUrl(set.code)

    // In single-select mode, mark unselected packs when one is selected
    const isUnselected = !isMultiSelect && selectedSet !== null && selectedSet !== set.code
    // In multi-select mode, mark unselected packs when max is reached
    const isMaxed = isMultiSelect && !isSelected && selectedSets.length >= maxSelections

    return (
      <div
        key={set.code}
        role="button"
        tabIndex={0}
        className={`pack-selector-button ${isSelected ? 'selected' : ''} ${isUnselected ? 'unselected' : ''} ${isMaxed ? 'maxed' : ''}`}
        onClick={() => handleSetClick(set.code)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSetClick(set.code) }}
        style={{
          '--set-color': setColor,
        } as React.CSSProperties}
      >
        <div className="pack-selector-image">
          <img src={packImageUrl} alt={set.name} />
          {showQuantityControls && isSelected && (
            <div className="pack-selector-badge">
              <button
                className={`pack-selector-qty-btn ${count <= 1 ? 'hidden' : ''}`}
                onClick={(e) => handleRemoveOne(set.code, e)}
              >
                −
              </button>
              <span className="pack-selector-count">{count}</span>
              <button
                className={`pack-selector-qty-btn ${selectedSets.length >= maxSelections ? 'hidden' : ''}`}
                onClick={(e) => handleAddOne(set.code, e)}
              >
                +
              </button>
            </div>
          )}
        </div>
        <div className="pack-selector-content">
          <span className="pack-selector-name">{set.name}</span>
        </div>
        {isSetBeta(set) && <span className="pack-selector-beta">Beta</span>}
        {isSetPrerelease(set) && <span className="pack-selector-beta">Pre-Release</span>}
      </div>
    )
  }

  return (
    <div className="pack-selector-section">
      <h3>{title}</h3>
      <div className="pack-selector-grid">
        {sortedSets.main.map(renderSetButton)}
      </div>
      {sortedSets.carbonite.length > 0 && (
        <div className="pack-selector-grid carbonite-row">
          {sortedSets.carbonite.map(renderSetButton)}
        </div>
      )}
    </div>
  )
}

export default PackSelector
