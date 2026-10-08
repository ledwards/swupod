// @ts-nocheck
/**
 * SortControls Component
 *
 * Displays sort/grouping buttons for card sections.
 * Used by both Pool and Deck headers.
 *
 * Options:
 * - default: Single flat container
 * - aspect: Group by aspect combination
 * - cost: Group by mana cost
 * - type: Group by card type
 */

import type { MouseEvent } from 'react'
import Button from '../Button'

export type SortOption = 'default' | 'aspect' | 'cost' | 'type'

export interface SortControlsProps {
  value?: SortOption
  onChange?: (value: SortOption) => void
  className?: string
}

export function SortControls({
  value = 'aspect',
  onChange,
  className = '',
}: SortControlsProps) {
  return (
    <div className={`inline-sort-controls ${className}`} style={{ display: 'flex', gap: '4px' }}>
      {/* Default (single container) */}
      <Button
        variant="toggle"
        glowColor="blue"
        active={value === 'default'}
        className="sort-button-icon"
        onClick={(e: MouseEvent) => { e.stopPropagation(); onChange?.('default'); }}
        title="Default (single container)"
        style={{ opacity: value === 'default' ? 1 : 0.5, width: '28px', height: '28px', padding: '4px' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      </Button>

      {/* Group by Aspect */}
      <Button
        variant="toggle"
        glowColor="blue"
        active={value === 'aspect'}
        className="sort-button-icon"
        onClick={(e: MouseEvent) => { e.stopPropagation(); onChange?.('aspect'); }}
        title="Group by Aspect"
        style={{ opacity: value === 'aspect' ? 1 : 0.5, width: '28px', height: '28px', padding: '4px' }}
      >
        <img src="/icons/heroism.png" alt="Aspect" style={{ width: '20px', height: '20px', display: 'block' }} />
      </Button>

      {/* Group by Cost */}
      <Button
        variant="toggle"
        glowColor="blue"
        active={value === 'cost'}
        className="sort-button-icon"
        onClick={(e: MouseEvent) => { e.stopPropagation(); onChange?.('cost'); }}
        title="Group by Cost"
        style={{ opacity: value === 'cost' ? 1 : 0.5, width: '28px', height: '28px', padding: '4px' }}
      >
        <div style={{ position: 'relative', width: '20px', height: '20px' }}>
          <img src="/icons/cost.png" alt="Cost" style={{ width: '20px', height: '20px', display: 'block' }} />
          <span style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '11px',
            textShadow: '1px 1px 2px rgba(0, 0, 0, 0.8)'
          }}>
            3
          </span>
        </div>
      </Button>

      {/* Group by Type */}
      <Button
        variant="toggle"
        glowColor="blue"
        active={value === 'type'}
        className="sort-button-icon"
        onClick={(e: MouseEvent) => { e.stopPropagation(); onChange?.('type'); }}
        title="Group by Type"
        style={{ opacity: value === 'type' ? 1 : 0.5, width: '28px', height: '28px', padding: '4px' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </Button>
    </div>
  )
}

export default SortControls
